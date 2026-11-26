# Build de @ftn/web para producción (Railway). Se corre con contexto = raíz del monorepo,
# porque necesita ver packages/shared (@ftn/shared se compila antes que @ftn/web).
FROM node:20-bookworm-slim

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app
COPY . .

# NEXT_PUBLIC_* se incrusta en el bundle del cliente durante "next build" — tiene que
# estar disponible como build arg, no solo como variable de entorno en runtime, porque
# para entonces el bundle ya quedó compilado con el valor (o el fallback) de esta etapa.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ftn/shared build
RUN pnpm --filter @ftn/web build

WORKDIR /app/apps/web
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "start"]
