import { loadEnv } from '../config/env';

/** Link ins Web-Dashboard (erste Adresse aus WEB_ORIGIN), z. B. für „Im Dashboard ansehen“ in Discord. */
export const webUrl = (path: string) => `${loadEnv().WEB_ORIGIN.split(',')[0]!.trim().replace(/\/+$/, '')}${path}`;
