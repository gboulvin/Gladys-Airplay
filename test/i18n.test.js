// -----------------------------------------------------------------------------
// Internationalization: every user-facing text exists in English, French,
// German and Spanish — manifest, runtime messages, widget labels and docs.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import {
  ERROR_REASONS,
  LABELS,
  MESSAGES,
  SUPPORTED_LANGUAGES,
  errorReason,
  format,
  message,
} from '../src/i18n.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

// Every multi-language object of the manifest, with a readable path.
function localizedTexts(value, path = 'manifest') {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => localizedTexts(item, `${path}[${index}]`));
  }
  if (value === null || typeof value !== 'object') {
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    ['label', 'description', 'placeholder'].includes(key) && typeof child === 'object'
      ? [{ path: `${path}.${key}`, text: child }]
      : localizedTexts(child, `${path}.${key}`),
  );
}

test('the supported languages', () => {
  assert.deepEqual(SUPPORTED_LANGUAGES, ['en', 'fr', 'de', 'es']);
});

test('every manifest text exists in the four languages', () => {
  const texts = localizedTexts(manifest);
  assert.ok(texts.length > 50);
  for (const { path, text } of texts) {
    assert.deepEqual(Object.keys(text).sort(), [...SUPPORTED_LANGUAGES].sort(), path);
    for (const language of SUPPORTED_LANGUAGES) {
      assert.ok(text[language]?.trim(), `${path}.${language} is missing`);
    }
  }
});

test('every runtime message and label exists in the four languages', () => {
  for (const [group, entries] of Object.entries({ MESSAGES, ERROR_REASONS, LABELS })) {
    for (const [key, texts] of Object.entries(entries)) {
      assert.deepEqual(
        Object.keys(texts).sort(),
        [...SUPPORTED_LANGUAGES].sort(),
        `${group}.${key}`,
      );
    }
  }
});

test('placeholders are filled language by language', () => {
  assert.deepEqual(message('stopped', { name: 'Kitchen' }), {
    en: 'Playback stopped on Kitchen.',
    fr: 'Lecture arrêtée sur Kitchen.',
    de: 'Wiedergabe auf Kitchen gestoppt.',
    es: 'Reproducción detenida en Kitchen.',
  });
  const failed = message('playFailed', { name: 'Office', reason: errorReason('UNREACHABLE') });
  assert.equal(
    failed.fr,
    "Office n'a pas pu jouer : l'enceinte ne répond pas (éteinte, en veille ou sur un autre réseau).",
  );
  assert.equal(format({ en: 'Hi {who}' }, {}).en, 'Hi {who}');
  assert.equal(errorReason('SOMETHING_NEW'), ERROR_REASONS.CONNECTION_FAILED);
});

test('toasts stay under the 200-character limit of the widget actions', () => {
  for (const [key, texts] of Object.entries(MESSAGES)) {
    const filled = format(texts, {
      name: 'A speaker with a rather long name',
      reason: ERROR_REASONS.PASSWORD_REQUIRED,
      online: 10,
      total: 10,
    });
    for (const [language, text] of Object.entries(filled)) {
      assert.ok(text.length <= 200, `${key}.${language} has ${text.length} characters`);
    }
  }
});

test('the user documentation exists in the four languages', async () => {
  for (const language of SUPPORTED_LANGUAGES) {
    await access(new URL(`../docs/${language}.md`, import.meta.url));
  }
});
