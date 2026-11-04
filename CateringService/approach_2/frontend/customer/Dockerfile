FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.16.1 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY shared ./shared
COPY frontend/customer ./frontend/customer

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @caterconnect/shared run build
RUN pnpm --filter @caterconnect/customer-app run build

FROM nginx:alpine
COPY --from=builder /app/frontend/customer/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
