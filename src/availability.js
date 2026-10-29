// -----------------------------------------------------------------------------
// Speaker reachability.
//
// Every `availability_interval` seconds, the integration opens a TCP
// connection to the AirPlay port of each created speaker (unicast crosses the
// Docker bridge, unlike mDNS). The result feeds:
//   - the per-device transport badge (`local` or `unreachable`);
//   - the `speaker_offline` / `speaker_online` scene triggers, fired on a
//     TRANSITION only — never on the first check after a (re)start, which
//     would fire for every speaker at each container restart.
// -----------------------------------------------------------------------------

import net from 'node:net';
import { DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';

// Scene trigger keys, as declared in the manifest `scene_triggers` field.
// Scenes store them: never rename one.
export const SPEAKER_OFFLINE_TRIGGER = 'speaker_offline';
export const SPEAKER_ONLINE_TRIGGER = 'speaker_online';
export const SCENE_TRIGGER_KEYS = [SPEAKER_OFFLINE_TRIGGER, SPEAKER_ONLINE_TRIGGER];

const PROBE_TIMEOUT_MS = 3000;

/**
 * @description Whether a TCP port answers.
 * @param {string} host - IP address.
 * @param {number} port - TCP port.
 * @param {number} [timeoutMs] - Give up after this delay.
 * @returns {Promise<boolean>} True when the connection was accepted.
 */
export function tcpProbe(host, port, timeoutMs = PROBE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (online) => {
      socket.destroy();
      resolve(online);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

/**
 * @description Create the reachability monitor.
 * @param {object} [deps] - Injected dependencies (tests).
 * @param {Function} [deps.probe] - `(host, port) => Promise<boolean>`.
 * @returns {object} The monitor: check, isOnline, forget.
 */
export function createAvailabilityMonitor({ probe = tcpProbe } = {}) {
  const states = new Map();

  return {
    /**
     * @description Check every speaker, publish the transport badges and
     * fire the transition triggers.
     * @param {object} gladys - SDK client.
     * @param {Array<{externalId: string, name: string, address: string, port: number}>} speakers
     * - Created speakers.
     * @returns {Promise<Array<{externalId: string, online: boolean}>>} Results.
     */
    async check(gladys, speakers) {
      const results = await Promise.all(
        speakers.map(async (speaker) => ({
          speaker,
          online: await probe(speaker.address, speaker.port).catch(() => false),
        })),
      );
      for (const { speaker, online } of results) {
        const previous = states.get(speaker.externalId);
        states.set(speaker.externalId, online);
        if (previous !== undefined && previous !== online) {
          // `device` is the external id, the value a `"source": "devices"`
          // filter stores; `name` is exposed as {{triggerEvent.data.name}}.
          await gladys.publishSceneEvent(
            online ? SPEAKER_ONLINE_TRIGGER : SPEAKER_OFFLINE_TRIGGER,
            {
              device: speaker.externalId,
              name: speaker.name,
            },
          );
        }
      }
      if (results.length > 0) {
        await gladys.publishTransports(
          results.map(({ speaker, online }) => ({
            external_id: speaker.externalId,
            transport: online ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.UNREACHABLE,
          })),
        );
      }
      return results.map(({ speaker, online }) => ({ externalId: speaker.externalId, online }));
    },

    /**
     * @param {string} externalId - Device external id.
     * @returns {boolean|undefined} Last known state, undefined before the first check.
     */
    isOnline(externalId) {
      return states.get(externalId);
    },

    /**
     * @description Record a state learned elsewhere (a playback that started
     * proves the speaker is reachable), without firing a trigger.
     * @param {string} externalId - Device external id.
     * @param {boolean} online - Observed state.
     */
    observe(externalId, online) {
      states.set(externalId, online);
    },
  };
}
