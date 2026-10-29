// -----------------------------------------------------------------------------
// Persistent state, under /data (the only writable volume of the container).
//
// AirPlay cannot read the volume of an idle speaker, so the volume chosen in
// Gladys for each speaker is the integration's own state: it survives
// restarts here. Nothing secret is ever written.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'store' });

export const DEFAULT_DATA_DIR = process.env.DATA_DIR || '/data';

/**
 * @description Create the volume store.
 * @param {string} [dataDir] - Writable directory.
 * @returns {object} The store: load, get, set.
 */
export function createVolumeStore(dataDir = DEFAULT_DATA_DIR) {
  const file = path.join(dataDir, 'volumes.json');
  let volumes = {};
  // Writes are chained, so two quick changes land in order.
  let writing = Promise.resolve();

  return {
    async load() {
      try {
        const parsed = JSON.parse(await readFile(file, 'utf8'));
        volumes = Object.fromEntries(
          Object.entries(parsed).filter(
            ([, value]) => Number.isInteger(value) && value >= 0 && value <= 100,
          ),
        );
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger.warn(`Unreadable ${file}, volumes reset`, err);
        }
        volumes = {};
      }
    },

    /**
     * @param {string} externalId - Device external id.
     * @returns {number|undefined} Stored volume.
     */
    get(externalId) {
      return volumes[externalId];
    },

    /**
     * @param {string} externalId - Device external id.
     * @param {number} volume - 0-100.
     * @returns {Promise<void>} Resolves once written.
     */
    set(externalId, volume) {
      volumes = { ...volumes, [externalId]: volume };
      const snapshot = JSON.stringify(volumes, null, 2);
      writing = writing
        .then(async () => {
          await mkdir(dataDir, { recursive: true });
          // Write then rename: a crash never leaves a truncated file.
          await writeFile(`${file}.tmp`, snapshot);
          await rename(`${file}.tmp`, file);
        })
        .catch((err) => logger.error(`Unable to save the volumes in ${file}`, err));
      return writing;
    },
  };
}
