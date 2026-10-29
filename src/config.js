// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys from the `config_schema` of
// `gladys-assistant-integration.json`. This module provides the defaults and
// normalizes the received object (form values may arrive as strings), so the
// rest of the code never deals with `undefined` or out-of-range values.
// -----------------------------------------------------------------------------

// AirPlay protocol used to talk to the speakers. `auto` reads the features the
// speaker announces over mDNS (AirPlay 2 buffered audio, bit 38).
export const PROTOCOLS = { AUTO: 'auto', AIRPLAY_2: 'airplay2', AIRPLAY_1: 'airplay1' };

// Defaults: they MUST match the `default` values of the manifest config_schema
// (checked by test/manifest.test.js). The password is a `secret` field, which
// declares no default.
export const DEFAULT_CONFIG = {
  // Volume of a notification when the speaker has no volume of its own yet
  // (the native Gladys AirPlay service used 70).
  default_volume: 70,
  // Seconds after which a notification is cut, whatever its length (the
  // native service used 5 minutes).
  max_duration: 300,
  // Seconds between two reachability checks of the speakers.
  availability_interval: 300,
  protocol: PROTOCOLS.AUTO,
  // Name shown by the speakers that display their sender (Apple TV, HomePod…).
  sender_name: 'Gladys',
  airplay_password: '',
};

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
};

/**
 * @description Merge the user config with the defaults and force the types.
 * @param {Record<string, unknown>} raw - Config returned by the SDK.
 * @returns {typeof DEFAULT_CONFIG} The normalized configuration.
 */
export function normalizeConfig(raw = {}) {
  const protocol = Object.values(PROTOCOLS).includes(raw.protocol)
    ? raw.protocol
    : DEFAULT_CONFIG.protocol;
  const senderName =
    typeof raw.sender_name === 'string' && raw.sender_name.trim() !== ''
      ? raw.sender_name.trim().slice(0, 50)
      : DEFAULT_CONFIG.sender_name;
  return {
    default_volume: clamp(raw.default_volume, 0, 100, DEFAULT_CONFIG.default_volume),
    max_duration: clamp(raw.max_duration, 10, 1800, DEFAULT_CONFIG.max_duration),
    availability_interval: clamp(
      raw.availability_interval,
      60,
      3600,
      DEFAULT_CONFIG.availability_interval,
    ),
    protocol,
    sender_name: senderName,
    airplay_password: typeof raw.airplay_password === 'string' ? raw.airplay_password : '',
  };
}
