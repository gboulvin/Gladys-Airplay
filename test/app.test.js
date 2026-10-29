// -----------------------------------------------------------------------------
// End-to-end: the handlers of src/app.js against the fake Gladys of the SDK,
// with fake AirPlay senders, a fake ffmpeg and a fake reachability probe.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MUSIC_PLAYBACK_STATE, validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../src/app.js';
import { normalizeConfig } from '../src/config.js';
import { buildDevice, parseScanResults } from '../src/discovery.js';
import { SPEAKERS_WIDGET, WIDGET_ACTIONS } from '../src/widgets.js';
import {
  KITCHEN_MAC,
  MDNS_RESULTS,
  OFFICE_MAC,
  createFakeSenders,
  createFakeSpawn,
  tempDataDir,
} from './helpers.js';

const KITCHEN = `ext:test-integration:speaker:${KITCHEN_MAC}`;
const OFFICE = `ext:test-integration:speaker:${OFFICE_MAC}`;
const feature = (externalId, type) => ({
  external_id: `${externalId}:${type}`,
  category: 'music',
  type,
});

// The two speakers of the fixtures, created in Gladys by the user.
function createdDevices() {
  const gladys = createFakeGladys();
  return parseScanResults(MDNS_RESULTS).map((speaker) =>
    buildDevice(gladys, speaker, normalizeConfig()),
  );
}

async function setup(
  t,
  { answer = 'ready', devices = createdDevices(), scan = MDNS_RESULTS } = {},
) {
  const dataDir = await tempDataDir();
  const gladys = createFakeGladys({ devices, scanResults: { mdns: scan } });
  const { startSender, senders } = createFakeSenders({ answer });
  const { spawn, processes } = createFakeSpawn();
  const reachable = new Map();
  const probe = async (host) => reachable.get(host) ?? true;
  const app = registerHandlers(gladys, { startSender, spawn, probe, dataDir });
  t.after(() => app.stop());
  await gladys.connect();
  return { gladys, app, senders, processes, reachable, dataDir };
}

test('on connection: scan, upsert the devices, publish volumes, states and badges', async (t) => {
  const { gladys } = await setup(t);
  assert.equal(gladys.fake.scans[0].type, 'mdns');
  assert.equal(gladys.fake.discoveredDevices.length, 2);
  assert.equal(gladys.fake.lastState(`${KITCHEN}:volume`), 70);
  assert.equal(gladys.fake.lastState(`${KITCHEN}:playback_state`), MUSIC_PLAYBACK_STATE.IDLE);
  assert.deepEqual(
    gladys.fake.transports.map(({ device_external_id: id, transport }) => [id, transport]),
    [
      [KITCHEN, 'local'],
      [OFFICE, 'local'],
    ],
  );
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('the Discovery tab lists the speakers found on the network', async (t) => {
  const { gladys } = await setup(t, { devices: [] });
  assert.deepEqual(await gladys.fake.scanRequest(), undefined);
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.name),
    ['Kitchen', 'Office'],
  );
});

test('a speaker asleep during the scan stays in the discovered list', async (t) => {
  const { gladys } = await setup(t, { scan: [] });
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.external_id),
    [KITCHEN, OFFICE],
  );
});

