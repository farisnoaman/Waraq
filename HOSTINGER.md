# Deploying Waraq Pro on Hostinger

Production target:

- **Source:** GitHub `farisnoaman/Waraq`, branch `main`
- **Host:** Hostinger Node.js web app
- **Domain:** `https://waraq.pro`
- **Database/Auth:** Supabase project `rhqnxzzrxiqgiayvjmgr`

`server.js` is the only process. It serves the built SPA from `dist/` and runs the
handlers in `api/` on the same port. Do **not** create a separate static site for
the front end — the API and the SPA must live in the same deployment.

---

## 0. Is your Node server actually running? (diagnose first)

If you can open the site and sign in but see **"You are signed in, but we could not load your profile. Please try again."** and the **products do not appear**, the Node.js API is almost certainly **not** running. Sign-in works because the browser talks to Supabase directly; profiles and products come from `/api/*`, which only `server.js` serves.

Run these checks (replace the domain if different):

```bash
curl -i https://waraq.pro/healthz
curl -s https://waraq.pro/api/products | head -c 300
curl -s -o /dev/null -w '%{http_code}\n' https://waraq.pro/login
```

| Result | What it means | Fix |
|---|---|---|
| `/healthz` → `{"ok":true}` and `/api/products` → JSON array | Node server is running; problem is env/DB | Check runtime env vars and that migrations ran (sections 1–2, 6) |
| `/healthz` → 404 HTML, `/api/products` → 404 HTML, `/login` → 404 | **Static site** — Hostinger is serving `dist/` only, `server.js` never started | Section 3: set **Application startup file = `server.js`**, redeploy |
| `/healthz` → 200 but `/api/*` → 500 "The server is not configured yet." | `server.js` is running but missing runtime env vars | Set `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` in hPanel, restart/redeploy |
| `/api/products` → `[]` | DB is reachable but seed not loaded | Run `0000_schema_and_seed.sql` in Supabase SQL Editor |

