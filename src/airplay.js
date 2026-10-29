// -----------------------------------------------------------------------------
// AirPlay sender, on top of @sonn-audio/node-airplay.
//
// The library hands out the protocol pieces (RTSP, HAP pairing, PTP and NTP
// timing, the realtime RTP stream, RAOP); this module assembles them into one
// session per playback and exposes the small interface the player drives:
//
//   const sender = startSender(options, onEvent);
//   sender.sendPcm(chunk);   // s16le stereo 44.1 kHz, any size, real-time pace
//   sender.setVolume(50);
//   sender.stop();
//
// `onEvent` receives `{ event: 'device', message }` with `ready` once the audio
// can flow, or the reason it cannot: `unreachable`, `need_password`,
// `pair_failed`, `ptp_unavailable`, `error`, and `stopped` when the receiver
// drops a session that was running.
//
// Lanes, per speaker:
//   - AirPlay 1 (RAOP): AirPort Express, older receivers and third-party gear;
//   - AirPlay 2 over PTP: the sender serves the clock (UDP 319/320). Apple
//     receivers (HomePod, Apple TV) only render on this lane;
//   - AirPlay 2 over NTP: receivers without PTP, and those that ask for NTP in
//     their SETUP reply although they advertise PTP.
// -----------------------------------------------------------------------------

import { randomBytes, randomInt } from 'node:crypto';
import * as airplayLib from '@sonn-audio/node-airplay';
import { createLogger } from '@gladysassistant/integration-sdk';

const defaultLogger = createLogger({ name: 'airplay' });

export const LANES = { RAOP: 'raop', AIRPLAY_2: 'airplay2' };
export const TIMINGS = { PTP: 'ptp', NTP: 'ntp' };

// One RTP packet: 352 frames of 16-bit stereo.
export const PACKET_BYTES = airplayLib.FRAMES_PER_PACKET * 4;
// Under the player's own 10 s: a refused or silent speaker is reported as
// such, not as a generic timeout.
export const CONNECT_TIMEOUT_MS = 8000;
const TEARDOWN_TIMEOUT_MS = 1500;

const UNREACHABLE_CODES = ['ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT', 'EHOSTDOWN'];

export class PtpUnavailableError extends Error {
  constructor(cause) {
    super(`PTP clock unavailable (UDP 319/320): ${cause}`);
    this.name = 'PtpUnavailableError';
  }
}

/**
 * @description Which lane and timing a speaker gets.
 * @param {object} target - `{ airplay2, model, features }`.
 * @param {object} [lib] - The AirPlay library (tests).
 * @returns {{ lane: string, timing: string|null, apple: boolean }} The route.
 */
export function routeOf({ airplay2, model, features }, lib = airplayLib) {
  let capabilities;
  try {
    capabilities = lib.readCapabilities({ features: features ?? undefined, model: model ?? '' });
  } catch {
    capabilities = lib.readCapabilities({ model: model ?? '' });
  }
  if (!airplay2) {
    return { lane: LANES.RAOP, timing: null, apple: capabilities.isAppleReceiver };
  }
  // Apple receivers render silence on an NTP-timed stream; the others get
  // PTP when they advertise it, and say so in the SETUP reply when they lied.
  const ptp = capabilities.isAppleReceiver || capabilities.supportsPtp;
  return {
    lane: LANES.AIRPLAY_2,
    timing: ptp ? TIMINGS.PTP : TIMINGS.NTP,
    apple: capabilities.isAppleReceiver,
  };
}

/**
 * @description The player event a failure translates to.
 * @param {Error} err - Failure of the session setup.
 * @param {object} [lib] - The AirPlay library (tests).
 * @returns {string} `unreachable`, `need_password`, `pair_failed`,
 * `ptp_unavailable` or `error`.
 */
export function classifyError(err, lib = airplayLib) {
  if (err instanceof PtpUnavailableError) {
    return 'ptp_unavailable';
  }
  const text = String(err?.message ?? '');
  if (err instanceof lib.HapError) {
    // 470: the receiver wants a full HomeKit pairing ("only people sharing
    // this home"); a wrong SRP proof is a wrong password.
    return /password|PIN/i.test(text) && err.httpStatus !== 470 ? 'need_password' : 'pair_failed';
  }
  if (/status 401\b/.test(text)) {
    return 'need_password';
  }
  if (/status (403|470)\b/.test(text)) {
    return 'pair_failed';
  }
  if (UNREACHABLE_CODES.includes(err?.code) || /connect to .* timed out/.test(text)) {
    return 'unreachable';
  }
  return 'error';
}

