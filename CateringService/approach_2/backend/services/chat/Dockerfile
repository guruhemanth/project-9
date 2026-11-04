FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.16.1 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY shared ./shared
COPY backend ./backend

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @caterconnect/shared run build
RUN pnpm --filter @caterconnect/chat-service run build

EXPOSE 4006
ENV NODE_ENV=production
CMD ["node", "backend/services/chat/dist/index.js"]
