# CaterConnect — System Architecture & Technical Specifications

This document outlines the detailed architectural decisions, domain models, database schema topology, and technical invariants implemented across the CaterConnect catering marketplace.

---

## 1. Domain & Microservice Topology

The backend is decomposed into 6 independent, stateless Fastify microservices behind an API Gateway:

```
                            ┌───────────────────────────────────┐
                            │        API Gateway (:8080)        │
                            └─────────────────┬─────────────────┘
                                              │
    ┌──────────────────┬──────────────────────┼──────────────────────┬──────────────────┐
    ▼                  ▼                      ▼                      ▼                  ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────────┐ ┌───────────────────┐ ┌───────────────┐
│  Auth Service │ │Caterer Service│ │  Booking Service  │ │  Payment Service  │ │  Chat Service │
│   Port 4001   │ │   Port 4002   │ │     Port 4003     │ │     Port 4004     │ │   Port 4006   │
└───────┬───────┘ └───────┬───────┘ └─────────┬─────────┘ └─────────┬─────────┘ └───────┬───────┘
        │                 │                   │                     │                   │
        ▼                 ▼                   ▼                     ▼                   ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────────┐ ┌───────────────────┐ ┌───────────────┐
│ auth_svc      │ │ caterer_svc   │ │ order_svc         │ │ pay_svc           │ │ chat_svc      │
│ • users       │ │ • caterers    │ │ • bookings        │ │ • payments        │ │ • chat_threads│
│ • profiles    │ │ • packages    │ │ • booking_history │ │ • settlements     │ │ • chat_messages
└───────────────┘ │ • blackout    │ └───────────────────┘ └───────────────────┘ └───────────────┘
                  └───────────────┘
```

---

## 2. Microservice Responsibilities

### 2.1. API Gateway (`backend/gateway/` — Port 8080)
- **Role**: Single entry point for all client traffic.
- **Routing Engine**: `@fastify/http-proxy` upstreaming requests to internal microservices.
- **Security Guards**:
  - Validates client Bearer JWT tokens using `fastify-jwt`.
  - Injects authenticated claims into forwarded upstream headers: `x-user-id`, `x-user-role`, `x-user-email`.
  - Enforces `adminAuthPreHandler` on all `/api/admin/*` routes (rejecting non-admin clients with `403 Forbidden`).

### 2.2. Auth Service (`backend/services/auth/` — Port 4001)
- Handles user registration, credentials authentication, phone number normalization (+91 format), bcrypt password hashing (cost factor 10), and JWT token minting.
- Provides `GET /api/auth/me` to verify user session claims.

### 2.3. Caterer & Menu Service (`backend/services/caterer-menu/` — Port 4002)
- Manages caterer profile lifecycle: `pending` $\rightarrow$ `approved` | `rejected` | `suspended`.
- Strict validation of 14-digit FSSAI registration numbers (`/^[0-9]{14}$/`) and optional GST identification numbers.
- Handles banquet menu packages (`packages`) and dish items (`package_items`) categorized into Starters, Main Course, Banana Leaf traditional dishes, and Sweets.
- Manages caterer calendar availability (`caterer_availability`): allows caterers to set blackout dates and automatically locks dates for confirmed bookings.

### 2.4. Booking & Order Service (`backend/services/booking-order/` — Port 4003)
- Manages the core catering booking lifecycle:
  - `POST /api/bookings`: Validates booking date against caterer blackout dates; calculates total cost in integer paise based on guest count and package per-plate price; transitions status to `requested`.
  - `POST /api/bookings/:id/accept`: Caterer acceptance; snapshots the active platform commission rate (15.00%) and commission amount in paise.
  - `POST /api/bookings/:id/reject`: Caterer rejection with reason.
  - `POST /api/bookings/:id/cancel`: Customer/caterer cancellation adhering to cancellation refund rules.
  - `POST /api/bookings/:id/complete`: Caterer marks event completed (only permitted on or after event date).
  - `POST /api/admin/bookings/:id/cancel`: Admin dispute resolution cancellation with auto-calculated refunds and blackout date release.

### 2.5. Payment & Settlement Service (`backend/services/payment/` — Port 4004)
- **Dual Payment Flows**:
  - **Option 1 (100% Full Payment)**: Order created for 100% of the total amount.
  - **Option 2 (25% Advance Deal Lock)**: Order created for 25% advance lock with the remaining 75% balance tracked on the booking record.