test('the core "play a notification" action streams the speech URL', async (t) => {
  const { gladys, senders, processes } = await setup(t);
  const ack = await gladys.fake.setValue(
    { external_id: KITCHEN },
    feature(KITCHEN, 'play_notification'),
    'http://192.168.1.2:1443/api/v1/tts/audio/abc.mp3',
  );
  assert.equal(ack.success, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(senders[0].options.host, '192.168.1.20');
  assert.equal(senders[0].options.port, 7000);
  assert.equal(senders[0].options.volume, 70);
  assert.equal(senders[0].options.name, 'Gladys');
  assert.ok(processes[0].args.includes('http://192.168.1.2:1443/api/v1/tts/audio/abc.mp3'));
  assert.equal(gladys.fake.lastState(`${KITCHEN}:playback_state`), MUSIC_PLAYBACK_STATE.PLAYING);
  assert.equal(gladys.fake.lastState(`${KITCHEN}:title`), 'Notification');
});

test('a notification with a non-http URL is refused before anything plays', async (t) => {
  const { gladys, senders } = await setup(t);
  const ack = await gladys.fake.setValue(
    { external_id: KITCHEN },
    feature(KITCHEN, 'play_notification'),
    'file:///etc/passwd',
  );
  assert.equal(ack.success, false);
  assert.equal(senders.length, 0);
});

test('the volume is stored, confirmed and used by the next playback', async (t) => {
  const { gladys, senders, dataDir } = await setup(t);
  const ack = await gladys.fake.setValue({ external_id: OFFICE }, feature(OFFICE, 'volume'), 35);
  assert.equal(ack.success, true);
  assert.equal(gladys.fake.lastState(`${OFFICE}:volume`), 35);
  const stored = JSON.parse(await readFile(path.join(dataDir, 'volumes.json'), 'utf8'));
  assert.equal(stored[OFFICE], 35);

  await gladys.fake.action('test_speaker', { device: OFFICE });
  assert.equal(senders[0].options.volume, 35);
  assert.equal(senders[0].options.port, 5000);
  assert.equal(senders[0].options.airplay2, false);
});

test('a read-only feature cannot be controlled', async (t) => {
  const { gladys } = await setup(t);
  const ack = await gladys.fake.setValue({ external_id: KITCHEN }, feature(KITCHEN, 'title'), 1);
  assert.equal(ack.success, false);
});

test('"Test a speaker" plays the chime and says so', async (t) => {
  const { gladys } = await setup(t);
  const ack = await gladys.fake.action('test_speaker', { device: KITCHEN });
  assert.equal(ack.success, true);
  assert.match(ack.data.message.en, /Kitchen/);
  assert.equal(Object.keys(ack.data.message).length, 4);
});

test('"Test a speaker" explains an Apple speaker the PTP clock cannot reach', async (t) => {
  const { gladys, senders } = await setup(t, { answer: 'ptp_unavailable' });
  const ack = await gladys.fake.action('test_speaker', { device: KITCHEN });
  assert.match(ack.data.message.en, /PTP/);
  // The HomePod of the fixtures, with what its lane is picked on.
  assert.equal(senders[0].options.model, 'AudioAccessory5,1');
  assert.equal(senders[0].options.features, '0x4A7FDFD5,0xBC177FDE');
});

test('"Test a speaker" explains a password-protected speaker', async (t) => {
  const { gladys } = await setup(t, { answer: 'need_password' });
  const ack = await gladys.fake.action('test_speaker', { device: KITCHEN });
  assert.match(ack.data.message.en, /password/);
});

test('scene actions: play a URL, a chime, then stop', async (t) => {
  const { gladys } = await setup(t);
  const played = await gladys.fake.sceneAction('play_audio', {
    device: KITCHEN,
    url: 'https://example.com/bell.mp3',
    volume: 20,
    wait_until_finished: false,
  });
  assert.deepEqual(played.data.outputs, { played: true, duration_seconds: 0 });

  const chime = await gladys.fake.sceneAction('play_chime', { device: KITCHEN, sound: 'alert' });
  assert.equal(chime.data.outputs.played, true);

  const stopped = await gladys.fake.sceneAction('stop_playback', { device: KITCHEN });
  assert.deepEqual(stopped.data.outputs, { stopped: true });
});

test('scene action: an unreachable speaker is an output, not a failure', async (t) => {
  const { gladys } = await setup(t, { answer: 'stopped' });
  const ack = await gladys.fake.sceneAction('play_chime', { device: KITCHEN, sound: 'doorbell' });
  assert.equal(ack.success, true);
  assert.deepEqual(ack.data.outputs, { played: false, duration_seconds: 0 });
});

test('scene action: an unknown speaker fails the action', async (t) => {
  const { gladys } = await setup(t);
  const ack = await gladys.fake.sceneAction('play_chime', {
    device: 'ext:test-integration:speaker:000000000000',
  });
  assert.equal(ack.success, false);
});

test('a speaker going offline then online fires one trigger per transition', async (t) => {
  const { gladys, reachable } = await setup(t);
  assert.equal(gladys.fake.sceneEvents.length, 0, 'no event on the first check');

  reachable.set('192.168.1.30', false);
  const offline = await gladys.fake.widgetAction(
    SPEAKERS_WIDGET,
    WIDGET_ACTIONS.CHECK_AVAILABILITY,
  );
  assert.match(offline.data.message.en, /1 of 2/);
  // Checking again without a change fires nothing.
  await gladys.fake.widgetAction(SPEAKERS_WIDGET, WIDGET_ACTIONS.CHECK_AVAILABILITY);
  reachable.set('192.168.1.30', true);
  await gladys.fake.widgetAction(SPEAKERS_WIDGET, WIDGET_ACTIONS.CHECK_AVAILABILITY);

  assert.deepEqual(gladys.fake.sceneEvents, [
    { key: 'speaker_offline', data: { device: OFFICE, name: 'Office' } },
    { key: 'speaker_online', data: { device: OFFICE, name: 'Office' } },
  ]);
  assert.ok(
    gladys.fake.transports.some(
      (entry) => entry.device_external_id === OFFICE && entry.transport === 'unreachable',
    ),
  );
});

test('the widget renders as sent, in both its faces', async (t) => {
  const { gladys } = await setup(t);
  const overview = await gladys.fake.widgetGet(SPEAKERS_WIDGET);
  const overviewContent = overview.data.content;
  assert.deepEqual(validateWidgetContent(overviewContent), []);
  assert.equal(overviewContent.components.find((c) => c.type === 'status').items.length, 2);

  const single = await gladys.fake.widgetGet(SPEAKERS_WIDGET, { settings: { speaker: KITCHEN } });
  const singleContent = single.data.content;
  assert.deepEqual(validateWidgetContent(singleContent), []);
  const tile = singleContent.components.find((c) => c.device_feature);
  assert.equal(tile.device_feature, `${KITCHEN}:volume`);
});

test('the widget of an installation without speakers is valid too', async (t) => {
  const { gladys } = await setup(t, { devices: [], scan: [] });
  const ack = await gladys.fake.widgetGet(SPEAKERS_WIDGET);
  assert.deepEqual(validateWidgetContent(ack.data.content), []);
});

test('every widget button is handled and answers a short toast', async (t) => {
  const { gladys } = await setup(t);
  const ack = await gladys.fake.widgetGet(SPEAKERS_WIDGET, { settings: { speaker: KITCHEN } });
  const buttons = ack.data.content.components.filter((c) => c.type === 'button');
  assert.equal(buttons.length, 3);
  for (const { action } of buttons) {
    const values = action.fields ? { url: 'https://example.com/a.mp3', volume: 50 } : undefined;
    const result = await gladys.fake.widgetAction(SPEAKERS_WIDGET, action.key, action.params, {
      settings: { speaker: KITCHEN },
      values,
    });
    assert.equal(result.success, true, action.key);
    const toast = result.data.message;
    assert.ok(toast.en.length <= 200, action.key);
  }
});

test('the URL button refuses a tap relayed without values (older core)', async (t) => {
  const { gladys } = await setup(t);
  const ack = await gladys.fake.widgetAction(SPEAKERS_WIDGET, WIDGET_ACTIONS.PLAY_URL, {
    device: KITCHEN,
  });
  assert.equal(ack.success, false);
});

test('an initialization failure is reported in the Configuration screen', async (t) => {
  const gladys = createFakeGladys({ devices: createdDevices(), scanResults: { mdns: [] } });
  const app = registerHandlers(gladys, {
    dataDir: await tempDataDir(),
    probe: async () => true,
  });
  t.after(() => app.stop());
  t.mock.method(gladys, 'publishChangedStates', async () => {
    throw new Error('boom');
  });
  await gladys.connect();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.equal(Object.keys(gladys.fake.connectionStatus.message).length, 4);
});
