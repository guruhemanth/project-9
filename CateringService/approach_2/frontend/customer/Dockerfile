# Stage 1: Build the React application
FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.5.2 --activate

# Copy monorepo configuration and lockfile
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY shared ./shared
COPY frontend/customer ./frontend/customer

# Install dependencies and build shared library + customer app
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @caterconnect/shared run build
RUN pnpm --filter @caterconnect/customer-app run build

# Stage 2: Serve built static assets via Nginx Alpine
FROM nginx:alpine

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy custom Nginx configuration with SPA fallback and security headers
COPY frontend/customer/nginx.conf /etc/nginx/conf.d/default.conf

# Copy production build artifacts
COPY --from=builder /app/frontend/customer/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
