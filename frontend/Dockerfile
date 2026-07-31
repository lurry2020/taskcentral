ARG BUILDPLATFORM
FROM --platform=${BUILDPLATFORM} node:20-alpine AS build

ARG TASKCENTRAL_VERSION=dev
ENV VITE_TASKCENTRAL_VERSION=${TASKCENTRAL_VERSION}

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY log-rotator.sh /docker-entrypoint.d/40-taskcentral-log-rotation.sh

RUN mkdir -p /logs \
    && chmod 755 /docker-entrypoint.d/40-taskcentral-log-rotation.sh

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://127.0.0.1/ || exit 1
