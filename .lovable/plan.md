## What I verified

Typecheck is clean, so these are behavioural/security issues, not build breaks. Everything below was confirmed by reading the code or querying the backend.

---

## Critical

**1. Admin pricing doesn't actually control Local fares**
`calcLocalFare` in `src/lib/fare.ts:61` ignores its `_rates` argument and uses hardcoded numbers (base 60, ₹30/km, ₹24/km above 20km, +30% for SUV). Same for `calcOutstationFare` (`fare.ts:76`), which reads the hardcoded `OUTSTATION_VEHICLES` array instead of the admin table. So the Local and Outstation tabs in the admin Pricing page save to the database but change nothing for customers.

Fix: make both functions read from the passed rates/DB rows, fall back to defaults only when the row is absent, and pass the loaded rates from every call site (booking page, complete page, invoice).

**2. The fare is decided by the browser**
`createBooking` (`src/lib/booking-store.ts:7`) inserts whatever `fare` the client sends, straight from the browser. That number then drives driver commission and wallet credit. A modified client can book a ₹1 trip. `updateBooking` (line 31) is likewise an open client-side patch of any column.

Fix: move booking creation into an authenticated server function that recalculates fare server-side from the stored route distance/duration and the DB rate tables, and narrow the client's update path to specific allowed fields.

---

## High

**3. Wallet updates can lose money**
`completeRide` (`src/lib/driver.functions.ts:157`) and `decideWithdrawal` (`src/lib/admin.functions.ts:321`) read the balance, add in JavaScript, then write it back. Two concurrent trip completions overwrite each other.

Fix: a small database function that increments the balance atomically, called from both places.

**4. Maps endpoints are open to anyone**
`reverseGeocode` and `computeRoute` (`src/lib/maps/geocode.functions.ts`, `routes.functions.ts`) have no auth middleware — anyone can call them and burn the Google Maps quota.

Fix: require a signed-in session on both.

**5. Booking page has a hydration mismatch**
`scheduledAt` is initialized with `new Date()` (`src/routes/_app.booking.tsx:61`), which differs between server render and browser.

Fix: initialize empty and set the default inside an effect.

**6. Driver Ride Requests refetches on every booking in the system**
The realtime subscription at `src/routes/driver.requests.tsx:52` has no filter, so every driver's client refetches whenever any booking anywhere changes.

Fix: filter the channel to that driver's bookings.

---

## Medium

**7. Two competing sources for the moving vehicle**
`src/routes/track.$id.tsx` subscribes to both the `bookings` row and the `drivers` row for driver location (lines ~400 and ~467). When both fire the marker can jump between two GPS samples — this is likely the "user side live update is not accurate" problem.

Fix: keep one source (the booking row) for active trips and drop the other.

**8. Rental and Outstation have no dedicated pages**
`src/routes/_app.booking.rental.tsx` and `_app.booking.outstation.tsx` do not exist — both flows are tabs inside `_app.booking.tsx`. If you still want dedicated URLs, they need to be created; otherwise the chips should stay in-place tabs.

**9. Dead code**
`src/components/PickDropFlow.tsx` (547 lines) is imported nowhere and contains a second, redundant Google Maps setup. `MapPicker` also runs its own map instance separate from `RouteMap`.

Fix: delete `PickDropFlow`; leave `MapPicker` for now (used by `PlaceAutocomplete`) or fold it onto the shared map later.

**10. Driver role granted before approval**
`signupDriver` (`src/lib/driver.functions.ts:31`) writes the `driver` role at signup even though the profile is `pending`.

Fix: grant the role only on admin approval.

**11. Missing page titles/metadata** on `_app.tsx`, `admin.pricing`, `admin.fares`, `admin.drivers`, `admin.approvals` and most other routes.

---

## Suggested order

1. Fare correctness + server-side fare calculation (issues 1, 2) — biggest business risk.
2. Wallet atomicity and Maps auth (3, 4).
3. Live-tracking single source + realtime filter + hydration (5, 6, 7).
4. Cleanup: dead code, driver role timing, metadata (9, 10, 11).
5. Decide on issue 8 (dedicated rental/outstation URLs) — needs your call.

## Two things I need from you

- Rental/Outstation: dedicated pages with their own URLs, or keep them as tabs on the home screen?
- Should I do all five stages in one pass, or stop after each stage so you can test?
