FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.16.1 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY shared ./shared
COPY backend ./backend

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @caterconnect/shared run build
RUN pnpm --filter @caterconnect/caterer-menu-service run build

EXPOSE 4002
ENV NODE_ENV=production
CMD ["./node_modules/.bin/tsx", "backend/services/caterer-menu/src/index.ts"]
