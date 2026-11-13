# CaterConnect Technology Stack

## Languages
- **TypeScript (v5.9.3)**: Primary language across frontend, backend microservices, gateway, and shared utilities.
- **Node.js (v22.x)**: Server runtime across all 6 microservices and API gateway.
- **SQL (PostgreSQL 16)**: Multi-schema relational database migrations and queries.
- **HTML5 / CSS3**: Responsive web interfaces with Tailwind CSS v4.

## Runtime
- **Node.js**: v22 LTS running inside Docker alpine containers.
- **Package Manager**: `pnpm` (v10) workspace managing monorepo packages.
- **Containerization**: Docker & Docker Compose orchestrating 10 isolated containers.

## Frameworks
- **Backend API Gateway & Services**:
  - `Fastify (v5.x)`: High-performance HTTP/2-ready microservices framework.
  - `@fastify/http-proxy`: Reverse proxy routing at API gateway.
  - `@fastify/jwt`: JWT authentication guard.
  - `@fastify/cors`: Strict origin CORS configuration.
  - `@fastify/helmet`: Security headers middleware.
  - `@fastify/websocket`: Real-time WebSocket messaging for chat.
- **Frontend Applications**:
  - `React (v19.x)`: Component-driven UI for Customer (`:3000`) and Partner (`:3001`) portals.
  - `Vite (v6/v7)`: Production asset bundler and development server.
  - `Tailwind CSS (v4.x)`: Utility-first styling with responsive UI components.
  - `react-router-dom (v7.x)`: Client-side routing with role-based auth guards (`RequireAuth`, `RequireRole`).

## Key Dependencies
- **Data Validation & Schemas**: `zod (v3.25)` enforcing runtime payload integrity across all service boundaries.
- **Database Client**: `pg (v8.23)` and `pg-pool` connecting to PostgreSQL schema partitions.
- **Authentication & Cryptography**: `bcrypt` password hashing (cost 10), `crypto.timingSafeEqual` internal token signatures, `google-auth-library` for Google Sign-In.
- **Logging**: `pino (v10.x)` structured JSON logging with security field redaction (`password`, `token`, `phone`).
- **Icons**: `lucide-react` modern icon library.

## Configuration
- Root configuration file: `.env`
- Port Assignments:
  - API Gateway: `8080` (public ingress)
  - Auth Service: `4001`
  - Caterer & Menu Service: `4002`
  - Booking & Order Service: `4003`
  - Payment Service: `4004`
  - Notification Service: `4005`
  - Chat Service: `4006`
  - Customer App: `3000`
  - Partner App: `3001`
  - PostgreSQL: `54322` (host) / `5432` (internal)

## Platform Requirements
- **Host**: Linux (Ubuntu 24.04 on Oracle Cloud VM: `129.225.70.124`).
- **Memory**: Minimum 4GB RAM recommended for full multi-container stack.
- **Storage**: Standard SSD with persistent PostgreSQL volume mounts.
