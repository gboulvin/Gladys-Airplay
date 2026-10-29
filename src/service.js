// -----------------------------------------------------------------------------
// The AirPlay service: what the Gladys handlers (src/app.js), the scene
// actions (src/scenes.js) and the dashboard widget (src/widgets.js) share.
//
// It owns the speakers seen by the last scans, the playback engine, the
// volumes and the reachability monitor, and resolves a device external id
// into "where and how to stream".
// -----------------------------------------------------------------------------

import { createLogger, MUSIC_PLAYBACK_STATE } from '@gladysassistant/integration-sdk';
import { createAvailabilityMonitor } from './availability.js';
import { DEFAULT_CONFIG } from './config.js';
import {
  DEVICE_TYPE,
  FEATURES,
  buildDevice,
  connectionOf,
  parseScanResults,
  speakerFromDevice,
} from './discovery.js';
import { createPlaybackManager, PlaybackError } from './player.js';
import { SOUNDS, synthesize } from './sounds.js';
import { createVolumeStore } from './store.js';

const logger = createLogger({ name: 'airplay' });

// mDNS listen window of a scan (1-30 s): AirPlay receivers answer within a
// second or two, sleeping ones a bit later.
export const SCAN_TIMEOUT_SECONDS = 5;

export class SpeakerNotFoundError extends Error {
  constructor(externalId) {
    super(`Unknown AirPlay speaker: ${externalId}`);
    this.name = 'SpeakerNotFoundError';
  }
}

/**
 * @description A readable title for a URL: its file name, else its host.
 * @param {string} url - Audio URL.
 * @returns {string} Title, ≤ 200 characters.
 */
export function titleOfUrl(url) {
  try {
    const { pathname, hostname } = new URL(url);
    const file = decodeURIComponent(pathname.split('/').filter(Boolean).at(-1) ?? '');
    return (file || hostname).slice(0, 200);
  } catch {
    return '';
  }
}

/**
 * @description Create the AirPlay service.
 * @param {object} gladys - SDK client.
 * @param {object} [deps] - Injected dependencies (tests): startSender, spawn,
 * probe, dataDir.
 * @returns {object} The service.
 */
