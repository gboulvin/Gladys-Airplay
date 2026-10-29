// -----------------------------------------------------------------------------
// Entry point of the AirPlay external integration for Gladys Assistant.
//
// Bootstrap only: the handlers live in src/app.js. The SDK reads the three
// variables the Gladys supervisor injects in the container
// (GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR)
// and handles the connection, authentication and reconnection.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { registerHandlers } from './src/app.js';

const gladys = new GladysIntegration();
const app = registerHandlers(gladys);

// The SDK disconnects cleanly and exits with code 0 when the supervisor stops
// the container (SIGTERM/SIGINT): stop the AirPlay sessions first, so the
// speakers do not keep an open session.
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  app.stop();
});

logger.info('Starting the AirPlay integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
