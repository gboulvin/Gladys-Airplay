// -----------------------------------------------------------------------------
// Catalog fields: keywords (search only) and countries (where the integration
// is usable). AirPlay works on any local network, in every country: the
// manifest declares no `countries`, which the store reads as "worldwide".
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(
  readFileSync(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

test('catalog keywords are 1-10 unique terms of 2-30 characters', () => {
  const { keywords } = manifest;
  assert.ok(Array.isArray(keywords) && keywords.length >= 1 && keywords.length <= 10);
  for (const keyword of keywords) {
    assert.ok(keyword.trim().length >= 2 && keyword.trim().length <= 30, keyword);
  }
  const normalized = keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.equal(new Set(normalized).size, keywords.length, 'keywords must be unique');
});

test('the integration is listed worldwide', () => {
  // Declaring `countries` would hide it from the catalog browse views of
  // every other country.
  assert.equal(manifest.countries, undefined);
});

test('the catalog categories are store vocabulary', () => {
  const vocabulary = [
    'climate',
    'lighting',
    'energy',
    'security',
    'multimedia',
    'appliances',
    'environment',
    'protocols',
    'network',
    'notifications',
    'assistants',
    'services',
    'transport',
    'vehicles',
    'servers',
    'leisure',
  ];
  for (const category of manifest.categories) {
    assert.ok(vocabulary.includes(category), category);
  }
});
