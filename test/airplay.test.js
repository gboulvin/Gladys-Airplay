// -----------------------------------------------------------------------------
// The AirPlay sender (src/airplay.js) against a fake @sonn-audio/node-airplay:
// lane choice, PTP/NTP fallbacks, packetization, teardown, error mapping. The
// pure parts of the library (capabilities, errors, identity) are the real ones.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realLib from '@sonn-audio/node-airplay';
import {
  LANES,
  PACKET_BYTES,
  PtpUnavailableError,
  TIMINGS,
  classifyError,
  createSenderFactory,
  routeOf,
} from '../src/airplay.js';

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

// Feature words: bit 38 (AirPlay 2) alone, and with bit 41 (PTP).
const AIRPLAY_2_NTP = '0x0,0x40';
const AIRPLAY_2_PTP = '0x0,0x240';

function createFakeLib({ ptpFails = false, wantsNtp = false, openError = null } = {}) {
  const calls = {
    opens: [],
    connections: [],
    setups: [],
    requests: [],
    volumes: [],
    metadata: [],
    packets: [],
    peers: new Set(),
    ptpStarts: 0,
    ntpStarts: 0,
    raop: [],
    realtime: null,
    started: 0,
    senderStops: 0,
  };
  const fakeRtsp = () => ({
    closed: false,
    async request(method) {
      calls.requests.push(method);
      return { status: 200, headers: new Map(), body: Buffer.alloc(0) };
    },
    close() {
      this.closed = true;
    },
  });
  class AirPlayConnection {
    static async open(options) {
      calls.opens.push(options);
      if (openError) {
        throw openError;
      }
      const connection = new AirPlayConnection();
      connection.options = options;
      connection.rtsp = fakeRtsp();
      connection.sessionUrl = 'rtsp://172.20.0.5/123';
      connection.hap = { sharedSecret: Buffer.alloc(32, 7) };
      connection.closed = false;
      calls.connections.push(connection);
      return connection;
    }

    async setupSession(name, { timing }) {
      calls.setups.push(timing);
      return { eventPort: 0, wantsNtpTiming: wantsNtp && timing === 'ptp' };
    }

    close() {
      this.closed = true;
    }
  }
  class PtpEngine {
    constructor(options) {
      this.clockId = options.clockId;
    }

    async start() {
      calls.ptpStarts += 1;
      if (ptpFails) {
        throw Object.assign(new Error('bind EACCES 0.0.0.0:319'), { code: 'EACCES' });
      }
    }

    addPeer(host) {
      calls.peers.add(host);
    }

    removePeer(host) {
      calls.peers.delete(host);
    }

    now() {
      return 0n;
    }
  }
  class NtpTimingResponder {
    async start() {
      calls.ntpStarts += 1;
      return 40000;
    }

    stop() {}
  }
  const socket = { close() {} };
  class RealtimeSender {
    static async bindSockets() {
      return { data: socket, control: socket, dataPort: 6001, controlPort: 6002 };
    }

    constructor(options) {
      calls.realtime = options;
    }

    start() {
      calls.started += 1;
    }

    stop() {
      calls.senderStops += 1;
    }

    sendPacket(pcm) {
      calls.packets.push(pcm.length);
    }
  }
  class RaopStreamer {
    constructor(options) {
      this.options = options;
    }

    start() {
      calls.started += 1;
    }

    stop() {
      calls.senderStops += 1;
    }

    sendPacket(pcm) {
      calls.packets.push(pcm.length);
    }
  }
  const lib = {
    ...realLib,
    AirPlayConnection,
    PtpEngine,
    NtpTimingResponder,
    RealtimeSender,
    RaopStreamer,
    async setupRealtimeStream() {
      return { dataPort: 7100, controlPort: 7101 };
    },
    async setVolume(rtsp, url, volume) {
      calls.volumes.push(volume);
    },
    async setMetadata(rtsp, url, metadata) {
      calls.metadata.push(metadata);
    },
    async connectRaop(options) {
      calls.raop.push(options);
      return {
        rtsp: fakeRtsp(),
        sessionUrl: 'rtsp://172.20.0.5/456',
        timing: { stop() {} },
      };
    },
  };
  return { lib, calls };
}

