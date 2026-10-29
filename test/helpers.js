// -----------------------------------------------------------------------------
// Test doubles: fake AirPlay senders, a fake ffmpeg, mDNS scan fixtures.
// Nothing here touches the network or spawns a process.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * @description Fake `start()` of the AirPlay sender library.
 * @param {object} [options] - `{ answer }`: the device event sent once the
 * session opens (`ready`, `need_password`, `stopped`…), or `null` for a
 * speaker that never answers.
 * @returns {{ startSender: Function, senders: object[] }} Factory and record.
 */
export function createFakeSenders({ answer = 'ready' } = {}) {
  const senders = [];
  const startSender = (options, onEvent) => {
    const sender = {
      options,
      onEvent,
      bytes: 0,
      volume: options.volume,
      stopped: false,
      sendPcm(chunk) {
        this.bytes += chunk.length;
      },
      setVolume(volume) {
        this.volume = volume;
      },
      stop() {
        this.stopped = true;
      },
    };
    senders.push(sender);
    if (answer !== null) {
      queueMicrotask(() => onEvent({ event: 'device', message: answer, detail: {} }));
    }
    return sender;
  };
  return { startSender, senders };
}

/**
 * @description Fake `child_process.spawn` for ffmpeg: the test drives its
 * stdout and exit code.
 * @returns {{ spawn: Function, processes: object[] }} Factory and record.
 */
export function createFakeSpawn() {
  const processes = [];
  const spawn = (command, args) => {
    const child = new EventEmitter();
    child.command = command;
    child.args = args;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.killed = false;
    child.kill = () => {
      child.killed = true;
    };
    // Emit some PCM then exit with `code`, like ffmpeg does.
    child.finish = (code = 0, bytes = 4096) => {
      if (bytes > 0) {
        child.stdout.write(Buffer.alloc(bytes));
      }
      child.stdout.end();
      setImmediate(() => child.emit('close', code));
    };
    processes.push(child);
    return child;
  };
  return { spawn, processes };
}

export const tempDataDir = () => mkdtemp(path.join(tmpdir(), 'gladys-airplay-'));

// Raw results of an `mdns` scan, as the core relays them.
export const KITCHEN_MAC = 'aabbccddeeff';
export const OFFICE_MAC = '112233445566';

export const MDNS_RESULTS = [
  {
    name: 'Kitchen._airplay._tcp.local',
    host: 'Kitchen-HomePod.local',
    addresses: ['fe80::1', '192.168.1.20'],
    port: 7000,
    txt: [
      'deviceid=AA:BB:CC:DD:EE:FF',
      'features=0x4A7FDFD5,0xBC177FDE',
      'model=AudioAccessory5,1',
    ],
  },
  {
    name: 'AABBCCDDEEFF@Kitchen._raop._tcp.local',
    host: 'Kitchen-HomePod.local',
    addresses: ['192.168.1.20'],
    port: 7000,
    txt: ['am=AudioAccessory5,1', 'tp=UDP'],
  },
  {
    // An AirPort Express of the first generation: RAOP only.
    name: '112233445566@Office._raop._tcp.local',
    host: 'Office.local',
    addresses: ['192.168.1.30'],
    port: 5000,
    txt: ['am=AirPort4,107', 'pw=false'],
  },
];