- **Webhook Verification**: Validates Razorpay HMAC-SHA256 signatures (`x-razorpay-signature`) using raw payload buffer verification. Never trusts client-reported payment success.
- **Settlement Ledger (`caterer_settlements`)**: Automatically creates settlement rows for caterer net payouts ($\text{gross} - \text{commission}$) upon payment capture.
- **Disbursement API**: Supports recording bank UTR transaction references when funds are disbursed to caterers.

### 2.6. Notification Service (`backend/services/notification/` — Port 4005)
- Generates transactional notifications for booking state changes.
- Dispatches SMS payloads and formats deep-link WhatsApp messages formatted with Tirupati event details and quick actions.

### 2.7. Chat & Messaging Service (`backend/services/chat/` — Port 4006)
- Thread-per-booking messaging model.
- Restricts thread access strictly to booking participants (customer host and caterer owner) or platform admins.
- Supports both RESTful message history retrieval (`GET /api/chat/threads/:id/messages`) and real-time WebSocket communication (`/api/chat/ws/:id`).

---

## 3. Database Schema Isolation

Postgres is partitioned into logical schemas:

```sql
-- Schema List
CREATE SCHEMA IF NOT EXISTS auth_svc;
CREATE SCHEMA IF NOT EXISTS caterer_svc;
CREATE SCHEMA IF NOT EXISTS order_svc;
CREATE SCHEMA IF NOT EXISTS pay_svc;
CREATE SCHEMA IF NOT EXISTS notify_svc;
CREATE SCHEMA IF NOT EXISTS chat_svc;
CREATE SCHEMA IF NOT EXISTS review_svc;
```

### Key Relational Entities
- `auth_svc.users`: `(id, email, phone, role, password_hash, full_name, created_at)`
- `caterer_svc.caterers`: `(id, owner_id, business_name, description, city, service_areas, cuisines, fssai_number, gst_number, status, rejection_reason, avg_rating, review_count)`
- `caterer_svc.packages`: `(id, caterer_id, name, description, price_per_plate_paise, min_guests, max_guests, is_veg, is_active)`
- `caterer_svc.package_items`: `(id, package_id, name, category)`
- `caterer_svc.caterer_availability`: `(id, caterer_id, unavailable_date, reason, auto_locked)`
- `order_svc.bookings`: `(id, customer_id, caterer_id, package_id, event_date, event_time, guest_count, venue_address, city, special_requests, status, total_amount_paise, commission_pct, commission_amount_paise, payment_type, advance_pct, amount_paid_paise, balance_due_paise, caterer_note, cancelled_by, cancel_reason, refund_amount_paise)`
- `order_svc.booking_status_history`: `(id, booking_id, from_status, to_status, changed_by, created_at)`
- `pay_svc.payments`: `(id, booking_id, razorpay_order_id, razorpay_payment_id, amount_paise, currency, status, payment_type)`
- `pay_svc.caterer_settlements`: `(id, booking_id, caterer_id, gross_amount_paise, commission_pct, commission_amount_paise, net_payout_paise, status, utr_reference, settled_at)`
- `chat_svc.chat_threads`: `(id, booking_id, customer_id, caterer_id, last_message_at)`
- `chat_svc.chat_messages`: `(id, thread_id, sender_id, sender_role, message, is_read, created_at)`
- `review_svc.reviews`: `(id, booking_id, customer_id, caterer_id, rating, comment, created_at)`

---

## 4. Financial & Calculation Invariants

All calculations strictly preserve integer paise:

$$\text{Total Amount Paise} = \text{Price Per Plate Paise} \times \text{Guest Count}$$

$$\text{Advance Paise (Option 2)} = \text{round}\left(\frac{\text{Total Amount Paise} \times 25}{100}\right)$$

$$\text{Balance Due Paise} = \text{Total Amount Paise} - \text{Advance Paise}$$

$$\text{Platform Commission Paise (15\%)} = \text{round}\left(\frac{\text{Gross Amount Paise} \times 15}{100}\right)$$

$$\text{Caterer Net Payout Paise} = \text{Gross Amount Paise} - \text{Platform Commission Paise}$$

### Cancellation Refund Policy Matrix
- **Cancelled by Caterer / Admin**: 100% refund of paid amount to customer.
- **Cancelled by Customer**:
  - $\ge 7$ days before event: 100% refund.
  - $3 \text{ to } 7$ days before event: 50% refund.
  - $< 3$ days before event: 0% refund (caterer compensated for fresh preparation procurement).
