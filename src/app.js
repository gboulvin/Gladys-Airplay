// -----------------------------------------------------------------------------
// SDK wiring: every Gladys handler, registered before connect().
//
// Kept apart from index.js so the tests can run it against the fake Gladys
// of the SDK (`createFakeGladys()`), with fake AirPlay senders.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { message, errorReason, MESSAGES } from './i18n.js';
import { PlaybackError } from './player.js';
import { SCENE_ACTIONS } from './scenes.js';
import { createAirplayService } from './service.js';
import { SOUNDS } from './sounds.js';
import { WIDGETS, refreshWidgets } from './widgets.js';

const logger = createLogger({ name: 'app' });

// Manifest action keys (Configuration screen buttons).
export const ACTIONS = { TEST_SPEAKER: 'test_speaker' };

/**
 * @description Register every handler on the SDK client.
 * @param {object} gladys - SDK client (or the SDK's fake Gladys).
 * @param {object} [deps] - Injected dependencies (tests): startSender, spawn,
 * probe, dataDir.
 * @returns {{ service: object, stop: Function }} The service, and a cleanup.
 */
export function registerHandlers(gladys, deps = {}) {
  let availabilityTimer = null;

  const service = createAirplayService(gladys, {
    ...deps,
    // A playback that starts or ends changes what the widget shows.
    onPlaybackChange: () => refreshWidgets(gladys),
  });

  async function checkAvailability() {
    try {
      await service.checkAvailability();
      refreshWidgets(gladys);
    } catch (err) {
      logger.warn('Availability check failed', err);
    }
  }

  // Each cycle re-scans first: a speaker whose DHCP lease moved is followed
  // before being declared unreachable.
  async function availabilityCycle() {
    try {
      await service.scan();
    } catch (err) {
      logger.debug('Periodic scan failed', err);
    }
    await checkAvailability();
  }

  function startAvailabilityTimer() {
    stopAvailabilityTimer();
    availabilityTimer = setInterval(availabilityCycle, service.config.availability_interval * 1000);
  }

  function stopAvailabilityTimer() {
    clearInterval(availabilityTimer);
    availabilityTimer = null;
  }

  // --- Discovery: the user opens the Discovery tab -------------------------
  gladys.onScanRequest(async () => {
    logger.info('onScanRequest -> browsing the network for AirPlay speakers');
    await service.scan();
    await gladys.publishDiscoveredDevices(service.discoveredDevices());
  });

  // --- Commands on device features ------------------------------------------
  gladys.onSetValue(async (device, feature, value) => {
    switch (feature.type) {
      case DEVICE_FEATURE_TYPES.MUSIC.PLAY_NOTIFICATION: {
        // `value` is the URL of the synthesized speech (Gladys Plus, or the
        // local text-to-speech provider). The ack is awaited under 5 s: the
        // URL and the speaker are checked now (a failure reaches the scene),
        // the AirPlay session runs in the background, like the native service.
        logger.info(`Notification <- ${device.external_id}`);
        const { finished } = service.playUrl(device.external_id, value, { title: 'Notification' });
        finished.then(({ error }) => {
          if (error) {
            logger.error(`Notification on ${device.external_id} failed: ${error.message}`);
          }
        });
        return;
      }
      case DEVICE_FEATURE_TYPES.MUSIC.VOLUME:
        await service.setVolume(device.external_id, value);
        return;
      default:
        // Throw: the SDK acks success:false to Gladys.
        throw new Error(`Feature ${feature.type} cannot be controlled`);
    }
  });

  // --- Manifest action: "Test a speaker" -------------------------------------
  gladys.onAction(ACTIONS.TEST_SPEAKER, async (fields) => {
    logger.info(`Action ${ACTIONS.TEST_SPEAKER} <- ${fields.device}`);
    let handle;
    try {
      handle = service.playChime(fields.device, SOUNDS.DOORBELL);
    } catch {
      return MESSAGES.speakerNotFound;
    }
    try {
      await handle.started;
      return message('testPlaying', { name: handle.target.name });
    } catch (err) {
      return message('playFailed', {
        name: handle.target.name,
        reason: errorReason(err instanceof PlaybackError ? err.code : 'CONNECTION_FAILED'),
      });
    }
  });

  // --- Scene actions ---------------------------------------------------------
  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(key, (fields) => handler(service, { fields }));
  }

  // --- Dashboard widgets -----------------------------------------------------
  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(key, (request) => widget.get(service, request));
    gladys.onWidgetAction(key, (actionKey, params, { settings, values } = {}) =>
      widget.action(service, { actionKey, params, settings, values }),
    );
  }

  // --- Device lifecycle: a speaker created from the Discovery tab -----------
  gladys.onDeviceCreated(async () => {
    await service.publishInitialStates();
    await checkAvailability();
  });

  // --- Configuration -----------------------------------------------------------
  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('onConfigUpdated -> new configuration received');
    service.setConfig(normalizeConfig(newConfig));
    // The protocol choice changes the port stored in the device params.
    await gladys.publishDiscoveredDevices(service.discoveredDevices());
    startAvailabilityTimer();
    refreshWidgets(gladys);
  });

  // --- Connection lifecycle ----------------------------------------------------
  gladys.on('connected', async () => {
    try {
      service.setConfig(normalizeConfig(await gladys.getConfig()));
      await service.loadVolumes();
      try {
        await service.scan();
        // Upsert the params (IP address) of the created speakers.
        await gladys.publishDiscoveredDevices(service.discoveredDevices());
      } catch (err) {
        // The stored params still reach the speakers: not fatal.
        logger.warn('Startup scan failed, using the stored speaker addresses', err);
      }
      await service.publishInitialStates();
      await checkAvailability();
      startAvailabilityTimer();
      refreshWidgets(gladys);
      await gladys.setConnectionStatus(true);
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
      await gladys.setConnectionStatus(false, MESSAGES.initializationFailed).catch(() => {});
    }
  });

  gladys.on('disconnected', () => {
    stopAvailabilityTimer();
  });

  return {
    service,
    stop() {
      stopAvailabilityTimer();
      service.stopAll();
    },
  };
}
