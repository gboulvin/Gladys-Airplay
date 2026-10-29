// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { ACTIONS, registerHandlers } from '../src/app.js';
import { SCENE_TRIGGER_KEYS } from '../src/availability.js';
import { DEFAULT_CONFIG, PROTOCOLS } from '../src/config.js';
import { AIRPLAY_SERVICE, RAOP_SERVICE } from '../src/discovery.js';
import { SCENE_ACTIONS } from '../src/scenes.js';
import { SOUNDS } from '../src/sounds.js';
import { WIDGETS } from '../src/widgets.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest can declare (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

// Manifest fields older Gladys releases reject as unknown, with the first
// release accepting them (the store validator enforces the same table).
const FIELD_MIN_GLADYS_VERSION = {
  categories: [4, 86, 0],
  widgets: [5, 1, 0],
  scene_triggers: [5, 1, 0],
  scene_actions: [5, 1, 0],
  keywords: [5, 3, 0],
  countries: [5, 3, 0],
};

const keysOf = (list) => (list ?? []).map((entry) => entry.key);

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

test('every manifest action has a registered handler', async () => {
  const gladys = createFakeGladys();
  const registered = [];
  const onAction = gladys.onAction.bind(gladys);
  gladys.onAction = (key, callback) => {
    registered.push(key);
    onAction(key, callback);
  };
  registerHandlers(gladys).stop();
  assert.deepEqual(keysOf(manifest.actions), Object.values(ACTIONS));
  assert.deepEqual(registered.sort(), keysOf(manifest.actions).sort());
});

test('fields newer than the first releases require a recent enough Gladys', () => {
  for (const [field, minimum] of Object.entries(FIELD_MIN_GLADYS_VERSION)) {
    if (manifest[field] !== undefined) {
      assert.ok(
        isAtLeast(minGladysVersion(), minimum),
        `${field} requires gladys_version >= ${minimum.join('.')}, got "${manifest.gladys_version}"`,
      );
    }
  }
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
});

test('the integration is local only', () => {
  // No cloud account, no third-party API: the speakers are reached on the LAN.
  assert.deepEqual(manifest.transports, ['local']);
});

test('the mDNS services the code parses are the ones the manifest declares', () => {
  assert.deepEqual(
    manifest.network_discovery.map((entry) => [entry.type, entry.service]),
    [
      ['mdns', AIRPLAY_SERVICE],
      ['mdns', RAOP_SERVICE],
    ],
  );
});

test('every scene_actions key has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
});

test('every widgets key has a content handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.widgets).sort(), Object.keys(WIDGETS).sort());
});

test('every scene trigger the code fires is declared, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), [...SCENE_TRIGGER_KEYS].sort());
  for (const trigger of manifest.scene_triggers) {
    // The event data the code sends: `device` (filter) and `name` (variable).
    assert.deepEqual([...keysOf(trigger.fields), ...keysOf(trigger.variables)].sort(), [
      'device',
      'name',
    ]);
  }
});

test('the chime sounds of the scene action are the synthesized ones', () => {
  const sound = manifest.scene_actions
    .find((action) => action.key === 'play_chime')
    .fields.find((field) => field.key === 'sound');
  assert.deepEqual(
    sound.options.map((option) => option.value).sort(),
    Object.values(SOUNDS).sort(),
  );
});

test('scene action outputs are the ones the handlers return', () => {
  const outputs = Object.fromEntries(
    manifest.scene_actions.map((action) => [action.key, keysOf(action.outputs).sort()]),
  );
  assert.deepEqual(outputs, {
    play_audio: ['duration_seconds', 'played'],
    play_chime: ['duration_seconds', 'played'],
    stop_playback: ['stopped'],
  });
});

test('a scene action that waits for the end resolves before its timeout', async () => {
  const { MAX_WAIT_MS } = await import('../src/scenes.js');
  const { CONNECT_TIMEOUT_MS, DRAIN_MS } = await import('../src/player.js');
  const timeoutOf = (key) =>
    manifest.scene_actions.find((action) => action.key === key).timeout_seconds * 1000;
  // A URL may be endless: the wait is capped.
  assert.ok(CONNECT_TIMEOUT_MS + MAX_WAIT_MS < timeoutOf('play_audio'));
  // A chime lasts under 3 s, then drains.
  assert.ok(CONNECT_TIMEOUT_MS + 3000 + DRAIN_MS < timeoutOf('play_chime'));
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(
        DEFAULT_CONFIG[field.key],
        field.default,
        `DEFAULT_CONFIG.${field.key} must match the manifest default`,
      );
    }
  }
  const protocol = manifest.config_schema.find((field) => field.key === 'protocol');
  assert.deepEqual(
    protocol.options.map((option) => option.value).sort(),
    Object.values(PROTOCOLS).sort(),
  );
});

test('section fields are purely presentational', () => {
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    assert.equal(section.placeholder, undefined);
    assert.ok(!(section.key in DEFAULT_CONFIG));
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('dynamic selects declare a source and no static options', () => {
  for (const field of allFields.filter((f) => f.source !== undefined)) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined, `field "${field.key}": source and options together`);
    assert.equal(field.default, undefined, `field "${field.key}": no default with a source`);
  }
});

test('placeholders only on string, number and secret fields, as multi-language objects', () => {
  for (const field of allFields.filter((f) => f.placeholder !== undefined)) {
    assert.ok(['string', 'number', 'secret'].includes(field.type), field.key);
    assert.equal(typeof field.placeholder, 'object', `field "${field.key}": placeholder`);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.ok(
    manifest.docker_image.endsWith(`:${manifest.version}`),
    `docker_image must be tagged :${manifest.version}, got "${manifest.docker_image}"`,
  );
});

test('the catalog name and description fit the store rules', () => {
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${lang} has ${text.length} characters (10 to 100 allowed)`,
    );
  }
});

test('widget labels and descriptions fit the core limits', () => {
  for (const widget of manifest.widgets) {
    for (const text of Object.values(widget.label)) {
      assert.ok(text.length <= 30, text);
    }
    for (const text of Object.values(widget.description)) {
      assert.ok(text.length <= 100, text);
    }
  }
});
