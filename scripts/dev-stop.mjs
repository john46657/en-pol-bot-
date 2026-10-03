#!/usr/bin/env node
/** Stoppt die lokal (nicht via Docker) gestarteten Dienste unter .dev/. */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dev = join(dirname(fileURLToPath(import.meta.url)), '..', '.dev');
if (existsSync(join(dev, 'postgres', 'postmaster.pid'))) {
  spawnSync('pg_ctl', ['-D', join(dev, 'postgres'), '-m', 'fast', 'stop'], { stdio: 'inherit' });
}
spawnSync('redis-cli', ['shutdown', 'nosave'], { stdio: 'inherit' });
