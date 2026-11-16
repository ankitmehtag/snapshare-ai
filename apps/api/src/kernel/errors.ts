import type { ErrorCode, Problem } from '@snapshare/types';
import type { ErrorRequestHandler, RequestHandler, Response } from 'express';
import type { Logger } from '@snapshare/server-kit';
import { ZodError } from 'zod';

const ERROR_DOCS = 'https://docs.snapshare.in/errors/';

/** An expected, client-facing error. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    public readonly title: string,
    public readonly options: {
      detail?: string;
      meta?: Record<string, unknown>;
      errors?: Problem['errors'];
      headers?: Record<string, string>;
    } = {},
  ) {
    super(title);
    this.name = 'AppError';
  }

  static notFound(what = 'Resource') {
    return new AppError(404, 'NOT_FOUND', `${what} not found`);
  }
}

export function sendProblem(res: Response, problem: Omit<Problem, 'type' | 'requestId'>) {
  const requestId = String(res.req.id ?? '');
  const body: Problem = {
    type: ERROR_DOCS + problem.code.toLowerCase().replaceAll('_', '-'),
    ...problem,
    ...(requestId ? { requestId } : {}),
  };
  res.status(problem.status).type('application/problem+json').json(body);
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(AppError.notFound('Route'));
};

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, req, res, _next) => {
    if (res.headersSent) return;

    if (err instanceof AppError) {
      for (const [k, v] of Object.entries(err.options.headers ?? {})) res.setHeader(k, v);
      return sendProblem(res, {
        status: err.status,
        code: err.code,
        title: err.title,
        ...(err.options.detail ? { detail: err.options.detail } : {}),
        ...(err.options.meta ? { meta: err.options.meta } : {}),
        ...(err.options.errors ? { errors: err.options.errors } : {}),
      });
    }

    if (err instanceof ZodError) {
      return sendProblem(res, {
        status: 400,
        code: 'VALIDATION_FAILED',
        title: 'Request validation failed',
        errors: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    // body-parser errors carry a `type` and an HTTP status.
    const bp = err as { type?: string; status?: number };
    if (bp.type === 'entity.parse.failed') {
      return sendProblem(res, {
        status: 400,
        code: 'VALIDATION_FAILED',
        title: 'Malformed JSON body',
      });
    }
    if (bp.type === 'entity.too.large') {
      return sendProblem(res, {
        status: 413,
        code: 'FILE_TOO_LARGE',
        title: 'Request body too large',
      });
    }

    (req.log ?? logger).error({ err }, 'unhandled error');
    return sendProblem(res, { status: 500, code: 'INTERNAL', title: 'Something went wrong' });
  };
}
