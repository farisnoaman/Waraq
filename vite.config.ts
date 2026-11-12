import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * After the build, writes the list of hashed JS/CSS files into dist/sw.js so
 * the service worker can precache the whole app shell on the first visit.
 */
function serviceWorkerPrecache(): Plugin {
  return {
    name: 'waraq-sw-precache',
    apply: 'build',
    closeBundle() {
      const dist = path.resolve(process.cwd(), 'dist')
      const swPath = path.join(dist, 'sw.js')
      if (!fs.existsSync(swPath)) return
      const assetsDir = path.join(dist, 'assets')
      const assets = fs.existsSync(assetsDir)
        ? fs
            .readdirSync(assetsDir)
            .filter((file) => /\.(js|css|woff2?)$/.test(file))
            .sort()
            .map((file) => `/assets/${file}`)
        : []
      const version = createHash('sha1').update(assets.join('|')).digest('hex').slice(0, 10)
      const source = fs
        .readFileSync(swPath, 'utf8')
        .replace('__SW_VERSION__', version)
        .replace('/*__PRECACHE__*/[]', JSON.stringify(assets))
      fs.writeFileSync(swPath, source)
    },
  }
}

/**
 * Puts the built stylesheet inside index.html. The sheet is small enough to
 * travel with the document, and inlining it removes the render-blocking
 * request that otherwise delays the first paint on a slow connection.
 */
function inlineCss(): Plugin {
  return {
    name: 'waraq-inline-css',
    enforce: 'post',
    apply: 'build',
    generateBundle(_options, bundle) {
      let css = ''
      for (const [fileName, file] of Object.entries(bundle)) {
        if (file.type === 'asset' && fileName.endsWith('.css')) {
          css += typeof file.source === 'string' ? file.source : Buffer.from(file.source).toString('utf8')
          delete bundle[fileName]
        }
      }
      if (!css) return
      for (const file of Object.values(bundle)) {
        if (file.type === 'asset' && file.fileName.endsWith('.html')) {
          const source = typeof file.source === 'string' ? file.source : Buffer.from(file.source).toString('utf8')
          file.source = source.replace(/<link rel="stylesheet"[^>]*>/g, `<style>${css}</style>`)
        }
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const plugins = [react(), tailwindcss(), inlineCss(), serviceWorkerPrecache()];
  try {
    // @ts-ignore
    const m = await import('./.vite-source-tags.js');
    plugins.push(m.sourceTags());
  } catch {}

  const env = loadEnv(mode, process.cwd(), ['VITE_', 'NEXT_PUBLIC_']);
  const browserEnv: Record<string, string> = { ...env };

  // Hostinger's Supabase wizard injects SUPABASE_URL and SUPABASE_ANON_KEY /
  // SUPABASE_API_KEY. The browser bundle needs the public key under the VITE_
  // prefix, so the wizard's names are mapped onto it when the panel has not
  // set the VITE_ variables itself.
  if (!browserEnv.VITE_SUPABASE_URL) {
    browserEnv.VITE_SUPABASE_URL =
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  }
  if (!browserEnv.VITE_SUPABASE_ANON_KEY) {
    browserEnv.VITE_SUPABASE_ANON_KEY =
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_API_KEY ||
      process.env.SUPABASE_PUBLIC_KEY ||
      '';
  }

  const processEnvDefines: Record<string, string> = {};
  for (const [key, value] of Object.entries(browserEnv)) {
    processEnvDefines[`process.env.${key}`] = JSON.stringify(value);
  }

  return {
    plugins,
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    env: browserEnv,
    define: processEnvDefines,
    build: {
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('framer-motion') || id.includes('motion-dom') || id.includes('motion-utils')) {
              return 'motion';
            }
            if (id.includes('@supabase')) return 'supabase';
            if (id.includes('react-router')) return 'router';
            if (id.includes('lucide-react')) return 'icons';
            if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) {
              return 'react';
            }
            if (id.includes('zod')) return 'zod';
            return undefined;
          },
        },
      },
    },
  };
})
