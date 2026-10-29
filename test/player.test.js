import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONNECT_TIMEOUT_MS,
  DRAIN_MS,
  PlaybackError,
  TAIL_PADDING,
  createPlaybackManager,
  ffmpegArgs,
  validateAudioUrl,
} from '../src/player.js';
import { synthesize, SOUNDS } from '../src/sounds.js';
import { createFakeSenders, createFakeSpawn } from './helpers.js';

const target = {
  externalId: 'ext:test:speaker:aabbccddeeff',
  name: 'Kitchen',
  address: '192.168.1.20',
  port: 7000,
  airplay2: true,
};
const options = { volume: 40, title: 'Test', maxDurationSeconds: 300, senderName: 'Gladys' };

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('only http and https URLs reach ffmpeg', () => {
  assert.equal(validateAudioUrl(' https://example.com/a.mp3 '), 'https://example.com/a.mp3');
  for (const url of ['file:///etc/passwd', 'concat:a|b', 'not a url', '', null]) {
    assert.throws(
      () => validateAudioUrl(url),
      (err) => err.code === 'INVALID_URL',
      String(url),
    );
  }
  const args = ffmpegArgs('https://example.com/a.mp3');
  assert.equal(args[args.indexOf('-protocol_whitelist') + 1], 'http,https,tcp,tls,crypto');
  assert.equal(args.at(-1), 'pipe:1');
});

test('a URL playback streams the decoded audio, then drains and stops', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const { startSender, senders } = createFakeSenders();
  const { spawn, processes } = createFakeSpawn();
  const changes = [];
  const player = createPlaybackManager({
    startSender,
    spawn,
    onStateChange: (id, state) => changes.push(state),
  });

  const { started, finished } = player.play(target, { url: 'http://192.168.1.2/tts.mp3' }, options);
  await started;
  assert.equal(senders[0].options.host, '192.168.1.20');
  assert.equal(senders[0].options.airplay2, true);
  assert.equal(senders[0].options.volume, 40);
  assert.equal(processes[0].command, 'ffmpeg');
  assert.ok(player.isPlaying(target.externalId));

  processes[0].finish(0, 8192);
  await flush();
  await flush();
  // The tail padding pushes the last packets out of the sender buffer.
  assert.equal(senders[0].bytes, 8192 + TAIL_PADDING.length);
  t.mock.timers.tick(DRAIN_MS);
  const outcome = await finished;
  assert.equal(outcome.reason, 'completed');
  assert.ok(senders[0].stopped);
  assert.deepEqual(changes, [
    { playing: true, title: 'Test' },
    { playing: false, title: '' },
  ]);
  assert.equal(player.isPlaying(target.externalId), false);
});

test('a URL that cannot be read fails the playback', async () => {
  const { startSender } = createFakeSenders();
  const { spawn, processes } = createFakeSpawn();
  const player = createPlaybackManager({ startSender, spawn });
  const { started, finished } = player.play(target, { url: 'http://192.168.1.2/404.mp3' }, options);
  await started;
  processes[0].stderr.write('Server returned 404 Not Found');
  processes[0].finish(1, 0);
  const outcome = await finished;
  assert.equal(outcome.reason, 'error');
  assert.equal(outcome.error.code, 'DECODER_ERROR');
});

test('a missing ffmpeg is reported as such', async () => {
  const { startSender } = createFakeSenders();
  const { spawn, processes } = createFakeSpawn();
  const player = createPlaybackManager({ startSender, spawn });
  const { started, finished } = player.play(target, { url: 'http://192.168.1.2/a.mp3' }, options);
  await started;
  processes[0].emit('error', Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT' }));
  assert.equal((await finished).error.code, 'FFMPEG_MISSING');
});

test('a chime is paced in real time and needs no ffmpeg', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const { startSender, senders } = createFakeSenders();
  const { spawn, processes } = createFakeSpawn();
  const player = createPlaybackManager({ startSender, spawn });
  const pcm = synthesize(SOUNDS.NOTIFICATION);
  const { started, finished } = player.play(target, { pcm }, options);
  await started;
  assert.equal(processes.length, 0);
  // Half a second is sent up front, not the whole sound.
  assert.ok(senders[0].bytes < pcm.length);
  t.mock.timers.tick(10_000);
  t.mock.timers.tick(DRAIN_MS);
  assert.equal((await finished).reason, 'completed');
  assert.ok(senders[0].bytes >= pcm.length + TAIL_PADDING.length);
});

test('a speaker that never answers is unreachable', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { startSender, senders } = createFakeSenders({ answer: null });
  const player = createPlaybackManager({ startSender });
  const { started, finished } = player.play(target, { pcm: Buffer.alloc(100) }, options);
  t.mock.timers.tick(CONNECT_TIMEOUT_MS);
  await assert.rejects(
    started,
    (err) => err instanceof PlaybackError && err.code === 'UNREACHABLE',
  );
  assert.equal((await finished).reason, 'error');
  assert.ok(senders[0].stopped);
});

test('a password-protected speaker asks for the password', async () => {
  const { startSender } = createFakeSenders({ answer: 'need_password' });
  const player = createPlaybackManager({ startSender });
  const { started } = player.play(target, { pcm: Buffer.alloc(100) }, options);
  await assert.rejects(started, (err) => err.code === 'PASSWORD_REQUIRED');
});

test('a new playback replaces the current one, stop() ends it', async () => {
  const { startSender, senders } = createFakeSenders();
  const { spawn } = createFakeSpawn();
  const player = createPlaybackManager({ startSender, spawn });
  const first = player.play(target, { url: 'http://192.168.1.2/long.mp3' }, options);
  await first.started;
  const second = player.play(target, { pcm: synthesize(SOUNDS.ALERT) }, options);
  assert.equal((await first.finished).reason, 'replaced');
  assert.ok(senders[0].stopped);
  await second.started;
  assert.equal(player.setVolume(target.externalId, 80), true);
  assert.equal(senders[1].volume, 80);
  assert.equal(player.stop(target.externalId), true);
  assert.equal((await second.finished).reason, 'stopped');
  assert.equal(player.stop(target.externalId), false);
});

test('a playback is cut at the maximum duration', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { startSender } = createFakeSenders();
  const { spawn } = createFakeSpawn();
  const player = createPlaybackManager({ startSender, spawn });
  const { started, finished } = player.play(
    target,
    { url: 'http://radio.example/live' },
    {
      ...options,
      maxDurationSeconds: 30,
    },
  );
  await started;
  t.mock.timers.tick(30_000);
  assert.equal((await finished).reason, 'max_duration');
});
