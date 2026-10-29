// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+).
//
// `airplay_speakers` has two faces, chosen by its per-instance `speaker`
// setting:
//   - no speaker chosen: an overview of every speaker (reachable, playing),
//     with a "Check now" button;
//   - one speaker chosen: its live volume tile, its state, and buttons to
//     play a chime, play a URL typed behind the tap, and stop.
// The content is declarative (rendered by the core with its own theme and
// translations); `params` are declared here and come back as-is.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { FEATURES } from './discovery.js';
import { LABELS, errorReason, message } from './i18n.js';
import { PlaybackError } from './player.js';
import { SOUNDS } from './sounds.js';

const logger = createLogger({ name: 'widgets' });

// Widget key, as declared in the manifest. Dashboards store it: never rename.
export const SPEAKERS_WIDGET = 'airplay_speakers';

// Keys of the `button` actions the content declares.
export const WIDGET_ACTIONS = {
  PLAY_CHIME: 'play_chime',
  PLAY_URL: 'play_url',
  STOP: 'stop',
  CHECK_AVAILABILITY: 'check_availability',
};

// The budget of a status list.
const MAX_STATUS_ITEMS = 10;

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function reachabilityItem(online) {
  if (online === true) {
    return { value: LABELS.online, color: WIDGET_COLORS.SUCCESS };
  }
  if (online === false) {
    return { value: LABELS.offline, color: WIDGET_COLORS.DANGER };
  }
  return { value: LABELS.unknown, color: WIDGET_COLORS.NEUTRAL };
}

function overviewContent(service) {
  const devices = service.createdDevices();
  if (devices.length === 0) {
    return { ttl_seconds: 300, components: [{ type: 'text', text: LABELS.noSpeaker }] };
  }
  const online = devices.filter((device) => service.isOnline(device.external_id) === true);
  return {
    ttl_seconds: 60,
    components: [
      { type: 'value', label: LABELS.speakers, icon: 'speaker', value: devices.length },
      {
        type: 'value',
        label: LABELS.reachable,
        icon: 'wifi',
        value: online.length,
        color: online.length === devices.length ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.WARNING,
      },
      {
        type: 'status',
        items: devices.slice(0, MAX_STATUS_ITEMS).map((device) => {
          const playing = service.isPlaying(device.external_id);
          return {
            label: truncate(device.name, 40),
            icon: playing ? 'volume-2' : 'speaker',
            ...(playing
              ? { value: LABELS.playingNow, color: WIDGET_COLORS.PRIMARY }
              : reachabilityItem(service.isOnline(device.external_id))),
          };
        }),
      },
      {
        type: 'button',
        label: LABELS.checkNow,
        icon: 'refresh-cw',
        style: 'secondary',
        action: { key: WIDGET_ACTIONS.CHECK_AVAILABILITY },
      },
    ],
  };
}

