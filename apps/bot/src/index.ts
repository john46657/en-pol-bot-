import { assertConfig } from './config.js';
import { log } from './logger.js';
import { startBot } from './bot.js';

async function main(): Promise<void> {
  assertConfig();
  log.info('NEXUS Bot startet …');
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
