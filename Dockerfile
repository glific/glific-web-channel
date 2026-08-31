# Multi-stage build for the web-channel widget (static SPA served by nginx).
#
# Vite inlines import.meta.env.VITE_* at BUILD time, so the backend URL must be
# passed as build args (Bunnyshell fills these from the backend component's public
# URL — see bunnyshell.yaml). There is no dev proxy in this image.
ARG NODE_VERSION=24.20.0

FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app

# Backend endpoints, injected at build time. Absolute URLs are REQUIRED here because
# the widget and backend live on different Bunnyshell hostnames (no same-origin proxy).
ARG VITE_GLIFIC_API_URL
ARG VITE_WEB_SOCKET
ENV VITE_GLIFIC_API_URL=$VITE_GLIFIC_API_URL
ENV VITE_WEB_SOCKET=$VITE_WEB_SOCKET

RUN corepack enable
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
