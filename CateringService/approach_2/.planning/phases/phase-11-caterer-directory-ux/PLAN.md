# Phase 11: Dedicated Caterer Directory Page & User-Friendly Header Navigation

## 1. Context & Objectives
In the Customer Web App, the caterer listing was embedded inside the main home landing page.
The goal of this phase is:
1. Provide a **dedicated Caterer Directory / Explore Caterers page** (`/caterers` or `/explore`) separate from the home landing page.
2. Upgrade the Customer Header/Navbar with clear, intuitive, and user-friendly labels and icons:
   - "Explore Caterers" / "Browse Catering Menus"
   - "My Bookings" with clear badge count / status indicators
   - "Live Messages" / "Chat with Caterers"
   - Clear Login/Register buttons and Host profile badge
3. Ensure the mobile navigation bar provides responsive, friction-free access to all options.
4. Keep the home page focused on high-converting hero messaging, popular event categories (Weddings, Birthdays, Corporate), and quick call-to-actions pointing directly to the new dedicated Caterer Directory.

## 2. Changes & File Touches
- `frontend/customer/src/App.tsx`:
  - Add `/caterers` route pointing to `<CaterersDirectoryPage />`.
- `frontend/customer/src/features/customer/components/CaterersDirectoryPage.tsx`:
  - Create dedicated, rich explore page featuring city selector, cuisine filters, budget slider, guest capacity, and caterer cards.
- `frontend/customer/src/components/layout/Navbar.tsx`:
  - Modernize navigation links with user-friendly text, active indicators, and icons.
- `frontend/customer/src/features/customer/CustomerHome.tsx`:
  - Highlight key categories and include clear CTAs to "Explore All Caterers".

## 3. Verification Criteria
- Typecheck and build passes with zero errors (`tsc && vite build`).
- Routing to `/` shows clean landing page with hero CTA.
- Routing to `/caterers` loads dedicated caterers catalog with active search and filter controls.
- E2E tests and header link navigation pass cleanly.
