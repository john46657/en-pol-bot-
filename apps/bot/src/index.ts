import { startPublisher } from '@nexus/realtime';
import { assertConfig, config } from './config.js';
import { log } from './logger.js';
import { startBot } from './bot.js';

async function main(): Promise<void> {
  assertConfig();
  log.info('NEXUS Bot startet …');
  startPublisher(config.redis.url); // Aktionen des Bots live ans Dashboard (best effort)
  await startBot();
}

main().catch((error) => {
  log.fatal({ err: String(error) }, 'NEXUS Bot konnte nicht starten.');
  process.exit(1);
});

process.on('SIGINT', () => {
  log.info('SIGINT – NEXUS Bot wird beendet.');
  process.exit(0);
});
process.on('SIGTERM', () => {
  log.info('SIGTERM – NEXUS Bot wird beendet.');
  process.exit(0);
});

// Nicht abgefangene Fehler loggen; unhandled rejections beenden den Bot nicht.
process.on('unhandledRejection', (reason) =>
  log.error({ err: String(reason) }, 'Unhandled Rejection.'),
);
process.on('uncaughtException', (error) => {
  log.fatal({ err: String(error) }, 'Uncaught Exception – Bot wird beendet.');
  process.exit(1);
});
