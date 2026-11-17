import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from './api';

/**
 * Maps an API problem onto the form: field errors (`errors[].path`) go next to their
 * inputs; anything else becomes the form-level message that is returned.
 */
export function applyApiError<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): string | null {
  if (!(err instanceof ApiError)) return 'Something went wrong. Please try again.';
  let placed = false;
  for (const e of err.problem.errors ?? []) {
    if ((fields as readonly string[]).includes(e.path)) {
      setError(e.path as Path<T>, { type: 'server', message: e.message });
      placed = true;
    }
  }
  if (placed && err.code === 'VALIDATION_FAILED') return null;
  return err.problem.detail ? `${err.problem.title}. ${err.problem.detail}` : err.problem.title;
}
