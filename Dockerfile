FROM node:24-slim

WORKDIR /app

COPY server/package.json server/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --ignore-scripts

COPY server/tsconfig.json ./
COPY server/src ./src
COPY server/public ./public
RUN pnpm run build && mkdir -p /app/data && chown -R node:node /app

ENV OPENCENTER_DATA_DIR=/app/data
VOLUME ["/app/data"]

USER node
EXPOSE 3800
CMD ["node", "dist/src/cli.js", "serve", "--host", "0.0.0.0", "--port", "3800", "--data-dir", "/app/data"]
