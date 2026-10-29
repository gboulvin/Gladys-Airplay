// -----------------------------------------------------------------------------
// Playback engine: one AirPlay session per speaker.
//
// A source is either an audio URL (decoded to PCM by ffmpeg, like the native
// Gladys service did) or a PCM buffer synthesized in memory (the chimes).
// Both are fed to the AirPlay sender at real-time pace: the sender keeps a
// ~2 s buffer and starts the stream once it is half full.
//
// Lifecycle of `play()`:
//   - `started` resolves when the speaker accepted the session and the audio
//     flows, and rejects with a PlaybackError when it never does;
//   - `finished` always resolves, with `{ reason, durationSeconds, error? }`.
// A new playback on a speaker replaces the current one: notifications
// interrupt each other instead of queueing behind a long stream.
// -----------------------------------------------------------------------------

import { spawn as nodeSpawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createLogger } from '@gladysassistant/integration-sdk';
import { BYTES_PER_SECOND } from './sounds.js';

const defaultLogger = createLogger({ name: 'player' });

// The ESM build of the sender library is broken (CommonJS code shipped as a
// module): load its CommonJS build.
const require = createRequire(import.meta.url);
const { start: startAirplaySender } = require('@lox-audioserver/node-airplay-sender');

// No answer from the speaker within this delay: unreachable.
export const CONNECT_TIMEOUT_MS = 10_000;
// Once the source is exhausted, the receiver still plays what it buffered
// (sender buffer + receiver latency): the native service waited 7 s.
export const DRAIN_MS = 7_000;
// Pace of the in-memory sources.
export const PCM_CHUNK_MS = 100;
const PCM_CHUNK_BYTES = (BYTES_PER_SECOND * PCM_CHUNK_MS) / 1000;
// The sender only plays full packets of a buffer at least half full: the
// tail of a stream would stay stuck in it. A padding of silence pushes it
// out.
export const TAIL_PADDING = Buffer.alloc(Math.round(BYTES_PER_SECOND * 1.5));

// Only remote audio: ffmpeg also reads local files and a dozen other
// protocols, which a URL typed in a scene must never reach.
const ALLOWED_PROTOCOLS = ['http:', 'https:'];
const FFMPEG_PROTOCOL_WHITELIST = 'http,https,tcp,tls,crypto';

export class PlaybackError extends Error {
  /**
   * @param {string} code - Machine-readable reason (see ERROR_REASONS in src/i18n.js).
   * @param {string} message - Technical detail, for the logs.
   */
  constructor(code, message) {
    super(message);
    this.name = 'PlaybackError';
    this.code = code;
  }
}

/**
 * @description Check that a value is a playable audio URL.
 * @param {unknown} value - URL received from Gladys or a scene.
 * @returns {string} The normalized URL.
 */
export function validateAudioUrl(value) {
  let url;
  try {
    url = new URL(String(value ?? '').trim());
  } catch {
    throw new PlaybackError('INVALID_URL', 'Not a URL');
  }
  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
    throw new PlaybackError('INVALID_URL', `Protocol ${url.protocol} is not allowed`);
  }
  return url.href;
}

/**
 * @description ffmpeg arguments: decode any remote audio to PCM s16le
 * stereo 44.1 kHz on stdout, at real-time pace (`-re`).
 * @param {string} url - Validated audio URL.
 * @returns {string[]} Arguments.
 */
export function ffmpegArgs(url) {
  return [
    '-nostdin',
    '-hide_banner',
    '-loglevel',
    'error',
    '-protocol_whitelist',
    FFMPEG_PROTOCOL_WHITELIST,
    '-re',
    '-i',
    url,
    '-vn',
    '-acodec',
    'pcm_s16le',
    '-f',
    's16le',
    '-ar',
    '44100',
    '-ac',
    '2',
    'pipe:1',
  ];
}

/**
 * @description Create the playback engine.
 * @param {object} [deps] - Injected dependencies (tests).
 * @param {Function} [deps.startSender] - AirPlay sender factory.
 * @param {Function} [deps.spawn] - child_process.spawn.
 * @param {Function} [deps.onStateChange] - `(externalId, { playing, title })`.
 * @param {object} [deps.logger] - Logger.
 * @returns {object} The engine: play, stop, setVolume, isPlaying, stopAll.
 */