export function createAirplayService(gladys, deps = {}) {
  let config = { ...DEFAULT_CONFIG };
  // Speakers seen by the scans, by platform id (MAC).
  const scanned = new Map();
  const volumes = createVolumeStore(deps.dataDir);
  const availability = createAvailabilityMonitor({ probe: deps.probe });
  const player = createPlaybackManager({
    startSender: deps.startSender,
    spawn: deps.spawn,
    onStateChange: (externalId, { playing, title }) => {
      if (playing) {
        // A speaker that plays is reachable, whatever the last check said.
        availability.observe(externalId, true);
      }
      gladys
        .publishNowPlaying(externalId, {
          playback_state: playing ? MUSIC_PLAYBACK_STATE.PLAYING : MUSIC_PLAYBACK_STATE.IDLE,
          title,
        })
        .catch((err) => logger.warn(`Unable to publish the playback state of ${externalId}`, err));
      deps.onPlaybackChange?.(externalId, playing);
    },
  });

  const devicePrefix = () => `${gladys.externalId(DEVICE_TYPE)}:`;
  const platformIdOf = (externalId) =>
    typeof externalId === 'string' && externalId.startsWith(devicePrefix())
      ? externalId.slice(devicePrefix().length)
      : null;

  // The speakers the user created in Gladys (SDK-maintained list).
  const createdDevices = () =>
    (gladys.devices ?? []).filter((device) => platformIdOf(device.external_id) !== null);

  /**
   * @description Where and how to reach a speaker: the last scan wins (a
   * DHCP lease may have moved it), the params stored by Gladys otherwise.
   * @param {string} externalId - Device external id.
   * @returns {object} `{ externalId, name, address, port, airplay2 }`.
   */
  function resolveTarget(externalId) {
    const platformId = platformIdOf(externalId);
    const device = createdDevices().find((created) => created.external_id === externalId);
    const speaker =
      (platformId && scanned.get(platformId)) ||
      (device && platformId ? speakerFromDevice(device, platformId) : null);
    if (!speaker) {
      throw new SpeakerNotFoundError(externalId);
    }
    const { airplay2, port } = connectionOf(speaker, config.protocol);
    return {
      externalId,
      // The name the user gave the device in Gladys.
      name: device?.name ?? speaker.name,
      address: speaker.address,
      port,
      airplay2,
    };
  }

  const volumeOf = (externalId) => volumes.get(externalId) ?? config.default_volume;

  function play(externalId, source, { volume, title }) {
    const target = resolveTarget(externalId);
    return {
      target,
      ...player.play(target, source, {
        volume: volume ?? volumeOf(externalId),
        title,
        maxDurationSeconds: config.max_duration,
        senderName: config.sender_name,
        password: config.airplay_password,
      }),
    };
  }

  return {
    get config() {
      return config;
    },

    setConfig(newConfig) {
      config = newConfig;
    },

    loadVolumes() {
      return volumes.load();
    },

    platformIdOf,
    createdDevices,
    resolveTarget,
    volumeOf,

    /**
     * @description Browse the network for AirPlay speakers (through the core).
     * @returns {Promise<object[]>} Parsed speakers.
     */
    async scan() {
      const results = await gladys.scanNetwork('mdns', { timeoutSeconds: SCAN_TIMEOUT_SECONDS });
      const speakers = parseScanResults(results);
      for (const speaker of speakers) {
        scanned.set(speaker.id, speaker);
      }
      logger.info(`Scan: ${speakers.length} AirPlay speaker(s) found`);
      return speakers;
    },

    /**
     * @description Discovery payload: the scanned speakers, plus the
     * created ones the scan missed (asleep), so publishing the list never
     * hides a device the user owns.
     * @returns {object[]} Devices for publishDiscoveredDevices.
     */
    discoveredDevices() {
      const speakers = new Map(scanned);
      for (const device of createdDevices()) {
        const platformId = platformIdOf(device.external_id);
        if (!speakers.has(platformId)) {
          const speaker = speakerFromDevice(device, platformId);
          if (speaker) {
            speakers.set(platformId, speaker);
          }
        }
      }
      return [...speakers.values()].map((speaker) => buildDevice(gladys, speaker, config));
    },

    /**
     * @description Play an audio URL (a text-to-speech clip, a radio, a sound file).
     * @param {string} externalId - Device external id.
     * @param {string} url - http(s) audio URL.
     * @param {object} [options] - `{ volume, title }`.
     * @returns {object} `{ target, started, finished }`.
     */
    playUrl(externalId, url, { volume, title } = {}) {
      return play(externalId, { url }, { volume, title: title ?? titleOfUrl(url) });
    },

    /**
     * @description Play a built-in chime.
     * @param {string} externalId - Device external id.
     * @param {string} [sound] - One of SOUNDS.
     * @param {object} [options] - `{ volume }`.
     * @returns {object} `{ target, started, finished }`.
     */
    playChime(externalId, sound = SOUNDS.NOTIFICATION, { volume } = {}) {
      return play(externalId, { pcm: synthesize(sound) }, { volume, title: `Chime (${sound})` });
    },

    stop(externalId) {
      return player.stop(externalId);
    },

    stopAll() {
      player.stopAll();
    },

    isPlaying(externalId) {
      return player.isPlaying(externalId);
    },

    isOnline(externalId) {
      return availability.isOnline(externalId);
    },

    /**
     * @description Change the volume of a speaker: stored, applied live
     * when it is playing, and confirmed to Gladys.
     * @param {string} externalId - Device external id.
     * @param {number} value - Requested volume.
     * @returns {Promise<number>} The applied volume (0-100).
     */
    async setVolume(externalId, value) {
      const volume = Math.min(100, Math.max(0, Math.round(Number(value))));
      if (!Number.isFinite(volume)) {
        throw new PlaybackError('INVALID_VOLUME', `Invalid volume: ${value}`);
      }
      await volumes.set(externalId, volume);
      player.setVolume(externalId, volume);
      await gladys.publishState(`${externalId}:${FEATURES.VOLUME}`, volume);
      return volume;
    },

    /**
     * @description Publish the volume and an idle "now playing" of every
     * created speaker (after a (re)connection: nothing plays then).
     */
    async publishInitialStates() {
      const devices = createdDevices();
      if (devices.length === 0) {
        return;
      }
      await gladys.publishChangedStates(
        devices.map((device) => ({
          device_feature_external_id: `${device.external_id}:${FEATURES.VOLUME}`,
          state: volumeOf(device.external_id),
        })),
      );
      for (const device of devices) {
        if (!player.isPlaying(device.external_id)) {
          await gladys.publishNowPlaying(device.external_id, {
            playback_state: MUSIC_PLAYBACK_STATE.IDLE,
            title: '',
          });
        }
      }
    },

    /**
     * @description Check the reachability of every created speaker.
     * @returns {Promise<Array<{externalId: string, online: boolean}>>} Results.
     */
    async checkAvailability() {
      const targets = [];
      for (const device of createdDevices()) {
        try {
          targets.push(resolveTarget(device.external_id));
        } catch {
          // Created from an older scan and never seen since: nothing to probe.
        }
      }
      return availability.check(gladys, targets);
    },
  };
}
