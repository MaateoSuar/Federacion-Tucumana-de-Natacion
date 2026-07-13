# Build de @ftn/web para producción (Railway). Se corre con contexto = raíz del monorepo,
# porque necesita ver packages/shared (@ftn/shared se compila antes que @ftn/web).
FROM node:20-bookworm-slim

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ftn/shared build
RUN pnpm --filter @ftn/web build

WORKDIR /app/apps/web
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "start"]