// Start a sender and wait for its first event.
async function open(lib, options) {
  const events = [];
  const startSender = createSenderFactory({ lib, logger: silentLogger });
  const sender = startSender(
    { host: '192.168.1.20', port: 7000, volume: 40, name: 'Gladys', title: 'Test', ...options },
    (event) => events.push(event),
  );
  for (let i = 0; i < 50 && events.length === 0; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  return { sender, events, startSender };
}

test('the route follows the speaker: RAOP, AirPlay 2 over PTP or NTP', () => {
  assert.deepEqual(routeOf({ airplay2: true, model: 'AudioAccessory5,1', features: '0x0,0x40' }), {
    lane: LANES.AIRPLAY_2,
    timing: TIMINGS.PTP,
    apple: true,
  });
  assert.equal(
    routeOf({ airplay2: true, model: 'BeoLab50', features: AIRPLAY_2_PTP }).timing,
    'ptp',
  );
  assert.equal(routeOf({ airplay2: true, model: 'Sonos', features: AIRPLAY_2_NTP }).timing, 'ntp');
  assert.equal(routeOf({ airplay2: false, model: 'AirPort4,107', features: null }).lane, 'raop');
  // Unreadable features never break the route.
  assert.equal(routeOf({ airplay2: true, model: 'X', features: 'garbage' }).timing, 'ntp');
});

test('failures map to the reasons the player reports', () => {
  const { HapError } = realLib;
  assert.equal(classifyError(new HapError('pair-setup M1 rejected', 470)), 'pair_failed');
  assert.equal(
    classifyError(new HapError('server SRP proof mismatch in M4 (wrong PIN or password)')),
    'need_password',
  );
  assert.equal(classifyError(new Error('RAOP ANNOUNCE failed with status 401')), 'need_password');
  assert.equal(classifyError(new Error('session SETUP failed with status 403')), 'pair_failed');
  assert.equal(
    classifyError(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })),
    'unreachable',
  );
  assert.equal(
    classifyError(new Error('RTSP connect to 192.168.1.20:7000 timed out')),
    'unreachable',
  );
  assert.equal(classifyError(new PtpUnavailableError('EACCES')), 'ptp_unavailable');
  assert.equal(classifyError(new Error('stream SETUP reply carried no stream')), 'error');
});

test('a HomePod gets an AirPlay 2 session on PTP, packets of 352 frames, and a clean teardown', async () => {
  const { lib, calls } = createFakeLib();
  const { sender, events } = await open(lib, {
    airplay2: true,
    model: 'AudioAccessory5,1',
    features: AIRPLAY_2_PTP,
    password: 'secret',
  });
  assert.equal(events[0].message, 'ready');
  assert.equal(calls.opens[0].password, 'secret');
  assert.equal(calls.opens[0].identity.length, 8);
  assert.deepEqual(calls.setups, ['ptp']);
  assert.ok(calls.peers.has('192.168.1.20'));
  assert.equal(calls.realtime.timing, 'ptp');
  assert.deepEqual(calls.volumes, [40]);
  assert.deepEqual(calls.metadata, [{ title: 'Test', artist: 'Gladys' }]);
  assert.equal(calls.started, 1);

  sender.sendPcm(Buffer.alloc(PACKET_BYTES * 2 + 100));
  assert.deepEqual(calls.packets, [PACKET_BYTES, PACKET_BYTES]);
  sender.sendPcm(Buffer.alloc(PACKET_BYTES - 100));
  assert.deepEqual(calls.packets, [PACKET_BYTES, PACKET_BYTES, PACKET_BYTES]);

  sender.setVolume(80);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls.volumes, [40, 80]);

  sender.stop();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(calls.requests.includes('TEARDOWN'));
  assert.equal(calls.connections[0].closed, true);
  assert.equal(calls.senderStops, 1);
  assert.equal(calls.peers.size, 0);
  // Nothing is sent once stopped.
  sender.sendPcm(Buffer.alloc(PACKET_BYTES));
  assert.equal(calls.packets.length, 3);
});

