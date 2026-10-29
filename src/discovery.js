// -----------------------------------------------------------------------------
// AirPlay speaker discovery and the Gladys device payload.
//
// The integration container runs on a Docker bridge network: mDNS never
// reaches it. The Gladys core browses the two DNS-SD services declared in the
// manifest `network_discovery` field on its behalf (`scanNetwork('mdns')`)
// and relays the raw records; this module interprets them:
//   - `_airplay._tcp`: instance `Kitchen`, TXT `deviceid=AA:BB:…`,
//     `features=0x…,0x…`, `model=…` (AirPlay 2 receivers, Apple TV, HomePod);
//   - `_raop._tcp`: instance `AABBCCDDEEFF@Kitchen`, TXT `am=…`, `et=…` (the
//     audio endpoint, AirPlay 1 receivers included).
// A speaker announcing both is merged on its MAC address. The TXT entries the
// sender needs to pick its lane (`features`, `model`, `et`) are kept, and
// stored in the device params.

// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  parseMdnsTxt,
} from '@gladysassistant/integration-sdk';
import { readCapabilities } from '@sonn-audio/node-airplay';
import { PROTOCOLS } from './config.js';

export const AIRPLAY_SERVICE = '_airplay._tcp';
export const RAOP_SERVICE = '_raop._tcp';

// Device type of the external ids: `ext:<selector>:speaker:<mac>`. External
// ids are forever: Gladys keys the device, its scenes and dashboards on them.
export const DEVICE_TYPE = 'speaker';

// Feature keys: the music feature types, the convention publishNowPlaying
// follows by default (`<device external_id>:<type>`).
export const FEATURES = {
  PLAY_NOTIFICATION: DEVICE_FEATURE_TYPES.MUSIC.PLAY_NOTIFICATION,
  VOLUME: DEVICE_FEATURE_TYPES.MUSIC.VOLUME,
  PLAYBACK_STATE: DEVICE_FEATURE_TYPES.MUSIC.PLAYBACK_STATE,
  TITLE: DEVICE_FEATURE_TYPES.MUSIC.TITLE,
};

// Device params stored by Gladys: they let the integration reach a created
// speaker right after a restart, before the first scan answers.
export const PARAMS = {
  IP_ADDRESS: 'IP_ADDRESS',
  PORT: 'PORT',
  PROTOCOL: 'PROTOCOL',
  MODEL: 'MODEL',
  FEATURES: 'FEATURES',
  ENCRYPTION_TYPES: 'ENCRYPTION_TYPES',
};

// RAOP port of the receivers that announce none (AirPlay 1 default).
const DEFAULT_RAOP_PORT = 5000;

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * @description `AA:BB:CC:DD:EE:FF` or `AABBCCDDEEFF` → `aabbccddeeff`.
 * @param {unknown} value - Raw MAC address.
 * @returns {string|null} Normalized MAC, or null when it is not one.
 */
export function normalizeMac(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const hex = value.replace(/[:-]/g, '').toLowerCase();
  return /^[0-9a-f]{12}$/.test(hex) ? hex : null;
}

/**
 * @description Whether the `features` TXT entry (`0xLOW,0xHIGH` or `0xVALUE`)
 * announces AirPlay 2 (bit 38, unified media control, or bit 48, CoreUtils
 * pairing — the library's own reading).
 * @param {unknown} features - Raw `features` TXT value.
 * @returns {boolean} True for an AirPlay 2 receiver.
 */
export function supportsAirplay2(features) {
  if (typeof features !== 'string') {
    return false;
  }
  try {
    return readCapabilities({ features }).supportsAirPlay2;
  } catch {
    return false;
  }
}

const pickIpv4 = (addresses) =>
  (addresses ?? []).find((address) => {
    const match = IPV4.exec(address);
    return match && match.slice(1).every((part) => Number(part) <= 255);
  }) ?? null;

