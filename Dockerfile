# syntax=docker/dockerfile:1
#
# FPL-PWA production image (sibling parent build context).
#
# Prefer the shared helper with the FPL nginx overlay:
#   node ../PWA-Base/scripts/docker-build-consumer.mjs \
#     --nginx-conf FPL-PWA/docker/nginx-spa-fpl.conf \
#     -t fpl-pwa:local
#
# Or from the sibling parent:
#   docker build -f FPL-PWA/Dockerfile \
#     --build-arg APP_DIR=FPL-PWA \
#     -t fpl-pwa:local .
#
# /fpl-api is required in production (browser CORS). Vite proxy stays dev-only.
# Keep stages aligned with PWA-Base/docker/consumer-spa.Dockerfile.
# Guide: ../PWA-Base/docs/guides/production-docker.md

ARG APP_DIR=FPL-PWA
ARG PWA_BASE_DIR=PWA-Base

FROM node:22-alpine AS build

ARG APP_DIR
ARG PWA_BASE_DIR=PWA-Base

WORKDIR /src

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY ${PWA_BASE_DIR}/package.json ${PWA_BASE_DIR}/pnpm-lock.yaml \
     ${PWA_BASE_DIR}/pnpm-workspace.yaml ${PWA_BASE_DIR}/.npmrc ${PWA_BASE_DIR}/
COPY ${PWA_BASE_DIR}/VERSION ${PWA_BASE_DIR}/VERSION
COPY ${PWA_BASE_DIR}/packages ${PWA_BASE_DIR}/packages
COPY ${PWA_BASE_DIR}/apps ${PWA_BASE_DIR}/apps
COPY ${PWA_BASE_DIR}/src ${PWA_BASE_DIR}/src
COPY ${PWA_BASE_DIR}/tsconfig.base.json ${PWA_BASE_DIR}/tsconfig.base.json
COPY ${PWA_BASE_DIR}/eslint.config.js ${PWA_BASE_DIR}/eslint.config.js
COPY ${PWA_BASE_DIR}/prettier.config.js ${PWA_BASE_DIR}/prettier.config.js

WORKDIR /src/${PWA_BASE_DIR}
RUN pnpm install --frozen-lockfile

WORKDIR /src
COPY ${APP_DIR}/package.json ${APP_DIR}/package-lock.json ${APP_DIR}/
WORKDIR /src/${APP_DIR}
RUN npm ci

WORKDIR /src
COPY ${APP_DIR} ${APP_DIR}/

ARG PLATFORM_APP_VERSION=
ENV PLATFORM_APP_VERSION=$PLATFORM_APP_VERSION
ARG PLATFORM_RUNTIME_MODE=production
ENV PLATFORM_RUNTIME_MODE=$PLATFORM_RUNTIME_MODE

WORKDIR /src/${APP_DIR}
ENV CI=true
ARG APP_BUILD_CMD="npm run build"
RUN sh -c "$APP_BUILD_CMD"

FROM nginx:1.27-alpine AS runtime

ARG APP_DIR
# Default overlay path assumes checkout directory name FPL-PWA. Override when
# the worktree folder differs (e.g. FPL-PWA-main/docker/nginx-spa-fpl.conf).
ARG NGINX_CONF=FPL-PWA/docker/nginx-spa-fpl.conf

COPY ${NGINX_CONF} /etc/nginx/conf.d/default.conf
COPY --from=build /src/${APP_DIR}/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/health >/dev/null || exit 1