test('an Apple speaker without a PTP clock is reported, never played on NTP', async () => {
  const { lib, calls } = createFakeLib({ ptpFails: true });
  const { events } = await open(lib, {
    airplay2: true,
    model: 'AppleTV14,1',
    features: AIRPLAY_2_PTP,
  });
  assert.equal(events[0].message, 'ptp_unavailable');
  assert.equal(calls.opens.length, 0);
});

test('another receiver falls back to NTP when the PTP clock cannot be served', async () => {
  const { lib, calls } = createFakeLib({ ptpFails: true });
  const { events } = await open(lib, {
    airplay2: true,
    model: 'BeoLab50',
    features: AIRPLAY_2_PTP,
  });
  assert.equal(events[0].message, 'ready');
  assert.deepEqual(calls.setups, ['ntp']);
  assert.equal(calls.ntpStarts, 1);
  assert.equal(calls.realtime.timing, 'ntp');
  assert.equal(typeof calls.realtime.ptp.now(), 'bigint');
});

test('a receiver asking for NTP in its SETUP reply gets a new session on NTP', async () => {
  const { lib, calls } = createFakeLib({ wantsNtp: true });
  const { events } = await open(lib, {
    airplay2: true,
    model: 'BeoLab50',
    features: AIRPLAY_2_PTP,
  });
  assert.equal(events[0].message, 'ready');
  assert.equal(calls.opens.length, 2);
  assert.deepEqual(calls.setups, ['ptp', 'ntp']);
  assert.equal(calls.connections[0].closed, true);
  assert.equal(calls.connections[1].closed, false);
  assert.equal(calls.peers.size, 0);
});

test('an AirPlay 1 receiver gets a RAOP session with its encryption types', async () => {
  const { lib, calls } = createFakeLib();
  const { sender, events } = await open(lib, {
    airplay2: false,
    port: 5000,
    model: 'AirPort4,107',
    encryptionTypes: '0,4',
  });
  assert.equal(events[0].message, 'ready');
  assert.equal(calls.opens.length, 0);
  assert.equal(calls.raop[0].et, '0,4');
  assert.equal(calls.raop[0].port, 5000);
  sender.sendPcm(Buffer.alloc(PACKET_BYTES));
  assert.deepEqual(calls.packets, [PACKET_BYTES]);
});

test('a speaker that refuses the connection is unreachable', async () => {
  const { lib } = createFakeLib({
    openError: Object.assign(new Error('connect EHOSTUNREACH'), { code: 'EHOSTUNREACH' }),
  });
  const { events } = await open(lib, { airplay2: true, model: 'Sonos', features: AIRPLAY_2_NTP });
  assert.equal(events[0].message, 'unreachable');
});

test('the receiver dropping the session is reported as stopped', async () => {
  const { lib, calls } = createFakeLib();
  const { events } = await open(lib, { airplay2: true, model: 'Sonos', features: AIRPLAY_2_NTP });
  calls.opens[0].onEvent('receiver closed the control channel');
  assert.deepEqual(
    events.map((event) => event.message),
    ['ready', 'stopped'],
  );
});

test('a sender stopped while connecting never reports ready', async () => {
  const { lib, calls } = createFakeLib();
  const events = [];
  const startSender = createSenderFactory({ lib, logger: silentLogger });
  const sender = startSender(
    { host: '192.168.1.20', port: 7000, volume: 40, airplay2: true, model: 'Sonos' },
    (event) => events.push(event),
  );
  sender.stop();
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.deepEqual(events, []);
  assert.equal(calls.connections[0].closed, true);
});

test('one PTP engine serves every session of the process', async () => {
  const { lib, calls } = createFakeLib();
  const startSender = createSenderFactory({ lib, logger: silentLogger });
  const options = { port: 7000, volume: 40, airplay2: true, model: 'AudioAccessory5,1' };
  const ready = (host) =>
    new Promise((resolve) => {
      startSender({ ...options, host }, resolve);
    });
  await Promise.all([ready('192.168.1.20'), ready('192.168.1.21')]);
  assert.equal(calls.ptpStarts, 1);
  assert.deepEqual([...calls.peers].sort(), ['192.168.1.20', '192.168.1.21']);
});
