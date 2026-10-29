import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BYTES_PER_SECOND, SOUNDS, durationOf, synthesize } from '../src/sounds.js';

test('every chime is short, stereo 16-bit PCM, and never clips', () => {
  for (const sound of Object.values(SOUNDS)) {
    const pcm = synthesize(sound);
    assert.equal(pcm.length % 4, 0, `${sound}: whole stereo frames`);
    const seconds = durationOf(pcm);
    assert.ok(seconds > 0.5 && seconds < 3, `${sound}: ${seconds}s`);
    let peak = 0;
    for (let offset = 0; offset < pcm.length; offset += 2) {
      peak = Math.max(peak, Math.abs(pcm.readInt16LE(offset)));
    }
    assert.ok(peak > 8000 && peak < 32767, `${sound}: peak ${peak}`);
    // The lead-in is silent.
    assert.equal(pcm.readInt16LE(Math.round(BYTES_PER_SECOND * 0.1) & ~3), 0);
  }
});

test('an unknown sound is refused', () => {
  assert.throws(() => synthesize('fanfare'), /Unknown sound/);
});
