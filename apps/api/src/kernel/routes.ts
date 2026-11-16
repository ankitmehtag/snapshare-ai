import { OpenAPIRegistry, type RouteConfig } from '@asteasolutions/zod-to-openapi';
import type { RouteScope } from '@snapshare/types';
import type { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import { z } from './zod.js';

/** Marker placed on every handler mounted through the registry (TESTING §4). */
export const ROUTE_META = Symbol.for('snapshare.route');

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface RouteMeta {
  method: Method;
  /** OpenAPI-style path, e.g. /studios/{studioId}/events */
  path: string;
  scope: RouteScope;
}

export interface RouteDefinition<
  P extends z.ZodType = z.ZodType,
  Q extends z.ZodType = z.ZodType,
  B extends z.ZodType = z.ZodType,
> extends RouteMeta {
  summary: string;
  tags?: string[];
  request?: { params?: P; query?: Q; body?: B };
  responses: Record<number, { description: string; schema?: z.ZodType }>;
  /** Runs before validation, e.g. rate limiters and (from Phase 2) auth. */
  middleware?: RequestHandler[];
  handler: (
    input: { params: z.infer<P>; query: z.infer<Q>; body: z.infer<B> },
    req: Request,
    res: Response,
  ) => unknown;
}

const PROBLEM_CONTENT = 'application/problem+json';

/**
 * All HTTP routes are mounted through this registry so that every route has:
 * validated input (Zod), an OpenAPI entry, and scope metadata used by the
 * generated tenant-isolation tests. A route mounted any other way fails CI.
 */
export class RouteRegistry {
  readonly openapi = new OpenAPIRegistry();
  readonly routes: RouteMeta[] = [];

  mount<P extends z.ZodType, Q extends z.ZodType, B extends z.ZodType>(
    router: Router,
    def: RouteDefinition<P, Q, B>,
  ): void {
    const expressPath = def.path.replace(/\{([^}]+)\}/g, ':$1');
    const meta: RouteMeta = { method: def.method, path: def.path, scope: def.scope };

    const handler = async (req: Request, res: Response, next: NextFunction) => {
      try {
        const input = {
          params: (def.request?.params?.parse(req.params) ?? req.params) as z.infer<P>,
          query: (def.request?.query?.parse(req.query) ?? {}) as z.infer<Q>,
          body: (def.request?.body?.parse(req.body) ?? undefined) as z.infer<B>,
        };
        await def.handler(input, req, res);
      } catch (err) {
        next(err);
      }
    };
    Object.defineProperty(handler, ROUTE_META, { value: meta });

    router[def.method](expressPath, ...(def.middleware ?? []), handler);
    this.routes.push(meta);
    this.openapi.registerPath(this.toOpenApi(def));
  }

  private toOpenApi(def: RouteDefinition): RouteConfig {
    const responses: RouteConfig['responses'] = {};
    for (const [status, r] of Object.entries(def.responses)) {
      const isError = Number(status) >= 400;
      responses[status] = {
        description: r.description,
        ...(r.schema
          ? { content: { [isError ? PROBLEM_CONTENT : 'application/json']: { schema: r.schema } } }
          : {}),
      };
    }
    const request: NonNullable<RouteConfig['request']> = {};
    const { params, query, body } = def.request ?? {};
    if (params instanceof z.ZodObject) request.params = params;
    if (query instanceof z.ZodObject) request.query = query;
    if (body) request.body = { content: { 'application/json': { schema: body } }, required: true };
    return {
      method: def.method,
      path: def.path,
      summary: def.summary,
      tags: def.tags ?? [],
      'x-scope': def.scope,
      request,
      responses,
    } as RouteConfig;
  }
}

interface Layer {
  route?: { path: string; stack: { handle: unknown }[]; methods?: Record<string, boolean> };
  handle?: { stack?: Layer[] };
}

/** Returns routes mounted on the app without going through the registry. */
export function findUnregisteredRoutes(rootStack: readonly unknown[]): string[] {
  const missing: string[] = [];
  const walk = (stack: Layer[]) => {
    for (const layer of stack) {
      if (layer.route) {
        const registered = layer.route.stack.some(
          (l) => typeof l.handle === 'function' && ROUTE_META in l.handle,
        );
        if (!registered) {
          const methods = Object.keys(layer.route.methods ?? {})
            .join(',')
            .toUpperCase();
          missing.push(`${methods} ${layer.route.path}`);
        }
      } else if (layer.handle?.stack) {
        walk(layer.handle.stack);
      }
    }
  };
  walk(rootStack as Layer[]);
  return missing;
}

/** Shared problem+json schema for OpenAPI error responses. */
export const problemSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    code: z.string(),
    detail: z.string().optional(),
    requestId: z.string().optional(),
    errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi('Problem');
