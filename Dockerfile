# Waraq Pro: one container that serves the web app and its API.
# Works with Coolify's "Dockerfile" build pack (and plain `docker build`).

# ---- build the front end -----------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# These are compiled into the browser bundle, so they are needed at BUILD time.
# In Coolify, add them as environment variables and tick "Build Variable".
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_GOOGLE_CLIENT_ID=""
ARG VITE_GOOGLE_AUTH_PROXY=""
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_GOOGLE_AUTH_PROXY=$VITE_GOOGLE_AUTH_PROXY

RUN npm run build

# ---- runtime -----------------------------------------------------------------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY api ./api
COPY server.js vercel.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "server.js"]
