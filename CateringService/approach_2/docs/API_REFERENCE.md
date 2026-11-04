# CaterConnect — API Reference Guide

All client requests communicate with the **API Gateway** (`http://127.0.0.1:8080`) which forwards requests to downstream microservices with verified user identity headers (`x-user-id`, `x-user-role`, `x-user-email`).

---

## 1. Authentication Service (`/api/auth`)

### Register New User
- **Method**: `POST`
- **Path**: `/api/auth/register`
- **Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "Password123!",
    "phone": "+919876543210",
    "role": "customer",
    "fullName": "Kalyan Chakravarthy"
  }
  ```
- **Response**: `201 Created` with `{ "token": "...", "user": { ... } }`

### Login
- **Method**: `POST`
- **Path**: `/api/auth/login`
- **Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "Password123!"
  }
  ```
- **Response**: `200 OK` with `{ "token": "...", "user": { ... } }`

### Current Session
- **Method**: `GET`
- **Path**: `/api/auth/me`
- **Headers**: `Authorization: Bearer <token>`
- **Response**: `200 OK` with `{ "user": { ... } }`

---

## 2. Caterer & Menu Service (`/api/caterers`)

### List Approved Caterers (Public)
- **Method**: `GET`
- **Path**: `/api/caterers?cuisine=andhra&city=Tirupati`
- **Response**: `200 OK` with `{ "caterers": [ ... ] }` (only `approved` caterers returned)

### Get Caterer Profile & Menu Catalog
- **Method**: `GET`
- **Path**: `/api/caterers/:id`
- **Response**: `200 OK` with `{ "caterer": { ..., "packages": [ ... ] } }`

### Caterer Onboarding
- **Method**: `POST`
- **Path**: `/api/caterers/onboard`
- **Headers**: `Authorization: Bearer <token>`
- **Body**:
  ```json
  {
    "businessName": "Sri Venkateswara Catering Services",
    "description": "Authentic wedding feasts in Tirupati",
    "city": "Tirupati",
    "serviceAreas": ["Alipiri", "MR Palli"],
    "cuisines": ["andhra", "south_indian"],
    "fssaiNumber": "10123000004567",
    "gstNumber": "37AAAAA0000A1Z5"
  }
  ```
- **Response**: `201 Created` with initial status `pending`

### Create Banquet Package
- **Method**: `POST`
- **Path**: `/api/caterers/:id/packages`
- **Headers**: `Authorization: Bearer <token>`
- **Body**:
  ```json
  {
    "name": "Grand Wedding Feast",
    "pricePerPlatePaise": 35000,
    "minGuests": 100,
    "maxGuests": 1000,
    "isVeg": true,
    "items": [
      { "name": "Mysore Pak", "category": "dessert" },
      { "name": "Sambar & Rasam", "category": "main" }
    ]
  }
  ```
- **Response**: `201 Created`

### Calendar Availability & Blackout Dates
- **Method**: `GET`
- **Path**: `/api/caterers/:id/availability?month=2026-11`
- **Response**: `200 OK` with `{ "unavailableDates": ["2026-11-20"] }`

- **Method**: `POST`
- **Path**: `/api/caterers/:id/blackout-dates`
- **Body**: `{ "unavailableDate": "2026-11-25", "reason": "Private Family Function" }`
- **Response**: `201 Created`

---

## 3. Booking & Order Service (`/api/bookings`)

### Create Booking Request (Customer)
- **Method**: `POST`
- **Path**: `/api/bookings`
- **Headers**: `Authorization: Bearer <token>`
- **Body**:
  ```json
  {
    "catererId": "d0000000-0000-0000-0000-000000000001",
    "packageId": "e0000000-0000-0000-0000-000000000001",
    "eventDate": "2026-11-20",
    "eventTime": "12:30:00",
    "guestCount": 100,
    "venueAddress": "MR Palli Community Hall, Tirupati",
    "city": "Tirupati",
    "specialRequests": "Extra ghee for banana leaf meals"
  }
  ```
- **Response**: `201 Created` with `{ "booking": { "status": "requested", "total_amount_paise": 3500000 } }`

### Accept Booking Request (Caterer)
- **Method**: `POST`
- **Path**: `/api/bookings/:id/accept`
- **Headers**: `Authorization: Bearer <token>`
- **Body**: `{ "note": "Menu confirmed! Looking forward to catering your event." }`
- **Response**: `200 OK` (Snapshots 15% platform commission)

### Reject Booking Request (Caterer)
- **Method**: `POST`
- **Path**: `/api/bookings/:id/reject`
- **Headers**: `Authorization: Bearer <token>`
- **Body**: `{ "note": "Fully booked for morning muhurtham on this date." }`

