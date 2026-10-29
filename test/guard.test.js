import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { HapSession } from '@sonn-audio/node-airplay';
import {
  MAX_RECOVERIES,
  RECOVERY_WINDOW_MS,
  installCrashGuard,
  isAirplayLibraryError,
} from '../src/guard.js';

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

// A real failure of the library: decrypting a frame whose tag does not match,
// what a desynced or malformed speaker answer produces in its socket handler.
function libraryError() {
  const session = new HapSession(Buffer.alloc(32, 1), Buffer.alloc(32, 2), Buffer.alloc(32));
  const frame = Buffer.concat([Buffer.from([4, 0]), Buffer.alloc(4 + 16, 9)]);
  try {
    session.decrypt(frame);
  } catch (err) {
    return err;
  }
  throw new Error('the library accepted a forged frame');
}

function setup(t, { onRecover = () => {} } = {}) {
  const proc = new EventEmitter();
  const exits = [];
  const recovered = [];
  let clock = 0;
  const uninstall = installCrashGuard({
    proc,
    exit: (code) => exits.push(code),
    now: () => clock,
    logger: silentLogger,
    onRecover: (err) => {
      recovered.push(err);
      onRecover(err);
    },
  });
  t.after(uninstall);
  return {
    proc,
    exits,
    recovered,
    tick: (ms) => {
      clock += ms;
    },
  };
}

test('errors are told apart by where they were raised', () => {
  assert.equal(isAirplayLibraryError(libraryError()), true);
  assert.equal(isAirplayLibraryError(new Error('ours')), false);
  assert.equal(isAirplayLibraryError('a string'), false);
  assert.equal(isAirplayLibraryError(undefined), false);
});

test('a library error stops the playbacks and keeps the integration running', (t) => {
  const { proc, exits, recovered } = setup(t);
  const err = libraryError();
  proc.emit('uncaughtException', err);
  assert.deepEqual(recovered, [err]);
  assert.deepEqual(exits, []);
});

test('a library rejection is recovered the same way', (t) => {
  const { proc, exits, recovered } = setup(t);
  proc.emit('unhandledRejection', libraryError());
  assert.equal(recovered.length, 1);
  assert.deepEqual(exits, []);
});

test('any other uncaught error still ends the process', (t) => {
  const { proc, exits, recovered } = setup(t);
  proc.emit('uncaughtException', new TypeError('a bug of ours'));
  proc.emit('unhandledRejection', 'no stack');
  assert.deepEqual(exits, [1, 1]);
  assert.deepEqual(recovered, []);
});

test('repeated library failures end the process, isolated ones do not', (t) => {
  const { proc, exits, recovered, tick } = setup(t);
  for (let i = 0; i < MAX_RECOVERIES; i += 1) {
    proc.emit('uncaughtException', libraryError());
  }
  assert.equal(recovered.length, MAX_RECOVERIES);
  assert.deepEqual(exits, []);
  // Once the window has passed, the count starts over.
  tick(RECOVERY_WINDOW_MS);
  proc.emit('uncaughtException', libraryError());
  assert.deepEqual(exits, []);
  for (let i = 0; i < MAX_RECOVERIES; i += 1) {
    proc.emit('uncaughtException', libraryError());
  }
  assert.deepEqual(exits, [1]);
});

test('a recovery that fails ends the process', (t) => {
  const { proc, exits } = setup(t, {
    onRecover: () => {
      throw new Error('stop failed');
    },
  });
  proc.emit('uncaughtException', libraryError());
  assert.deepEqual(exits, [1]);
});

test('uninstalling removes the handlers', () => {
  const proc = new EventEmitter();
  const uninstall = installCrashGuard({ proc, onRecover() {}, logger: silentLogger });
  assert.equal(proc.listenerCount('uncaughtException'), 1);
  uninstall();
  assert.equal(proc.listenerCount('uncaughtException'), 0);
  assert.equal(proc.listenerCount('unhandledRejection'), 0);
});
