// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+).
//
// The core's own "Play a notification" action already reaches the speakers
// through their `play_notification` feature (text-to-speech). These actions
// add what it cannot do: play any audio URL, a built-in chime that needs no
// text-to-speech nor internet, and stop a playback.
//
// Rules (SDK scene contract):
//   - `fields` arrive RESOLVED (scene variables substituted, defaults applied);
//     a `"source": "devices"` field is the chosen device external id;
//   - an unreachable speaker is an OUTPUT (`played: false`), not a failure: a
//     scene action is never a condition, the author gates on the output.
//     A wrong setup (unknown speaker, invalid URL) throws: the scene logs it;
//   - never fire a scene event because of an action (loops).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { PlaybackError } from './player.js';
import { SOUNDS } from './sounds.js';

const logger = createLogger({ name: 'scenes' });

// The `wait_until_finished` option resolves before the action's
// `timeout_seconds` (120 s in the manifest, connection included): a longer
// audio keeps playing, the scene moves on.
export const MAX_WAIT_MS = 100_000;

const optionalVolume = (value) =>
  value === undefined || value === null || value === '' ? undefined : Number(value);

/**
 * @description Wait for the end of a playback, at most `maxMs`.
 * @param {Promise<object>} finished - Session `finished` promise.
 * @param {number} maxMs - Upper bound.
 * @returns {Promise<object|null>} The outcome, or null when still playing.
 */
function waitAtMost(finished, maxMs) {
  let timer;
  return Promise.race([
    finished,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), maxMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * @description Start a playback and turn its outcome into the declared outputs.
 * @param {object} handle - `{ started, finished }` from the service.
 * @param {boolean} wait - Wait for the end of the playback.
 * @returns {Promise<{ played: boolean, duration_seconds: number }>} Outputs.
 */
async function outcomeOf(handle, wait) {
  try {
    await handle.started;
  } catch (err) {
    if (err instanceof PlaybackError) {
      logger.warn(`Scene playback not started: ${err.message}`);
      return { played: false, duration_seconds: 0 };
    }
    throw err;
  }
  if (!wait) {
    return { played: true, duration_seconds: 0 };
  }
  const outcome = await waitAtMost(handle.finished, MAX_WAIT_MS);
  return {
    played: true,
    duration_seconds: outcome ? outcome.durationSeconds : Math.round(MAX_WAIT_MS / 1000),
  };
}

export const SCENE_ACTIONS = {
  async play_audio(service, { fields }) {
    logger.info(`Scene action play_audio <- ${fields.device}`);
    // Throws (INVALID_URL, unknown speaker) before anything plays.
    const handle = service.playUrl(fields.device, fields.url, {
      volume: optionalVolume(fields.volume),
    });
    return outcomeOf(handle, fields.wait_until_finished === true);
  },

  async play_chime(service, { fields }) {
    logger.info(`Scene action play_chime <- ${fields.device} (${fields.sound})`);
    const sound = Object.values(SOUNDS).includes(fields.sound) ? fields.sound : SOUNDS.DOORBELL;
    const handle = service.playChime(fields.device, sound, {
      volume: optionalVolume(fields.volume),
    });
    return outcomeOf(handle, fields.wait_until_finished === true);
  },

  async stop_playback(service, { fields }) {
    logger.info(`Scene action stop_playback <- ${fields.device}`);
    // Resolve the speaker first: an unknown device is a setup error.
    service.resolveTarget(fields.device);
    return { stopped: service.stop(fields.device) };
  },
};