function speakerContent(service, device) {
  const externalId = device.external_id;
  const playing = service.isPlaying(externalId);
  let target = null;
  try {
    target = service.resolveTarget(externalId);
  } catch {
    // Created long ago, never seen since: the rows below say so.
  }
  const params = { device: externalId };
  return {
    // Playback changes and checks nudge the widget (see src/app.js): the
    // TTL is only a safety net.
    ttl_seconds: 60,
    components: [
      { type: 'text', variant: 'heading', text: truncate(device.name, 40) },
      // Live tile: follows the published volume, nothing to refresh.
      {
        type: 'value',
        label: LABELS.volume,
        icon: 'volume-2',
        device_feature: `${externalId}:${FEATURES.VOLUME}`,
      },
      {
        type: 'status',
        items: [
          {
            label: LABELS.reachability,
            icon: 'wifi',
            ...reachabilityItem(service.isOnline(externalId)),
          },
          {
            label: LABELS.playback,
            icon: 'music',
            value: playing ? LABELS.playingNow : LABELS.idle,
            color: playing ? WIDGET_COLORS.PRIMARY : WIDGET_COLORS.NEUTRAL,
          },
          ...(target
            ? [
                {
                  label: LABELS.address,
                  icon: 'map-pin',
                  value: `${target.address}:${target.port}`,
                  color: WIDGET_COLORS.NEUTRAL,
                },
                {
                  label: LABELS.protocol,
                  icon: 'radio',
                  value: target.airplay2 ? 'AirPlay 2' : 'AirPlay 1',
                  color: WIDGET_COLORS.NEUTRAL,
                },
              ]
            : []),
        ],
      },
      {
        type: 'button',
        label: LABELS.chime,
        icon: 'bell',
        style: 'primary',
        action: { key: WIDGET_ACTIONS.PLAY_CHIME, params },
      },
      {
        type: 'button',
        label: LABELS.playUrl,
        icon: 'play',
        style: 'secondary',
        action: {
          key: WIDGET_ACTIONS.PLAY_URL,
          params,
          // A typed URL is an event (play this now), never stored.
          fields: [
            { key: 'url', type: 'string', required: true, label: LABELS.audioUrl },
            {
              key: 'volume',
              type: 'number',
              required: false,
              min: 0,
              max: 100,
              default: service.volumeOf(externalId),
              label: LABELS.volume,
            },
          ],
        },
      },
      {
        type: 'button',
        label: LABELS.stop,
        icon: 'square',
        style: 'danger',
        action: { key: WIDGET_ACTIONS.STOP, params },
      },
    ],
  };
}

/**
 * @description Toast of a playback started from the widget.
 * @param {object} handle - `{ target, started }`.
 * @returns {Promise<object>} Multi-language toast.
 */
async function playbackToast(handle) {
  try {
    await handle.started;
    return message('playing', { name: handle.target.name });
  } catch (err) {
    if (err instanceof PlaybackError) {
      return message('playFailed', { name: handle.target.name, reason: errorReason(err.code) });
    }
    throw err;
  }
}

export const WIDGETS = {
  [SPEAKERS_WIDGET]: {
    async get(service, { settings }) {
      logger.debug(`onWidgetGet <- ${SPEAKERS_WIDGET}`);
      const device = service
        .createdDevices()
        .find((created) => created.external_id === settings?.speaker);
      return device ? speakerContent(service, device) : overviewContent(service);
    },

    async action(service, { actionKey, params, values }) {
      logger.info(`onWidgetAction <- ${SPEAKERS_WIDGET}.${actionKey}`);
      switch (actionKey) {
        case WIDGET_ACTIONS.PLAY_CHIME:
          return playbackToast(service.playChime(params.device, SOUNDS.DOORBELL));
        case WIDGET_ACTIONS.PLAY_URL: {
          // An older core drops the `fields` of a button and relays the tap
          // without `values`: refuse rather than play nothing.
          if (!values?.url) {
            throw new Error('No URL received: update Gladys to use this button.');
          }
          const volume =
            values.volume === undefined || values.volume === null
              ? undefined
              : Number(values.volume);
          try {
            return await playbackToast(service.playUrl(params.device, values.url, { volume }));
          } catch (err) {
            if (err instanceof PlaybackError) {
              const { name } = service.resolveTarget(params.device);
              return message('playFailed', { name, reason: errorReason(err.code) });
            }
            throw err;
          }
        }
        case WIDGET_ACTIONS.STOP: {
          const { name } = service.resolveTarget(params.device);
          return service.stop(params.device)
            ? message('stopped', { name })
            : message('nothingPlaying', { name });
        }
        case WIDGET_ACTIONS.CHECK_AVAILABILITY: {
          const results = await service.checkAvailability();
          return message('availabilityChecked', {
            online: results.filter((result) => result.online).length,
            total: results.length,
          });
        }
        default:
          // Throwing acks the action as failed: the message reaches the user.
          throw new Error(`Unknown widget action: ${actionKey}`);
      }
    },
  },
};

/**
 * @description Ask the core to re-pull every widget now (rate-limited
 * core-side to 1 per 10 s per widget, dropped while disconnected).
 * @param {object} gladys - SDK client.
 */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
