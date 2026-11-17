// Public API of the tenancy module (ARCHITECTURE §4: other modules import only this file).
import type { Logger } from '@snapshare/server-kit';
import type { RequestHandler, Router } from 'express';
import type { Redis } from 'ioredis';
import type { RouteRegistry } from '../../kernel/routes.js';
import { mountTenancyRoutes } from './routes/tenancy.routes.js';
import { TenancyService } from './services/tenancy.service.js';

export {
  PERMISSIONS,
  ROLE_KEYS,
  SYSTEM_ROLES,
  type Permission,
  type RoleKey,
} from './services/system-roles.js';

export interface TenancyDeps {
  redis: Redis;
  logger: Logger;
  appUrl: string;
  cursorSecret: string;
  ipHashSecret: string;
}

export interface TenancyModule {
  /** For identity's GET /me (studios the user belongs to). */
  workspacesFor: TenancyService['workspacesFor'];
  /** Guard for other modules' studio routes, e.g. guard('event.create'). */
  guard(permission: string): RequestHandler;
  /** Mounts the routes; needs identity's requireAuth. */
  mount(requireAuth: RequestHandler): (api: Router, registry: RouteRegistry) => void;
  ensureSystemRoles(): Promise<void>;
}

export function createTenancyModule(deps: TenancyDeps): TenancyModule {
  const service = new TenancyService({
    redis: deps.redis,
    appUrl: deps.appUrl,
    cursorSecret: deps.cursorSecret,
    logger: deps.logger,
  });
  return {
    workspacesFor: (userId) => service.workspacesFor(userId),
    guard: (permission) => service.guard(permission),
    ensureSystemRoles: () => service.ensureSystemRoles(),
    mount: (requireAuth) => (api, registry) =>
      mountTenancyRoutes(api, registry, {
        service,
        redis: deps.redis,
        requireAuth,
        ipHashSecret: deps.ipHashSecret,
      }),
  };
}
