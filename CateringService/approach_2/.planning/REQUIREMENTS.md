# Requirements: CaterConnect (Approach 2 - Fastify Microservices)

## 1. Domain Requirements

### Customer Domain
- **REQ-CUST-1:** Discover approved Tirupati caterers filtered by cuisine, price per plate, and guest capacity.
- **REQ-CUST-2:** View caterer details, ratings, and menu packages with course categorization (starters, mains, desserts, beverages).
- **REQ-CUST-3:** Submit booking requests with future event date, time, guest count, and venue in Tirupati.
- **REQ-CUST-4:** Pay for accepted bookings using **Dual Payment Options** (100% Full Payment or 25% Advance to lock deal).
- **REQ-CUST-5:** Track booking status and submit 1-5 star reviews upon event completion.

### Caterer Domain
- **REQ-CAT-1:** Register with business name, phone (+91), Tirupati service areas, and 14-digit FSSAI license.
- **REQ-CAT-2:** Manage menu packages, guest thresholds, veg/non-veg status, and course items with prices in paise.
- **REQ-CAT-3:** Receive incoming booking requests; accept (snapshotting platform commission) or reject with note.
- **REQ-CAT-4:** Mark paid events as completed on or after the event date.

### Admin Domain
- **REQ-ADM-1:** Review pending caterers; inspect FSSAI credentials; approve, reject with reason, or suspend.
- **REQ-ADM-2:** Adjust platform commission percentage (default 15.00%).

---

## 2. Technical & Microservices Requirements

### Shared Library (`packages/shared`)
- **REQ-TECH-1:** Shared TypeScript types and Zod schemas for validation across frontend and backend.
- **REQ-TECH-2:** Shared money helpers (`formatPaiseToINR`, `rupeesToPaise`) and date formatters (`Asia/Kolkata`).

### Microservices
- **REQ-TECH-3 (auth-service):** User registration, password hashing (bcrypt), and JWT issuance for `customer`, `caterer`, and `admin`.
- **REQ-TECH-4 (caterer-menu-service):** Caterer profile management, FSSAI verification queue, package and item CRUD.
- **REQ-TECH-5 (booking-order-service):** Transactional state machine enforcing transitions (`requested` $\rightarrow$ `accepted` $\rightarrow$ `paid` $\rightarrow$ `completed` $\rightarrow$ `cancelled`).
- **REQ-TECH-6 (payment-service):** Razorpay order creation for full vs 25% advance; HMAC SHA-256 webhook verification.
- **REQ-TECH-7 (api-gateway):** Fastify reverse proxy on `:8080` performing route forwarding and JWT authentication checks.
- **REQ-TECH-8 (Docker Orchestration):** Unified `docker-compose.yml` spinning up PostgreSQL, API gateway, microservices, and React frontend.