**Quick proof it is the Node server (not Hostinger's static host):** our `server.js` applies the CSP and security headers from `vercel.json` to every response. A static Hostinger deploy shows `server: hcdn` and `content-security-policy: upgrade-insecure-requests` only. A working deploy returns the full `Content-Security-Policy` (with `connect-src ... https://*.supabase.co`), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `Permissions-Policy`.

**After fixing:** unregister the service worker (DevTools → Application → Service Workers → Unregister) and hard-reload (Ctrl+Shift+R). The PWA may have cached the broken 404/static state.

---

## 1. Supabase setup (one time)

### 1.1 URL and keys

**Project URL:** `https://rhqnxzzrxiqgiayvjmgr.supabase.co`
(confirm under **Settings → API**; the project ref is the part after `/project/`).

**Settings → API Keys** — newer projects show publishable/secret keys, older ones
show legacy `anon` / `service_role` JWTs:

| Dashboard key | Use as | Runs where |
|---|---|---|
| `sb_publishable_…` (or legacy `anon`) | `VITE_SUPABASE_ANON_KEY` | browser bundle — public |
| `sb_secret_…` (or legacy `service_role`) | `SUPABASE_SERVICE_ROLE_KEY` | server only — **secret** |

`@supabase/supabase-js` 2.99.x accepts either key format. Never put the secret key
in a `VITE_` variable: Vite inlines every `VITE_*` value into the public JS bundle.

### 1.2 Create the schema

**SQL Editor → New query**, run in this order, once:

1. `supabase/migrations/0000_schema_and_seed.sql` — tables, catalogue, VAT and
   commission defaults.
2. `supabase/migrations/0001_waraq_pro_hardening.sql` — role enum, triggers,
   row level security.

Before running `0001`, create your admin user (**Authentication → Users → Add
user**) and copy its UUID. Replace the preview UUID on the admin update in step 4
of the file:

```sql
where id = '728d6e92-b38e-4ae7-9504-05f2343bdd47';  -- ← your admin user UUID
```

Both files are wrapped in `begin; … commit;`, so a failure rolls back cleanly.
Reading the output of each run is recommended — the files are marked as written but
not previously executed.

### 1.3 Auth URLs

**Authentication → URL Configuration**:

| Field | Value |
|---|---|
| Site URL | `https://waraq.pro` |
| Redirect URLs | `https://waraq.pro/**`, `https://waraq.pro/buyer`, `https://waraq.pro/admin`, `http://localhost:3000/**`, `http://127.0.0.1:3000/**` |

Email sign-in works out of the box. Google sign-in is optional; leave
`VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_AUTH_PROXY` empty to use Supabase's own
Google provider.

### 1.3a Google sign-in (when the Supabase Google provider is used)

With both `VITE_GOOGLE_*` variables empty the app calls Supabase's Google
provider, so Google must accept the **Supabase callback** as a redirect target.
Add this URI in **Google Cloud Console → APIs & Services → Credentials → your
OAuth client → Authorized redirect URIs**:

```
https://rhqnxzzrxiqgiayvjmgr.supabase.co/auth/v1/callback
```

Without it Google answers `Error 400: redirect_uri_mismatch` and the sign-in
window stops on an "Access blocked" page. The `https://waraq.pro/buyer` entry in
Google is only used by the optional self-hosted proxy flow
(`VITE_GOOGLE_AUTH_PROXY`), which this repository does not ship.

In **Supabase → Authentication → Providers → Google**, put the OAuth client id
and client secret from the Google console, and copy the client's id into
`VITE_GOOGLE_CLIENT_ID` only if you intend to use the proxy flow.

### 1.4 Administrator

The admin identity is your Supabase Auth user UUID. Put it in
`WARAQ_ADMIN_USER_IDS` (comma-separated for more than one). `profiles.role` is only
a display mirror; authorisation comes from that env var and
`app_metadata.role`.

> `api/_lib/auth.js` also contains a hard-coded bootstrap UUID from the preview
> database. It is harmless on this project (no such user exists), but it can be
> removed for cleanliness.

### 1.5 Row level security

`0001` enforces RLS. Without it, anyone holding the public key can read and modify
the tables directly, bypassing the API. All app traffic goes through the server's
service key, so RLS protects direct database access only — but it must be on.

---

## 2. Environment variables

There are two classes, and they are not interchangeable.

| Variable | Used at | Visible to browser | Notes |
|---|---|---|---|
| `VITE_SUPABASE_URL` | **build** | yes | inlined into the bundle |
| `VITE_SUPABASE_ANON_KEY` | **build** | yes | publishable/anon key only |
| `VITE_GOOGLE_CLIENT_ID` | build | yes | optional |
| `VITE_GOOGLE_AUTH_PROXY` | build | yes | optional |
| `NEXT_PUBLIC_SUPABASE_URL` | runtime | no | same project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | runtime | **never** | secret/service_role key |
| `WARAQ_ADMIN_USER_IDS` | runtime | no | admin UUID(s), comma separated |
| `PORT` | runtime | no | do **not** set it on Hostinger |

**Setting them on Hostinger:** hPanel → Websites → your app → **Environment
variables** → add each key/value, then redeploy. This works with GitHub deploys
because the values live in Hostinger, not in the repository.

> If a `VITE_*` value is missing or empty **during the build**, the site still
> compiles but sign-in fails in the browser. Fix the value and redeploy — editing a
> variable alone does not rebuild the bundle.

### About `.env`

- `.env` is **gitignored**; it is never included when Hostinger deploys from GitHub.
- It is for local development only: `cp .env.example .env`, then fill the values.
  `.env.example` stays on placeholders forever — it is tracked and public.
- `server.js` loads `./.env` when present (for local runs or a manually uploaded
  file), but **real environment variables always win**. So Hostinger panel values
  are never overridden by a stale file.
- Vite reads `VITE_*` from `.env` at build time; the server reads the rest at
  runtime.

---

## 3. Deploy from GitHub

Requirements: a Hostinger plan that supports Node.js web apps (Business Web
Hosting, or Cloud Startup / Professional / Enterprise / Enterprise Plus). VPS plans
work too, but require the Dockerfile flow instead of this panel flow.

1. hPanel → **Websites → Add Website → Node.js web app** (do **not** create a plain/static website).
2. **Import your Git repository → Connect with GitHub**, authorize the Hostinger
   GitHub App, select `farisnoaman/Waraq`.
3. Set the build/run settings exactly like this:

| Field | Value | Critical? |
|---|---|---|
| **Framework preset** | **Other** | **Yes** — Vite/Static preset serves `dist/` only and never runs the API |
| **Branch** | `main` | |
| **Root directory** | *(empty)* | **Yes** — `package.json` is at the repo root |
| **Node.js version** | `22` | |
| **Package manager** | `npm` | |
| **Install command** | `npm install` (or `npm ci`) | |
| **Build command** | `npm run build` | |
| **Output directory** | `dist` | |
| **Application startup file / Entry file** | **`server.js`** | **Yes** — this starts the API + SPA server |
| **Port** | leave unset | **Yes** — Hostinger injects `PORT`; `server.js` binds it on `0.0.0.0` |

4. Add the environment variables from section 2 (the build needs the `VITE_*`
   ones before it runs).
5. Click **Deploy**. Hostinger installs dependencies, runs the build, and keeps
   `node server.js` running behind its proxy.

### Why these values

- **Startup file must be `server.js`.** Without it, Hostinger has no Node process to proxy to and the app behaves like a static site: `/api/*` and deep links 404, sign-in "works" but profile/products never load.
- **Framework preset must be `Other`.** Hostinger detects Vite from
  `vite.config.ts` and can default to a *frontend-only* deploy (static `dist/`). The site would load at `/`, but every `/api/*` request would 404.
- **Root directory must be empty.** The original error
  `ERROR: package.json file not found` after 0.3s means the builder was pointed at
  a folder without `package.json`. `package.json` is at the repository root.
- **Do not set `PORT`.** Hostinger injects its own port. `server.js` binds
  `process.env.PORT || 3000` on `0.0.0.0`, which is what the platform expects.
- **Output directory `dist`** is informational here: `server.js` serves `./dist`
  itself, so the API and static files stay on one origin.

### Redeploys

Every push to `main` triggers a rebuild. Updating a `VITE_*` variable requires a
redeploy (rebuild); runtime-only variables need a restart/redeploy to be picked up. After changing the startup file / preset / root directory, do a full redeploy.

---

## 4. Domain and HTTPS

1. hPanel → the Node.js website → **Domains** → attach `waraq.pro` (and `www` if
   wanted).
2. If the domain is not registered at Hostinger, point its nameservers to
   Hostinger, or add the A/AAAA records shown in hPanel.
3. Wait for DNS, then enable the free SSL certificate. HTTPS is required: the PWA
   service worker and Supabase redirect URLs will not work over plain HTTP.

---

## 5. Verify the deployment

| Check | Expected |
|---|---|
| `curl -i https://waraq.pro/healthz` | `200` + `{"ok":true}` (and response headers include our `Content-Security-Policy`, not just `upgrade-insecure-requests`) |
| `curl -s https://waraq.pro/api/products \| head -c 200` | JSON array of seeded products (after migrations) |
| `curl -s -o /dev/null -w '%{http_code}\n' https://waraq.pro/login` | `200` (SPA rewrite via `server.js`; 404 means static hosting, no rewrite) |
| `https://waraq.pro/` | Arabic RTL home page loads with products |
| Sign in with the admin account | redirects to `/admin`, profile and data load |
| Browser DevTools → Network → `/api/me` | 200 with profile JSON (401 if not signed in; 404 HTML = static site, not Node) |
| Browser console | no CSP errors, no `supabaseUrl is required` |
| Hostinger **Runtime Logs** | `Waraq Pro is listening on http://0.0.0.0:<port>` |

If it was previously deployed as a static site: unregister the service worker (DevTools → Application → Service Workers → Unregister) and hard-reload, or the cached 404 shell may persist.

---

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| **"You are signed in, but we could not load your profile"** + **products missing** | `/api/me` and `/api/products` are not being served by `server.js` | Run the section 0 checks. If they return 404 HTML: set **Application startup file = `server.js`**, **Framework preset = Other**, Root directory empty, then redeploy. If they return 500 "server is not configured yet": add runtime env vars and restart |
| `ERROR: package.json file not found`, build fails in ~0.3s | Root directory points at a subfolder | Clear **Root directory** |
| Site loads at `/`, but `/products`, `/login`, `/admin` 404 on refresh | Static hosting with no SPA rewrite (Node server not running) | Set **Startup file = `server.js`** and redeploy — `server.js` serves `index.html` for extensionless routes |
| `/healthz` 404 and response headers show `server: hcdn` / `content-security-policy: upgrade-insecure-requests` only | Hostinger is serving `dist/` statically, not proxying to Node | Reconfigure as a Node.js app with startup file `server.js`, redeploy |
| Site loads, `/api/*` returns 404 | Hostinger auto-selected the Vite/static preset or entry file not set | Set **Framework preset = Other**, **Entry file = server.js**, redeploy |
| Build green, app crash-loop | Missing runtime env var, or wrong port | Check Runtime Logs; set `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_URL`; do **not** set `PORT` |
| Runtime logs: `Warning: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set` | Runtime env vars missing in hPanel | Add them in hPanel → Environment variables, then redeploy/restart |
| Sign-in fails, console says Supabase URL missing | `VITE_*` were absent at build time | Add them, then **redeploy** (build-time vars require rebuild) |
| `/api/me` returns 401 "Your session has expired" immediately | `NEXT_PUBLIC_SUPABASE_URL` / service key point to wrong project or key is invalid | Re-copy URL and secret key from Supabase **Settings → API** |
| `/api/me` or `/api/products` returns 500 | Wrong service-role key, wrong project URL, or migrations not run | Check Hostinger Runtime Logs for the actual error; re-copy keys; run migrations |
| Products page empty but `/api/products` returns `[]` | Schema exists but seed data not inserted | Run `supabase/migrations/0000_schema_and_seed.sql` in SQL Editor (once) |
| `permission denied` / `relation ... does not exist` | RLS/migrations not applied, or wrong project | Run `0000_schema_and_seed.sql` then `0001_waraq_pro_hardening.sql` on `rhqnxzzrxiqgiayvjmgr` |
| Admin account has no admin powers | UUID missing from env / app_metadata | Add UUID to `WARAQ_ADMIN_USER_IDS`, redeploy; or set `raw_app_meta_data.role='admin'` for that user in Supabase and sign in again |
| Stale/broken page after fix (old 404 cached) | Service worker cached the previous static/404 state | DevTools → Application → Service Workers → Unregister, then hard-reload (Ctrl+Shift+R) |
| First request after idle is slow | Hostinger stops idle Node processes and restarts on demand | Expected; not a crash |
| Google sign-in fails | Provider not enabled / redirect URL missing | Add `https://waraq.pro/buyer` to Supabase redirect URLs |

---

## 7. Security checklist

- [ ] `.env` is never committed (confirmed by `git check-ignore .env`).
- [ ] `.env.example` contains placeholders only — it is public.
- [ ] **Rotate the Supabase service-role key.** The key was published in
      `.env.example` in earlier commits of this public repository, so anyone
      could read every table and bypass row level security. Rotate it in
      Supabase **Settings → API Keys**, then update `.env` locally and
      `SUPABASE_SERVICE_ROLE_KEY` in the Hostinger panel. The publishable/anon
      key is public by design and does not need rotating.
- [ ] If a real key was ever pasted into a tracked file, a commit, or a chat,
      rotate it in Supabase **Settings → API Keys** and update Hostinger.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is never prefixed with `VITE_` and never appears
      in `src/`.
- [ ] `0001_waraq_pro_hardening.sql` has been applied.
- [ ] Demo passwords from the README are not reused on the production project.
- [ ] Supabase Auth **Site URL** is `https://waraq.pro`, not localhost.
- [ ] The Google OAuth client secret was shared in chat: rotate it in Google
      Cloud Console if the client is still in use, and keep it only in the
      Supabase provider settings.

---

## 8. Alternative: VPS / Coolify / Docker

`Dockerfile` builds the SPA and runs the same `server.js`, listening on `3000`
with health check `/healthz`. Build arguments `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` are required at image build time; runtime variables come
from the container environment. Use this path on VPS/dedicated or Coolify instead
of the panel flow above.
