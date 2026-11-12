/*
 * The app serves a strict Content-Security-Policy without 'unsafe-eval'.
 * Zod's just-in-time compiler needs eval(), so it is switched off before any
 * schema is created. This module must be imported first in main.tsx: it is
 * evaluated before Zod itself, which is what stops the browser from logging a
 * policy violation. The server side is unaffected, it runs in Node.
 */
const scope = globalThis as typeof globalThis & {
  __zod_globalConfig?: { jitless?: boolean };
};

const zodConfig = (scope.__zod_globalConfig ??= {});
zodConfig.jitless = true;

export {};
