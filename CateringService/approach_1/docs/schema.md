# Data Model and RLS (source of truth)

Postgres on Supabase. All money in integer paise. All timestamps `timestamptz`.
Every table has RLS enabled in the migration that creates it.
Helper: `public.current_role()` returns `profiles.role` for `auth.uid()` (security definer,
stable). Policies use it instead of trusting client claims.

## Enums

```sql
create type user_role as enum ('customer', 'caterer', 'admin');
create type caterer_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type booking_status as enum
  ('requested','accepted','rejected','paid','completed','cancelled','expired');
create type payment_status as enum ('created','captured','failed','refunded','partially_refunded');
```

## Tables

### profiles
One row per auth user.
| column | type | notes |
|---|---|---|
| id | uuid pk | references auth.users(id) on delete cascade |
| role | user_role | default 'customer'; **cannot be changed by the user** |
| full_name | text | |
| phone | text | +91 format |
| created_at | timestamptz | default now() |

### caterers
| column | type | notes |
|---|---|---|
| id | uuid pk | default gen_random_uuid() |
| owner_id | uuid | references profiles(id), unique |
| business_name | text | not null |
| description | text | |
| city | text | not null (e.g. 'Tirupati') |
| service_areas | text[] | areas/towns served |
| cuisines | text[] | e.g. {'andhra','north_indian'} |
| fssai_number | text | not null |
| gst_number | text | nullable |
| status | caterer_status | default 'pending' |
| rejection_reason | text | |
| avg_rating | numeric(3,2) | maintained by trigger |
| review_count | int | maintained by trigger |
| created_at | timestamptz | |

### caterer_documents
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| caterer_id | uuid | references caterers(id) on delete cascade |
| doc_type | text | 'fssai_certificate', 'id_proof', 'photo' |
| storage_path | text | path in private bucket `caterer-docs` |
| created_at | timestamptz | |

### packages
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| caterer_id | uuid | references caterers(id) on delete cascade |
| name | text | |
| description | text | |
| price_per_plate | int | paise |
| min_guests | int | default 10 |
| max_guests | int | nullable |
| is_veg | boolean | |
| is_active | boolean | default true |

### package_items
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| package_id | uuid | references packages(id) on delete cascade |
| name | text | e.g. 'Paneer Butter Masala' |
| category | text | starter, main, dessert, beverage |

### addons
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| caterer_id | uuid | references caterers(id) on delete cascade |
| name | text | e.g. 'Live counter', 'Extra waiter' |
| price | int | paise |
| pricing_unit | text | 'flat' or 'per_plate' |

### bookings
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| customer_id | uuid | references profiles(id) |
| caterer_id | uuid | references caterers(id) |
| package_id | uuid | references packages(id) |
| event_date | date | must be in the future at creation |
| event_time | time | |
| guest_count | int | >= package min_guests |
| venue_address | text | |
| city | text | |
| special_requests | text | |
| status | booking_status | default 'requested' |
| total_amount | int | paise; set on acceptance |
| commission_pct | numeric(4,2) | copied from platform_settings on acceptance |
| commission_amount | int | paise |
| caterer_note | text | reason on reject/accept |
| cancelled_by | user_role | nullable |
| cancel_reason | text | |
| refund_amount | int | paise; computed per policy |
| created_at / updated_at | timestamptz | |

### booking_addons
`booking_id`, `addon_id`, `quantity`, `price_at_booking` (paise).

### booking_status_history
`id`, `booking_id`, `from_status`, `to_status`, `changed_by` (uuid, nullable for system),
`created_at`. Insert-only.

### payments
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| booking_id | uuid | references bookings(id) |
| razorpay_order_id | text | unique |
| razorpay_payment_id | text | unique, nullable until captured |
| amount | int | paise |
| status | payment_status | |
| raw_event | jsonb | last webhook payload for audit |
| created_at | timestamptz | |

### reviews
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| booking_id | uuid | **unique**, references bookings(id) |
| customer_id | uuid | |
| caterer_id | uuid | |
| rating | int | check 1..5 |
| comment | text | |
| created_at | timestamptz | |

### platform_settings
Single-row table: `id` (always 1), `commission_pct numeric(4,2)` default 15.00.

## RLS rules

Legend: C = customer, K = caterer owner, A = admin, anon = not logged in.

| Table | anon | Customer | Caterer | Admin |
|---|---|---|---|---|
| profiles | none | select/update own row (cannot change `role`) | same | select all; update role |
| caterers | select where status='approved' (public columns only) | same as anon | select/update own row; cannot change `status`, `avg_rating`, `review_count` | all |
| caterer_documents | none | none | insert/select/delete own | select all |
| packages, package_items, addons | select where caterer is approved and package active | same | full CRUD on own caterer's rows | all |
| bookings | none | insert own (status must be 'requested'); select own; no direct update of status | select rows for own caterer; no direct update of status | select all |
| booking_addons | none | via own booking | select via own booking | select all |
| booking_status_history | none | select via own booking | select via own booking | select all |
| payments | none | select own booking's | select own booking's | select all |
| reviews | select all | insert only for own completed booking, once; no update | select own caterer's | all; may delete |
| platform_settings | none | none | none | select/update |

Notes:
- Booking **status changes happen only through RPC functions** (`accept_booking`,
  `reject_booking`, `cancel_booking`, `complete_booking`) marked `security definer`, which
  check the caller's role and the allowed transitions. The `paid` transition is done only by
  the webhook Edge Function using the service role.
- Direct `update` on `bookings.status` is denied by policy for all roles except service role.
- Storage bucket `caterer-docs` is private: caterers read/write their own folder
  (`{caterer_id}/...`), admins read all. Bucket `menu-photos` is public read, owner write.

## Indexes
- `caterers (city, status)`, GIN on `cuisines`
- `packages (caterer_id, is_active)`
- `bookings (customer_id)`, `(caterer_id, status)`, `(event_date)`
- `payments (booking_id)`

## Triggers
- On `auth.users` insert: create `profiles` row with role 'customer'.
- On `reviews` insert: recompute `caterers.avg_rating` and `review_count`.
- On `bookings` status change: insert `booking_status_history` row; update `updated_at`.
