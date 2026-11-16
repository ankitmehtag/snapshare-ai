import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import type { RouteRegistry } from './routes.js';

export function buildOpenApiDocument(
  registry: RouteRegistry,
): ReturnType<OpenApiGeneratorV31['generateDocument']> {
  return new OpenApiGeneratorV31(registry.openapi.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'SnapShare AI API',
      version: '0.1.0',
      description: 'Generated from Zod route definitions. See docs/API_SPEC.md.',
    },
    // Route paths are absolute (probes at /health, API under /api/v1).
    servers: [{ url: '/' }],
  });
}
