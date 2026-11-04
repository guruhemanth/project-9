# Project: CaterConnect (Approach 2 - Fastify Microservices)

## Overview
CaterConnect is a two-sided catering marketplace designed for India (launch city: Tirupati). Caterers register and undergo admin verification with FSSAI credentials before accepting bookings. Customers discover caterers, customize feast packages, and book events.

In **Approach 2**, the architecture transitions from a single Serverless/BaaS model into **high-performance Fastify (Node.js + TypeScript) microservices** with clear and clean naming:
- `frontend/` (React 19 + TypeScript + Vite + Tailwind CSS PWA)
- `backend/`
  - `gateway/` (API Gateway reverse proxy on :8080)
  - `services/auth/` (Auth & User Service on :4001)
  - `services/caterer-menu/` (Caterer & Menu Service on :4002)
  - `services/booking-order/` (Booking & Order State Machine Service on :4003)
  - `services/payment/` (Razorpay Payment Service with Dual Options on :4004)
- `shared/` (Shared TypeScript contracts, Zod schemas, paise formatters)
- `database/` (PostgreSQL service migrations and seed data)

## Core Rules & Non-Negotiables
1. **Money in Integer Paise:** All money columns and calculations are in integer paise (never floating point numbers).
2. **Deterministic State Machine:** Booking transitions strictly follow `SPEC.md`:
   `requested` $\rightarrow$ `accepted` $\rightarrow$ `paid` $\rightarrow$ `completed`.
3. **Verified Webhooks:** Bookings are only moved to `paid` status via verified Razorpay webhooks (HMAC SHA-256).
4. **Caterer Visibility:** Only caterers with `status = 'approved'` are public and discoverable by customers.
5. **Mobile-First PWA:** Responsive at 360px+ screen widths.
