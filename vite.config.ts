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

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const plugins = [react(), tailwindcss(), serviceWorkerPrecache()];
  try {
    // @ts-ignore
    const m = await import('./.vite-source-tags.js');
    plugins.push(m.sourceTags());
  } catch {}

  const env = loadEnv(mode, process.cwd(), ['VITE_', 'NEXT_PUBLIC_']);
  const processEnvDefines: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    processEnvDefines[`process.env.${key}`] = JSON.stringify(value);
  }

  return {
    plugins,
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    define: processEnvDefines,
  };
})