export function createPlaybackManager({
  startSender = startAirplaySender,
  spawn = nodeSpawn,
  onStateChange = () => {},
  logger = defaultLogger,
} = {}) {
  const sessions = new Map();

  /**
   * @param {object} target - `{ externalId, name, address, port, airplay2 }`.
   * @param {object} source - `{ url }` or `{ pcm, title }`.
   * @param {object} options - `{ volume, title, maxDurationSeconds, senderName, password }`.
   * @returns {{ started: Promise<void>, finished: Promise<object> }} Session promises.
   */
  function play(target, source, options) {
    const url = source.url !== undefined ? validateAudioUrl(source.url) : null;
    stop(target.externalId, 'replaced');

    const session = {
      title: options.title ?? '',
      sender: null,
      decoder: null,
      timers: new Set(),
      pacer: null,
      started: false,
      ended: false,
      sourceEnded: false,
      startedAt: null,
      bytesSent: 0,
      stderr: '',
    };
    sessions.set(target.externalId, session);

    let resolveStarted;
    let rejectStarted;
    let resolveFinished;
    const started = new Promise((resolve, reject) => {
      resolveStarted = resolve;
      rejectStarted = reject;
    });
    // A caller that only awaits `finished` must not leave a rejection unhandled.
    started.catch(() => {});
    const finished = new Promise((resolve) => {
      resolveFinished = resolve;
    });

    const later = (fn, ms) => {
      const timer = setTimeout(() => {
        session.timers.delete(timer);
        fn();
      }, ms);
      session.timers.add(timer);
    };

    function finish(reason, error) {
      if (session.ended) {
        return;
      }
      session.ended = true;
      session.timers.forEach(clearTimeout);
      session.timers.clear();
      clearInterval(session.pacer);
      if (session.decoder) {
        session.decoder.stdout?.removeAllListeners('data');
        session.decoder.kill();
      }
      try {
        session.sender?.stop();
      } catch (err) {
        logger.debug(`Sender stop failed on ${target.address}`, err);
      }
      if (sessions.get(target.externalId) === session) {
        sessions.delete(target.externalId);
      }
      const durationSeconds = session.startedAt
        ? Math.round((Date.now() - session.startedAt) / 1000)
        : 0;
      if (!session.started) {
        rejectStarted(
          error ?? new PlaybackError('STOPPED', `Playback ${reason} before it started`),
        );
      }
      if (error) {
        logger.warn(`Playback on ${target.name} (${target.address}) failed: ${error.message}`);
      } else {
        logger.info(`Playback on ${target.name} ${reason} after ${durationSeconds}s`);
      }
      resolveFinished({ reason, durationSeconds, ...(error ? { error } : {}) });
      if (!sessions.has(target.externalId)) {
        onStateChange(target.externalId, { playing: false, title: '' });
      }
    }

    session.finish = finish;

    function send(chunk) {
      if (session.ended) {
        return;
      }
      session.bytesSent += chunk.length;
      session.sender.sendPcm(chunk);
    }

    function sourceDone() {
      if (session.ended || session.sourceEnded) {
        return;
      }
      session.sourceEnded = true;
      send(TAIL_PADDING);
      later(() => finish('completed'), DRAIN_MS);
    }

    function startUrlSource() {
      const decoder = spawn('ffmpeg', ffmpegArgs(url), { stdio: ['ignore', 'pipe', 'pipe'] });
      session.decoder = decoder;
      decoder.stdout.on('data', send);
      decoder.stderr?.setEncoding?.('utf8');
      decoder.stderr?.on('data', (data) => {
        // Keep the end only: it holds the reason of a failure.
        session.stderr = `${session.stderr}${data}`.slice(-500);
      });
      decoder.on('error', (err) => {
        finish(
          'error',
          new PlaybackError(
            err.code === 'ENOENT' ? 'FFMPEG_MISSING' : 'DECODER_ERROR',
            err.message,
          ),
        );
      });
      // `close` comes after stdout is drained: a failed download exits
      // non-zero without a single byte, a cut stream after some.
      decoder.on('close', (code) => {
        if (session.ended) {
          return;
        }
        if (code !== 0 && session.bytesSent === 0) {
          finish(
            'error',
            new PlaybackError('DECODER_ERROR', session.stderr.trim() || `ffmpeg exited ${code}`),
          );
          return;
        }
        sourceDone();
      });
    }

    function startPcmSource(pcm) {
      let offset = 0;
      const pushChunk = () => {
        if (offset >= pcm.length) {
          clearInterval(session.pacer);
          sourceDone();
          return;
        }
        send(pcm.subarray(offset, offset + PCM_CHUNK_BYTES));
        offset += PCM_CHUNK_BYTES;
      };
      // Half a second up front, then real time.
      for (let i = 0; i < 500 / PCM_CHUNK_MS; i += 1) {
        pushChunk();
      }
      session.pacer = setInterval(pushChunk, PCM_CHUNK_MS);
    }

    function onReady() {
      if (session.started || session.ended) {
        return;
      }
      session.started = true;
      session.startedAt = Date.now();
      resolveStarted();
      onStateChange(target.externalId, { playing: true, title: session.title });
      later(() => finish('max_duration'), options.maxDurationSeconds * 1000);
      if (url !== null) {
        startUrlSource();
      } else {
        startPcmSource(source.pcm);
      }
    }

    function onEvent(event) {
      if (session.ended) {
        return;
      }
      if (event.event === 'device') {
        switch (event.message) {
          case 'ready':
            onReady();
            break;
          case 'need_password':
            finish(
              'error',
              new PlaybackError('PASSWORD_REQUIRED', 'The speaker asks for a password'),
            );
            break;
          case 'pair_failed':
            finish('error', new PlaybackError('PAIRING_FAILED', 'The speaker refused the pairing'));
            break;
          case 'stopped':
          case 'error':
            finish(
              session.started ? 'interrupted' : 'error',
              new PlaybackError(
                'CONNECTION_FAILED',
                `AirPlay session ${event.message}: ${event.detail?.desc ?? 'no detail'}`,
              ),
            );
            break;
          default:
            break;
        }
      } else if (event.event === 'error') {
        finish('error', new PlaybackError('CONNECTION_FAILED', event.message ?? 'AirPlay error'));
      }
    }

    later(() => {
      if (!session.started) {
        finish(
          'error',
          new PlaybackError(
            'UNREACHABLE',
            `No AirPlay answer from ${target.address}:${target.port} within ${CONNECT_TIMEOUT_MS / 1000}s`,
          ),
        );
      }
    }, CONNECT_TIMEOUT_MS);

    logger.info(
      `Playing on ${target.name} (${target.address}:${target.port}, ${target.airplay2 ? 'AirPlay 2' : 'AirPlay 1'})`,
    );
    try {
      session.sender = startSender(
        {
          host: target.address,
          port: target.port,
          airplay2: target.airplay2,
          volume: options.volume,
          name: options.senderName,
          password: options.password || null,
          log: (level, text) => {
            if (level === 'error' || level === 'warn') {
              logger.debug(`[airplay ${target.address}] ${text}`);
            }
          },
        },
        onEvent,
      );
    } catch (err) {
      finish('error', new PlaybackError('CONNECTION_FAILED', err.message));
    }

    return { started, finished };
  }

  /**
   * @description Stop the playback of a speaker.
   * @param {string} externalId - Device external id.
   * @param {string} [reason] - Why (logs, `finished.reason`).
   * @returns {boolean} Whether something was playing.
   */
  function stop(externalId, reason = 'stopped') {
    const session = sessions.get(externalId);
    if (!session) {
      return false;
    }
    sessions.delete(externalId);
    session.finish?.(reason);
    return true;
  }

  return {
    play,
    stop,
    setVolume(externalId, volume) {
      const session = sessions.get(externalId);
      if (session?.sender && session.started) {
        session.sender.setVolume(volume);
        return true;
      }
      return false;
    },
    isPlaying(externalId) {
      return sessions.get(externalId)?.started === true;
    },
    title(externalId) {
      return sessions.get(externalId)?.title ?? '';
    },
    stopAll() {
      for (const externalId of [...sessions.keys()]) {
        stop(externalId, 'shutdown');
      }
    },
  };
}