const slug = (value) =>
  String(value)
    .toLowerCase()
    .replace(/\.local\.?$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

// Instance name of a DNS-SD record: `Kitchen._airplay._tcp.local` → `Kitchen`.
function instanceOf(name, service) {
  const suffix = `.${service}.local`;
  if (typeof name !== 'string') {
    return null;
  }
  const trimmed = name.endsWith('.') ? name.slice(0, -1) : name;
  return trimmed.endsWith(suffix) ? trimmed.slice(0, -suffix.length) : null;
}

/**
 * @description Turn the raw results of an `mdns` scan into AirPlay speakers.
 * @param {Array<{name: string, host: string|null, addresses: string[], port: number|null, txt: string[]}>} results
 * - Raw records relayed by the core.
 * @returns {Array<object>} Speakers, sorted by name: `{ id, name, address,
 * airplayPort, raopPort, airplay2, model, features, encryptionTypes,
 * passwordRequired }`.
 */
export function parseScanResults(results) {
  const speakers = new Map();
  for (const result of results ?? []) {
    const address = pickIpv4(result?.addresses);
    if (!address) {
      continue;
    }
    const txt = parseMdnsTxt(result.txt);
    const airplayInstance = instanceOf(result.name, AIRPLAY_SERVICE);
    const raopInstance = airplayInstance === null ? instanceOf(result.name, RAOP_SERVICE) : null;
    if (airplayInstance === null && raopInstance === null) {
      continue;
    }

    let mac;
    let name;
    if (airplayInstance !== null) {
      mac = normalizeMac(txt.deviceid);
      name = airplayInstance;
    } else {
      const at = raopInstance.indexOf('@');
      mac = at > 0 ? normalizeMac(raopInstance.slice(0, at)) : null;
      name = at > 0 ? raopInstance.slice(at + 1) : raopInstance;
    }
    // Without a MAC (rare), the host name is the most stable id left.
    const id = mac ?? slug(result.host ?? address);
    if (!id) {
      continue;
    }

    const speaker = speakers.get(id) ?? {
      id,
      name,
      address,
      airplayPort: null,
      raopPort: null,
      airplay2: false,
      model: null,
      features: null,
      encryptionTypes: null,
      passwordRequired: false,
    };
    speaker.address = address;
    if (airplayInstance !== null) {
      // The `_airplay._tcp` instance carries the name the user gave the
      // speaker in the Home app, without the MAC prefix.
      speaker.name = name;
      speaker.airplayPort = result.port ?? null;
      speaker.airplay2 = speaker.airplay2 || supportsAirplay2(txt.features);
      speaker.model = typeof txt.model === 'string' ? txt.model : speaker.model;
      speaker.features = typeof txt.features === 'string' ? txt.features : speaker.features;
    } else {
      speaker.raopPort = result.port ?? null;
      speaker.model = speaker.model ?? (typeof txt.am === 'string' ? txt.am : null);
      // `ft` is the RAOP spelling of `features`; `et` lists the encryption
      // types, a `4` asking for the MFi exchange before the SETUP.
      speaker.features = speaker.features ?? (typeof txt.ft === 'string' ? txt.ft : null);
      speaker.encryptionTypes = typeof txt.et === 'string' ? txt.et : null;
    }
    speaker.passwordRequired =
      speaker.passwordRequired || txt.pw === 'true' || txt.pw === true || txt.pw === '1';
    speakers.set(id, speaker);
  }
  return [...speakers.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * @description The protocol and port used to stream to a speaker (the
 * sender reads the rest — model, features, et — from the speaker itself).
 * @param {object} speaker - Parsed speaker.
 * @param {string} protocol - Configured protocol (`auto`, `airplay2`, `airplay1`).
 * @returns {{ airplay2: boolean, port: number }} Connection settings.
 */
export function connectionOf(speaker, protocol) {
  const airplay2 =
    protocol === PROTOCOLS.AIRPLAY_2 || (protocol === PROTOCOLS.AUTO && speaker.airplay2 === true);
  const port = airplay2
    ? (speaker.airplayPort ?? speaker.raopPort ?? DEFAULT_RAOP_PORT)
    : (speaker.raopPort ?? speaker.airplayPort ?? DEFAULT_RAOP_PORT);
  return { airplay2, port };
}

/**
 * @description The Gladys discovery payload of a speaker.
 * @param {object} gladys - SDK client.
 * @param {object} speaker - Parsed speaker.
 * @param {object} config - Normalized configuration.
 * @returns {object} Device payload for publishDiscoveredDevices.
 */
export function buildDevice(gladys, speaker, config) {
  const ids = gladys.externalIds(DEVICE_TYPE, speaker.id);
  const { airplay2, port } = connectionOf(speaker, config.protocol);
  const music = DEVICE_FEATURE_CATEGORIES.MUSIC;
  return {
    name: speaker.name,
    external_id: ids.device,
    // Event-driven: nothing to poll, the availability monitor runs on its
    // own timer (see src/availability.js).
    should_poll: false,
    params: [
      { name: PARAMS.IP_ADDRESS, value: speaker.address },
      { name: PARAMS.PORT, value: String(port) },
      { name: PARAMS.PROTOCOL, value: airplay2 ? PROTOCOLS.AIRPLAY_2 : PROTOCOLS.AIRPLAY_1 },
      ...(speaker.model ? [{ name: PARAMS.MODEL, value: speaker.model }] : []),
      ...(speaker.features ? [{ name: PARAMS.FEATURES, value: speaker.features }] : []),
      ...(speaker.encryptionTypes
        ? [{ name: PARAMS.ENCRYPTION_TYPES, value: speaker.encryptionTypes }]
        : []),
    ],
    features: [
      {
        // The feature the core "Play a notification" scene action looks
        // for: it receives the URL of the synthesized speech.
        name: 'Notification',
        external_id: ids.feature(FEATURES.PLAY_NOTIFICATION),
        category: music,
        type: DEVICE_FEATURE_TYPES.MUSIC.PLAY_NOTIFICATION,
        read_only: false,
        has_feedback: false,
        keep_history: false,
        min: 1,
        max: 1,
      },
      {
        // AirPlay cannot read the volume of an idle speaker: this is the
        // volume the integration plays at, applied live during a playback.
        name: 'Volume',
        external_id: ids.feature(FEATURES.VOLUME),
        category: music,
        type: DEVICE_FEATURE_TYPES.MUSIC.VOLUME,
        unit: DEVICE_FEATURE_UNITS.PERCENT,
        read_only: false,
        has_feedback: true,
        keep_history: false,
        min: 0,
        max: 100,
      },
      {
        name: 'Playback state',
        external_id: ids.feature(FEATURES.PLAYBACK_STATE),
        category: music,
        type: DEVICE_FEATURE_TYPES.MUSIC.PLAYBACK_STATE,
        read_only: true,
        has_feedback: true,
        keep_history: false,
        min: 0,
        max: 3,
      },
      {
        name: 'Now playing',
        external_id: ids.feature(FEATURES.TITLE),
        category: music,
        type: DEVICE_FEATURE_TYPES.MUSIC.TITLE,
        read_only: true,
        has_feedback: true,
        keep_history: false,
        min: 0,
        max: 0,
      },
    ],
  };
}

/**
 * @description Rebuild a speaker from the params Gladys stored on a created
 * device (used before the first scan answers, or when the speaker is asleep
 * and missing from the scan).
 * @param {object} device - Gladys device (`external_id`, `name`, `params`).
 * @param {string} platformId - Speaker id, from its external id.
 * @returns {object|null} Speaker, or null when the params are incomplete.
 */
export function speakerFromDevice(device, platformId) {
  const params = Object.fromEntries((device.params ?? []).map(({ name, value }) => [name, value]));
  const address = params[PARAMS.IP_ADDRESS];
  const port = Number(params[PARAMS.PORT]);
  if (!address || !Number.isInteger(port) || port <= 0) {
    return null;
  }
  const airplay2 =
    params[PARAMS.PROTOCOL] === PROTOCOLS.AIRPLAY_2 || supportsAirplay2(params[PARAMS.FEATURES]);
  return {
    id: platformId,
    name: device.name,
    address,
    airplayPort: airplay2 ? port : null,
    raopPort: airplay2 ? null : port,
    airplay2,
    model: params[PARAMS.MODEL] ?? null,
    features: params[PARAMS.FEATURES] ?? null,
    encryptionTypes: params[PARAMS.ENCRYPTION_TYPES] ?? null,
    passwordRequired: false,
  };
}