/**
 * @description Create the sender factory. The process holds one sender
 * identity and at most one PTP grandmaster: only one socket per host can bind
 * UDP 319/320, so every AirPlay 2 session shares the engine and adds its
 * receiver as a peer.
 * @param {object} [deps] - `{ lib, logger }` (tests).
 * @returns {Function} `startSender(options, onEvent)`.
 */
export function createSenderFactory({ lib = airplayLib, logger = defaultLogger } = {}) {
  const identity = lib.createIdentity(randomBytes(8));
  let ptpEngine = null;
  const log = (message) => logger.debug(message);

  function acquirePtp() {
    if (!ptpEngine) {
      const engine = new lib.PtpEngine({ clockId: identity.clockId, peers: [], onLog: log });
      ptpEngine = engine.start().then(
        () => engine,
        (err) => {
          // Not cached: the port may be freed, the next playback retries.
          ptpEngine = null;
          throw err;
        },
      );
    }
    return ptpEngine;
  }

  return function startSender(options, onEvent) {
    const { host, port } = options;
    const route = routeOf(options, lib);
    const cleanups = [];
    let stream = null;
    let control = null;
    let pending = Buffer.alloc(0);
    let stopped = false;

    const emit = (message, desc) => {
      if (!stopped) {
        onEvent({ event: 'device', message, detail: { desc } });
      }
    };

    function teardown() {
      stream = null;
      while (cleanups.length > 0) {
        try {
          cleanups.pop()();
        } catch (err) {
          log(`AirPlay cleanup on ${host}: ${err.message}`);
        }
      }
    }

    // TEARDOWN is a courtesy: the receiver frees the session at once instead
    // of waiting for its own timeout. The connection closes once it is
    // answered (or not), never before the request is out.
    function closeRtsp(rtsp, sessionUrl, close = () => rtsp.close()) {
      return () => {
        let request;
        try {
          request = rtsp.request('TEARDOWN', { uri: sessionUrl, timeoutMs: TEARDOWN_TIMEOUT_MS });
        } catch {
          request = Promise.resolve();
        }
        request.catch(() => {}).finally(close);
      };
    }

    async function openConnection() {
      const connection = await lib.AirPlayConnection.open({
        host,
        port,
        password: options.password || undefined,
        timeoutMs: CONNECT_TIMEOUT_MS,
        identity: identity.bytes,
        name: options.name,
        onEvent: (reason) => {
          log(`AirPlay ${host}: ${reason}`);
          if (/closed the control channel/.test(reason)) {
            emit('stopped', reason);
          }
        },
      });
      // Closing the connection also stops its keepalive and event socket.
      const release = closeRtsp(connection.rtsp, connection.sessionUrl, () => connection.close());
      cleanups.push(release);
      return { connection, release };
    }

    async function openAirplay2() {
      let timing = route.timing;
      let ptp = null;
      if (timing === TIMINGS.PTP) {
        try {
          ptp = await acquirePtp();
        } catch (err) {
          if (route.apple) {
            throw new PtpUnavailableError(err.message);
          }
          logger.warn(`PTP unavailable (${err.message}), NTP timing for ${host}`);
          timing = TIMINGS.NTP;
        }
      }

      let { connection, release } = await openConnection();
      if (timing === TIMINGS.PTP) {
        const engine = ptp;
        engine.addPeer(host);
        cleanups.push(() => engine.removePeer(host));
        const result = await connection.setupSession(options.name, { timing: TIMINGS.PTP });
        if (result.wantsNtpTiming && !route.apple) {
          // The receiver advertised PTP but answers with a timing port: it
          // will never probe our clock. The session is re-established on NTP.
          log(`AirPlay ${host} asks for NTP timing, re-establishing the session`);
          ptp.removePeer(host);
          ptp = null;
          cleanups.splice(cleanups.indexOf(release), 1);
          release();
          ({ connection } = await openConnection());
          timing = TIMINGS.NTP;
        }
      }
      if (timing === TIMINGS.NTP) {
        const responder = new lib.NtpTimingResponder();
        const timingPort = await responder.start();
        cleanups.push(() => responder.stop());
        await connection.setupSession(options.name, { timing: TIMINGS.NTP, timingPort });
      }

      const sockets = await lib.RealtimeSender.bindSockets();
      let socketsOwned = true;
      cleanups.push(() => {
        if (socketsOwned) {
          sockets.data.close();
          sockets.control.close();
        }
      });
      const { rtsp, sessionUrl, hap } = connection;
      const ports = await lib.setupRealtimeStream(rtsp, sessionUrl, {
        audioKey: hap.sharedSecret,
        localDataPort: sockets.dataPort,
        localControlPort: sockets.controlPort,
        streamConnectionId: randomInt(0x7fffffff),
      });
      // On NTP the anchor packet reads no PTP time, but the sender still asks
      // a clock for its start: the host's realtime clock, in nanoseconds.
      const clock = ptp ?? {
        clockId: identity.clockId,
        now: () => BigInt(Date.now()) * 1_000_000n,
      };
      const sender = new lib.RealtimeSender(
        {
          host,
          dataPort: ports.dataPort,
          controlPort: ports.controlPort,
          audioKey: hap.sharedSecret,
          ptp: clock,
          timing,
          onLog: log,
        },
        sockets.data,
        sockets.control,
      );
      // The sender now owns the sockets and closes them on stop.
      socketsOwned = false;
      cleanups.push(() => sender.stop());
      control = { rtsp, sessionUrl };
      await lib.setVolume(rtsp, sessionUrl, options.volume);
      // Some receivers (Sonos) withhold the audio until they had metadata.
      await lib
        .setMetadata(rtsp, sessionUrl, { title: options.title, artist: options.name }, 0)
        .catch((err) => log(`AirPlay ${host} metadata: ${err.message}`));
      sender.start();
      logger.info(`AirPlay 2 session on ${host}:${port} (${timing.toUpperCase()} timing)`);
      return sender;
    }

    async function openRaop() {
      const session = await lib.connectRaop({
        host,
        port,
        et: options.encryptionTypes ?? undefined,
        timeoutMs: CONNECT_TIMEOUT_MS,
        onLog: log,
      });
      cleanups.push(closeRtsp(session.rtsp, session.sessionUrl));
      const streamer = new lib.RaopStreamer({ host, session, onLog: log });
      cleanups.push(() => streamer.stop());
      control = { rtsp: session.rtsp, sessionUrl: session.sessionUrl };
      await lib
        .setVolume(session.rtsp, session.sessionUrl, options.volume)
        .catch((err) => log(`AirPlay ${host} volume: ${err.message}`));
      streamer.start();
      logger.info(`AirPlay 1 (RAOP) session on ${host}:${port}`);
      return streamer;
    }

    (route.lane === LANES.RAOP ? openRaop() : openAirplay2()).then(
      (opened) => {
        if (stopped) {
          teardown();
          return;
        }
        stream = opened;
        emit('ready');
      },
      (err) => {
        logger.debug(`AirPlay session on ${host}:${port} failed: ${err.message}`);
        teardown();
        emit(classifyError(err, lib), err.message);
      },
    );

    return {
      sendPcm(chunk) {
        if (!stream) {
          return;
        }
        pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
        let offset = 0;
        while (pending.length - offset >= PACKET_BYTES) {
          stream.sendPacket(pending.subarray(offset, offset + PACKET_BYTES));
          offset += PACKET_BYTES;
        }
        // Less than a packet left: kept for the next chunk.
        pending = Buffer.from(pending.subarray(offset));
      },

      setVolume(volume) {
        if (control) {
          lib
            .setVolume(control.rtsp, control.sessionUrl, volume)
            .catch((err) => log(`AirPlay ${host} volume: ${err.message}`));
        }
      },

      stop() {
        if (stopped) {
          return;
        }
        stopped = true;
        teardown();
      },
    };
  };
}
