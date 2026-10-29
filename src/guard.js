// -----------------------------------------------------------------------------
// Crash guard for the AirPlay library.
//
// The library parses and decrypts what a speaker sends inside its socket
// handlers: a malformed or desynced answer throws there, where no caller can
// catch it, and the uncaught exception would stop the whole integration (a
// user's speaker took down 1.0.0 that way). Such an error is confined to one
// AirPlay session, so the guard logs it, stops the playbacks and keeps the
// integration running; the playback reports its failure through the usual
// timeout path.
//
// Narrow on purpose:
//   - only errors raised from the library's own code are recovered — any
//     other uncaught error still ends the process, and the Gladys supervisor
//     restarts the container, as Node would by default;
//   - past MAX_RECOVERIES within RECOVERY_WINDOW_MS, the process exits too:
//     a loop of failures is not something to paper over.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const defaultLogger = createLogger({ name: 'guard' });

export const MAX_RECOVERIES = 5;
export const RECOVERY_WINDOW_MS = 60_000;

const LIBRARY_FRAME = /[\\/]node_modules[\\/]@sonn-audio[\\/]node-airplay[\\/]/;

/**
 * @description Whether an error was raised from the AirPlay library's code.
 * @param {unknown} err - Uncaught error or rejection reason.
 * @returns {boolean} True when its stack runs through the library.
 */
export function isAirplayLibraryError(err) {
  return typeof err?.stack === 'string' && LIBRARY_FRAME.test(err.stack);
}

/**
 * @description Install the guard on the process.
 * @param {object} options - Options.
 * @param {Function} options.onRecover - Called with the error before the
 * integration carries on (stops the playbacks).
 * @param {object} [options.proc] - The process (tests).
 * @param {Function} [options.exit] - Exit function (tests).
 * @param {Function} [options.now] - Clock (tests).
 * @param {object} [options.logger] - Logger.
 * @returns {Function} Uninstall function.
 */
export function installCrashGuard({
  onRecover,
  proc = process,
  exit = (code) => proc.exit(code),
  now = Date.now,
  logger = defaultLogger,
}) {
  let recoveries = [];

  function handle(err, origin) {
    if (!isAirplayLibraryError(err)) {
      logger.error(`Uncaught ${origin}, exiting`, err);
      exit(1);
      return;
    }
    const time = now();
    recoveries = [...recoveries.filter((at) => time - at < RECOVERY_WINDOW_MS), time];
    if (recoveries.length > MAX_RECOVERIES) {
      logger.error(
        `AirPlay library failed ${recoveries.length} times within ${RECOVERY_WINDOW_MS / 1000}s, exiting`,
        err,
      );
      exit(1);
      return;
    }
    logger.error('AirPlay session failed inside the AirPlay library, playbacks stopped', err);
    try {
      onRecover(err);
    } catch (recoverErr) {
      logger.error('Recovery after an AirPlay library failure failed, exiting', recoverErr);
      exit(1);
    }
  }

  const onException = (err) => handle(err, 'exception');
  const onRejection = (reason) => handle(reason, 'rejection');
  proc.on('uncaughtException', onException);
  proc.on('unhandledRejection', onRejection);
  return () => {
    proc.off('uncaughtException', onException);
    proc.off('unhandledRejection', onRejection);
  };
}
