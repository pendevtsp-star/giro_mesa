FROM node:24-alpine AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

RUN apk add --no-cache python3 make g++ libusb-dev linux-headers eudev-dev
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

COPY . .

ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @giromesa/web... build
RUN chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000

USER node

CMD ["pnpm", "--filter", "@giromesa/web", "start"]