### Cancel Booking (Customer / Caterer)
- **Method**: `POST`
- **Path**: `/api/bookings/:id/cancel`
- **Body**: `{ "reason": "Event postponed" }`
- **Response**: `200 OK` (calculates policy refund in paise and releases calendar lock)

### Mark Event Completed (Caterer)
- **Method**: `POST`
- **Path**: `/api/bookings/:id/complete`
- **Response**: `200 OK` (Permitted only on or after event date for paid bookings)

---

## 4. Payment & Settlement Service (`/api/payments`)

### Create Razorpay Order (Dual Flow)
- **Method**: `POST`
- **Path**: `/api/payments/create-order`
- **Body**:
  ```json
  {
    "bookingId": "b0000000-0000-0000-0000-000000000001",
    "paymentOption": "advance",
    "advancePct": 25
  }
  ```
- **Response**: `200 OK` with `{ "orderId": "order_...", "amountPaise": 875000, "balanceDuePaise": 2625000 }`

### Razorpay Webhook (Internal / Gateway direct)
- **Method**: `POST`
- **Path**: `/api/payments/webhook`
- **Headers**: `x-razorpay-signature: <hmac_sha256_hash>`
- **Body**: Razorpay standard payload (`order.paid` or `payment.captured`)
- **Response**: `200 OK` (Verifies HMAC, transitions booking to `paid`, creates settlement row)

### Caterer Payout Ledger
- **Method**: `GET`
- **Path**: `/api/payments/settlements/caterer/:catererId`
- **Response**: `200 OK` with summary (`totalGrossPaise`, `pendingDisbursementPaise`) and list of settlements.

---

## 5. In-App Chat & Messaging Service (`/api/chat`)

### Get or Create Thread for Booking
- **Method**: `GET`
- **Path**: `/api/chat/threads/booking/:bookingId`
- **Headers**: `Authorization: Bearer <token>`
- **Response**: `200 OK` with `{ "thread": { "id": "...", "bookingId": "..." } }`

### Get Thread Messages
- **Method**: `GET`
- **Path**: `/api/chat/threads/:threadId/messages`
- **Response**: `200 OK` with chronological `{ "messages": [ ... ] }`

### Send Message
- **Method**: `POST`
- **Path**: `/api/chat/threads/:threadId/messages`
- **Body**: `{ "message": "Can we arrange Tirupati Laddu for the dessert?" }`
- **Response**: `201 Created`

### WebSocket Stream
- **Endpoint**: `ws://127.0.0.1:8080/api/chat/ws/:threadId`

---

## 6. Admin Operations Service (`/api/admin`)

*Guarded: Only accessible with Bearer JWT having `role: "admin"`.*

### Platform Financial Analytics
- **Method**: `GET`
- **Path**: `/api/admin/analytics`
- **Response**:
  ```json
  {
    "analytics": {
      "totalGMVPaise": 6125000,
      "totalCommissionPaise": 918750,
      "totalDisbursedPaise": 393750,
      "pendingPayoutsPaise": 525000,
      "totalBookingsCount": 4,
      "paidBookingsCount": 2,
      "totalCaterersCount": 2,
      "approvedCaterersCount": 1,
      "pendingCaterersCount": 1
    }
  }
  ```

### Manage Caterers (Verification Queue)
- **Method**: `GET`
- **Path**: `/api/admin/caterers?status=pending`
- **Response**: `200 OK` with caterer list and owner contact details.

- **Method**: `PATCH`
- **Path**: `/api/admin/caterers/:id/status`
- **Body**: `{ "status": "approved" }` or `{ "status": "rejected", "rejectionReason": "Invalid FSSAI format" }`
- **Response**: `200 OK`

### Master Bookings Log & Dispute Cancellation
- **Method**: `GET`
- **Path**: `/api/admin/bookings`
- **Response**: `200 OK` with all platform bookings.

- **Method**: `POST`
- **Path**: `/api/admin/bookings/:id/cancel`
- **Body**: `{ "reason": "Hall municipal water outage dispute" }`
- **Response**: `200 OK` (cancels booking and executes refund)

### Payout Settlements & Bank UTR Recording
- **Method**: `GET`
- **Path**: `/api/admin/settlements`
- **Response**: `200 OK` with all settlements across all caterers.

- **Method**: `POST`
- **Path**: `/api/admin/settlements/:id/disburse`
- **Body**: `{ "utrReference": "UTR_SBIN_20261104_998877" }`
- **Response**: `200 OK` (marks settlement as `settled` with timestamp)
