# Build de @ftn/api para producción (Railway). Se corre con contexto = raíz del monorepo,
# porque necesita ver packages/shared y el pnpm-workspace completo (@ftn/shared se compila
# antes que @ftn/api).
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm exec prisma generate --schema=prisma/schema.prisma
RUN pnpm --filter @ftn/shared build
RUN pnpm --filter @ftn/api build

WORKDIR /app/apps/api
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/main"]
