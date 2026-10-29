import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { normalizeConfig } from '../src/config.js';
import {
  buildDevice,
  connectionOf,
  normalizeMac,
  parseScanResults,
  speakerFromDevice,
  supportsAirplay2,
} from '../src/discovery.js';
import { KITCHEN_MAC, MDNS_RESULTS, OFFICE_MAC } from './helpers.js';

const config = normalizeConfig();

test('MAC addresses are normalized, anything else is refused', () => {
  assert.equal(normalizeMac('AA:BB:CC:DD:EE:FF'), 'aabbccddeeff');
  assert.equal(normalizeMac('AABBCCDDEEFF'), 'aabbccddeeff');
  assert.equal(normalizeMac('AA:BB'), null);
  assert.equal(normalizeMac(undefined), null);
});

test('the AirPlay 2 audio bit is read from the features TXT entry', () => {
  assert.equal(supportsAirplay2('0x4A7FDFD5,0xBC177FDE'), true);
  assert.equal(supportsAirplay2('0x5A7FFFF7,0x1E'), false);
  assert.equal(supportsAirplay2('0x77'), false);
  assert.equal(supportsAirplay2('garbage'), false);
  assert.equal(supportsAirplay2(undefined), false);
});

test('the _airplay and _raop records of one speaker are merged on its MAC', () => {
  const speakers = parseScanResults(MDNS_RESULTS);
  assert.equal(speakers.length, 2);
  const [kitchen, office] = speakers;
  assert.deepEqual(kitchen, {
    id: KITCHEN_MAC,
    name: 'Kitchen',
    address: '192.168.1.20',
    airplayPort: 7000,
    raopPort: 7000,
    airplay2: true,
    model: 'AudioAccessory5,1',
    passwordRequired: false,
  });
  assert.equal(office.id, OFFICE_MAC);
  assert.equal(office.name, 'Office');
  assert.equal(office.airplay2, false);
  assert.equal(office.raopPort, 5000);
});

test('records without an IPv4 address or of another service are ignored', () => {
  const speakers = parseScanResults([
    {
      name: 'Foo._airplay._tcp.local',
      host: 'foo.local',
      addresses: ['fe80::1'],
      port: 7000,
      txt: [],
    },
    {
      name: 'Bar._hue._tcp.local',
      host: 'bar.local',
      addresses: ['192.168.1.5'],
      port: 80,
      txt: [],
    },
  ]);
  assert.deepEqual(speakers, []);
  assert.deepEqual(parseScanResults(undefined), []);
});

test('the protocol setting picks the port and the AirPlay version', () => {
  const [kitchen, office] = parseScanResults(MDNS_RESULTS);
  assert.deepEqual(connectionOf(kitchen, 'auto'), { airplay2: true, port: 7000 });
  assert.deepEqual(connectionOf(office, 'auto'), { airplay2: false, port: 5000 });
  assert.deepEqual(connectionOf(office, 'airplay2'), { airplay2: true, port: 5000 });
  assert.deepEqual(connectionOf({ airplayPort: null, raopPort: null }, 'airplay1'), {
    airplay2: false,
    port: 5000,
  });
});

test('Gladys accepts the discovered devices', async () => {
  const gladys = createFakeGladys();
  const devices = parseScanResults(MDNS_RESULTS).map((speaker) =>
    buildDevice(gladys, speaker, config),
  );
  // The fake Gladys refuses what the host API refuses (category, type, unit, ids).
  await gladys.publishDiscoveredDevices(devices);
  const [kitchen] = gladys.fake.discoveredDevices;
  assert.equal(kitchen.external_id, `ext:test-integration:speaker:${KITCHEN_MAC}`);
  assert.deepEqual(
    kitchen.features.map((feature) => feature.external_id.split(':').at(-1)),
    ['play_notification', 'volume', 'playback_state', 'title'],
  );
  assert.equal(kitchen.should_poll, false);
});

test('a created device is reachable from its stored params', () => {
  const gladys = createFakeGladys();
  const [, office] = parseScanResults(MDNS_RESULTS);
  const device = { ...buildDevice(gladys, office, config), name: 'Office speaker' };
  const speaker = speakerFromDevice(device, OFFICE_MAC);
  assert.equal(speaker.address, '192.168.1.30');
  assert.deepEqual(connectionOf(speaker, 'auto'), { airplay2: false, port: 5000 });
  assert.equal(speaker.name, 'Office speaker');
  assert.equal(speakerFromDevice({ name: 'x', params: [] }, OFFICE_MAC), null);
});
