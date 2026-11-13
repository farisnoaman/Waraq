/*
 * Re-export shim. The schemas themselves live in /shared/schemas.js so the
 * browser can import them without touching the /api path namespace (which is
 * reserved for server routes — see the file header there). Every server
 * module keeps importing './_lib/schemas.js' unchanged.
 */
export * from '../../shared/schemas.js';
