
This is a large set of changes. I'll outline scope and approach, then ask a couple of decisions before building. Many items touch the same files (booking, confirm, track), so I'll batch.

## Scope

### 1. Auth — single page
Combine name + phone on one screen (remove 2-step). Save profile, go to booking.

### 2. Header
Remove "Luxury Cabs" wordmark/logo from in-app header (keep hamburger + current-location icon).

### 3. Vehicle list (Local + Rental)
Only Sedan and SUV cards (matching uploaded mock):
- Big white car image left, name + "X Seats | AC" + "Best for N People" right, radio right
- Selected = **black border** (no green theme), unselected = light gray border
- Remove the 7-model grid + custom "Other" input on Local/Rental tabs

### 4. Auto pickup time
Default departure datetime = now + 15 minutes (editable).

### 5. "Change vehicle" on confirm page
On `/confirm/$id`, show the selected vehicle card with a "Change Vehicle" button → opens a sheet listing Sedan/SUV → updates booking + recalculates fare.

### 6. City limit rule (Local)
If route distance > 15 km on Local tab → auto-switch to Outstation pricing/flow with a notice ("Trip exceeds 15 km local limit — switching to Outstation").

### 7. Outstation tab redesign (image 2)
- Header card "Outstation Trip — Travel to any city with comfort and safety" + illustration
- Journey Type (One Way / Round Trip), Departure Date, Return Date (optional)
- Vehicle horizontal scroller with 4 cards: **Sedan (Dzire/Etios) ₹12/km**, **Premium Sedan (Camry) ₹16/km**, **SUV (Innova Crysta) ₹18/km**, **SUV (Fortuner) ₹22/km** — selected card has green check badge
- "All outstation trips include Driver, Fuel, Toll, Parking & State Permit" notice
- Estimated Fare panel with Calculate Fare button → Distance / Duration / Estimated Fare
- Full-width green Continue button

### 8. Booking-confirmed page (image 3) — replaces current "finding driver" stage
After Confirm Booking:
- Show "My Booking" page with: Booking ID (LC + 8 digits) + Copy button
- Green "Booking Confirmed — Driver details will be shared with you shortly" banner
- Trip Details card (pickup, drop, date, time, distance, ETA)
- Ride Details card (vehicle image + seats + fare + payment)
- Yellow "Driver Not Assigned Yet — We are finding the nearest driver for your ride" panel with driver-silhouette illustration
- Action row: Track Booking / Contact Support / Cancel Booking
- "Share Trip" safety strip
- Stays on this screen until admin assigns driver (poll Supabase `status` field; 10–20 min real wait)
- Once `status = driver_assigned`, auto-navigate to live Track page (image 4 style)

### 9. Live Track page (image 4)
- Full-screen Google Map with route polyline, driver car icon moving along route, pickup + drop markers
- Top-left "Live Tracking — ETA: N min" pill
- Right column stat cards: Estimated Time, Distance, Estimated Fare, Toll
- Bottom bar: car icon + "Your Ride is on the way / Driver is following the best route" + driver photo, name, rating, plate, call button
- Auto-fit bounds, pinch zoom, recenter button

### 10. Activate all demo buttons across app
Wire up: heart (favorite), Share Trip (WhatsApp share sheet), Contact Support (tel:), Cancel Booking (updates Supabase + back to home), Copy booking ID (clipboard), recenter map button, call driver (tel:), swap pickup/drop arrows.

### 11. Admin assignment model (prep)
Driver assignment will no longer be auto-mocked in the customer app. We mark booking `status = searching_driver` on confirm and rely on an admin app (next phase) flipping it to `driver_assigned` with driver + vehicle details. For now, I'll add a small "Simulate Admin Assignment" dev-only button on the booking-confirmed page so the flow is testable end-to-end without the admin app yet.

## Files to touch
- `src/routes/auth.tsx` — single-page form
- `src/routes/_app.booking.tsx` — header logo removed, sedan/SUV-only list, +15min default time, 15km auto-switch, redesigned outstation tab
- `src/components/VehicleCard.tsx` — black-border selected state, layout to match mock
- `src/routes/confirm.$id.tsx` — add Change Vehicle sheet
- `src/routes/track.$id.tsx` — split into two stages: "Booking Confirmed / awaiting driver" (image 3) and "Live tracking" (image 4); poll Supabase status
- `src/lib/booking-store.ts` — add `LC########` short ID, status enum, helpers
- `src/lib/fare.ts` — outstation per-km tiers (12/16/18/22), 15km local cap helper
- `src/components/RouteMap.tsx` — auto-fit, driver marker animation, recenter

## Decisions I need from you

1. **Outstation vehicle set** — keep all 4 tiers (Sedan Dzire/Etios, Premium Sedan Camry, SUV Innova Crysta, SUV Fortuner)? Local tab keeps only Sedan + SUV.

2. **Admin assignment** — for now (before admin app exists), should I add a temporary "Simulate driver assigned" button on the awaiting-driver screen so you can test the full flow? Or wait fully silent until the admin app is built?

3. **Real-time updates** — use Supabase Realtime to push driver-assigned status (instant), or simple polling every 10s? Realtime is smoother; polling is simpler.

Once you answer, I'll build everything in one pass.
