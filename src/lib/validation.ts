// Single source of truth for validation: the same Zod schemas the API uses.
import { fieldErrors, schemas } from '../../api/_lib/schemas.js';
import { t } from './i18n';

export { schemas };

export type FieldErrors = Record<string, string>;

interface SafeParseLike<T> {
  safeParse: (
    input: unknown,
  ) => { success: true; data: T } | { success: false; error: { issues: unknown[] } };
}

/** Runs a schema and returns either the cleaned data or per-field messages. */
export function validate<T>(
  schema: SafeParseLike<T>,
  input: unknown,
): { ok: true; data: T } | { ok: false; errors: FieldErrors } {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  const raw = fieldErrors(result.error as never) as FieldErrors;
  return {
    ok: false,
    errors: Object.fromEntries(Object.entries(raw).map(([key, message]) => [key, t(message)])),
  };
}

/** Only same-site paths are accepted as post-login destinations. */
export function safeNextPath(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  return value;
}
