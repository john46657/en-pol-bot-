import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@nexus/types';

export const PERMISSIONS_KEY = 'nexus:permissions';

/**
 * Erforderliche Permissions eines Endpoints (§79/§114).
 *
 * Frontend-Permissions sind nur UI – der Guard prüft serverseitig.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
