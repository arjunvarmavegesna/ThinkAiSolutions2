/**
 * Server entrypoint. Loads config (which loads .env), initializes Firebase Admin, builds
 * the Express app, listens on config.port, and shuts down cleanly on SIGTERM/SIGINT.
 */

import { config } from './config/env';
// Importing the firebase module initializes the admin app as a side effect.
import './config/firebase';
import { createApp } from './app';
import { logger } from './lib/logger';
import { startCampaignWorker, stopCampaignWorker } from './services/campaigns/campaignWorker';
import {
  startWebhookDeliveryWorker,
  stopWebhookDeliveryWorker,
} from './services/webhooks/webhookDeliveryWorker';

function main(): void {
  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info(
      { port: config.port, env: config.nodeEnv },
      `ThinkAiSolutions server listening on port ${config.port}`,
    );
  });

  // Start the Firestore-backed campaign queue worker unless explicitly disabled (e.g. a
  // separate web-only instance). It drains queued/scheduled campaigns in the background.
  if (process.env.CAMPAIGN_WORKER_DISABLED !== 'true') {
    startCampaignWorker();
  }

  // Start the client-webhook delivery worker (Developer Hub 2.5) unless disabled. It drains the
  // webhookDeliveries queue, POSTing signed events to tenant callback URLs with retry/backoff.
  if (process.env.WEBHOOK_DELIVERY_WORKER_DISABLED !== 'true') {
    startWebhookDeliveryWorker();
  }

  // Graceful shutdown: stop accepting connections, then exit.
  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Shutting down server');
    stopCampaignWorker();
    stopWebhookDeliveryWorker();
    server.close((err) => {
      if (err) {
        logger.error({ err }, 'Error during shutdown');
        process.exit(1);
      }
      process.exit(0);
    });
    // Failsafe: force-exit if close() hangs.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
