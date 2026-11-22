# Production image for Fly.io (`@astrojs/node` standalone). See fly.toml.
#
# PUBLIC_* values are inlined into the client bundle at build time, so pass
# them as build args (fly.toml [build.args] or `fly deploy --build-arg`).
# Secrets (DATABASE_URL, BETTER_AUTH_SECRET, R2_*, ...) are runtime only:
# `fly secrets set`, never build args.

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
ARG PUBLIC_SITE_URL
ARG PUBLIC_IMAGE_BASE_URL
ARG PUBLIC_MAP_STYLE_URL
ENV DEPLOY_TARGET=node \
    PUBLIC_SITE_URL=${PUBLIC_SITE_URL} \
    PUBLIC_IMAGE_BASE_URL=${PUBLIC_IMAGE_BASE_URL} \
    PUBLIC_MAP_STYLE_URL=${PUBLIC_MAP_STYLE_URL}
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "dist/server/entry.mjs"]
