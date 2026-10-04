import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'nexus:public';

/**
 * Markiert einen Endpoint als öffentlich (§114): Auth entfällt komplett.
 * Default ist "geschützt" – der JwtAuthGuard verlangt sonst eine Session.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
