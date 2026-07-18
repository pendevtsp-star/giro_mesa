FROM node:24-alpine AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @giromesa/api... build

ENV NODE_ENV=production
ENV PORT=3333

EXPOSE 3333

CMD ["pnpm", "--filter", "@giromesa/api", "start"]
