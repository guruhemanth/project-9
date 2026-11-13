FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.16.1 --activate

# Copy workspace configs
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY shared ./shared
COPY backend ./backend

# Install dependencies and build shared + backend
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @caterconnect/shared run build
RUN pnpm --filter @caterconnect/auth-service run build

EXPOSE 4001
ENV NODE_ENV=production
CMD ["./node_modules/.bin/tsx", "backend/services/auth/src/index.ts"]
