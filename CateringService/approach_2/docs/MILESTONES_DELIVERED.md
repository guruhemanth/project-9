# CaterConnect — Completed Milestones & Delivery Log

All 12 planned milestones for the CaterConnect two-sided marketplace (Tirupati launch) have been built, integrated, tested, and verified.

---

## Milestone Summary Matrix

| Milestone | Title | Port / Scope | Status | Test Coverage |
| :---: | :--- | :--- | :---: | :---: |
| **M1** | Database Schema, Auth & Roles | `auth-service` (:4001) | ✅ Approved | 3/3 Tests Passed |
| **M2** | Caterer Onboarding & FSSAI Verification | `caterer-menu-service` (:4002) | ✅ Approved | 5/5 Tests Passed |
| **M3** | Banquet Packages & Plate Pricing | `caterer-menu-service` (:4002) | ✅ Approved | Integrated |
| **M4** | Customer Discovery & Booking Requests | `booking-order-service` (:4003) | ✅ Approved | 6/6 Tests Passed |
| **M5** | Caterer Booking State Machine | `booking-order-service` (:4003) | ✅ Approved | State Machine Tests |
| **M6** | Dual Payments & Razorpay Webhooks | `payment-service` (:4004) | ✅ Approved | 5/5 Tests Passed |
| **M7** | Reviews, API Gateway & Monorepo | `api-gateway` (:8080) | ✅ Approved | Gateway Tests |
| **M8** | Live Availability & Blackout Dates | `caterer-menu-service` (:4002) | ✅ Approved | Auto-lock Tests |
| **M9** | Caterer Payouts & Settlement Ledger | `payment-service` (:4004) | ✅ Approved | 15% Comm & UTR Tests |
| **M10**| Transactional WhatsApp & SMS Alerts | `notification-service` (:4005) | ✅ Approved | 3/3 Tests Passed |
| **M11**| Real-Time In-App Messaging | `chat-service` (:4006) | ✅ Approved | 3/3 Tests Passed |
| **M12**| Admin Operations Center & Super-Dashboard | Gateway (:8080) & Partner Portal | ✅ Approved | 36/36 Tests Passed |

---

## Detailed Milestone Logs

### Milestone 1: Schema, Auth & Roles
- **Objective**: PostgreSQL relational schemas, phone/email authentication, and role derivation (`customer`, `caterer`, `admin`).
- **Key Deliverable**: `auth-service` with bcrypt (cost 10), JWT tokens, and `auth_svc.users` table.

### Milestone 2: Caterer Onboarding & FSSAI Verification
- **Objective**: Onboard Tirupati caterers with strict 14-digit FSSAI format checking and verification status lifecycle.
- **Key Deliverable**: `caterer_svc.caterers` with `status IN ('pending', 'approved', 'rejected', 'suspended')`. Unapproved caterers hidden from public search.

### Milestone 3: Menu Packages & Catalog
- **Objective**: Package management with per-plate pricing in integer paise.
- **Key Deliverable**: `caterer_svc.packages` and `caterer_svc.package_items` supporting multi-category Andhra and South Indian dishes.

### Milestone 4: Customer Discovery & Booking Requests
- **Objective**: Tirupati event hosts discover caterers and send booking requests.
- **Key Deliverable**: `order_svc.bookings` request creation with automated paise total calculations and blackout date collision detection.

### Milestone 5: Caterer Booking Management & State Machine
- **Objective**: Strict booking transition enforcement (`requested` $\rightarrow$ `accepted` $\rightarrow$ `paid` $\rightarrow$ `completed`).
- **Key Deliverable**: 15% platform commission snapshotting on acceptance; disallowed transitions blocked at database and API layers.

### Milestone 6: Dual Payments & Razorpay Webhooks
- **Objective**: Option 1 (100% Full Payment) vs. Option 2 (25% Advance Deal Lock).
- **Key Deliverable**: Cryptographic HMAC-SHA256 signature verification in `payment-service`. Client payment claims never trusted.

### Milestone 7: Reviews, API Gateway & Monorepo
- **Objective**: Centralized API Gateway and customer review pipeline.
- **Key Deliverable**: `api-gateway` with `fastify-http-proxy`, JWT forwarding, and post-event rating submission.

### Milestone 8: Live Availability & Calendar Management
- **Objective**: Caterer blackout date management and automatic date locking.
- **Key Deliverable**: `caterer_svc.caterer_availability` supporting manual unavailability and `auto_locked = true` for active bookings.

### Milestone 9: Caterer Payouts & Settlement Ledger
- **Objective**: Payout accounting ledger tracking $\text{gross} = \text{commission} + \text{net payout}$.
- **Key Deliverable**: `pay_svc.caterer_settlements` with bank UTR reference recording upon disbursement.

### Milestone 10: Transactional WhatsApp & SMS Notifications
- **Objective**: Multichannel communication for event hosts and caterers in India.
- **Key Deliverable**: `notification-service` with deep-link WhatsApp formatting for quick coordination.

### Milestone 11: Real-Time In-App Messaging
- **Objective**: In-app live chat for menu customization and venue timing.
- **Key Deliverable**: `chat-service` with `chat_svc` schema, REST message history, and WebSocket streaming. Integrated into both customer and partner applications.

### Milestone 12: Admin Operations Center & Super-Dashboard
- **Objective**: Marketplace governance, GMV analytics, and dispute handling.
- **Key Deliverable**: Super-Dashboard with live GMV, commission tracking, caterer FSSAI verification queue, master bookings audit log, dispute cancellation modal, and UTR payout entry.
