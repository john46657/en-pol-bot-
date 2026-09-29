import pino from 'pino';
import { config } from './config.js';

export const log =
  process.env['NODE_ENV'] === 'development'
    ? pino({
        level: config.log.level,
        transport: { target: 'pino-pretty', options: { colorize: true } },
      })
    : pino({ level: config.log.level });
