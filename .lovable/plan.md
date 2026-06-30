## Goal
One reusable map screen used end-to-end, no duplicate map pickers, dedicated pages for Rental and Outstation, simplified Local flow.

## Home screen (`/booking`) — Local only
- Keep the trip-type chips (Local / Rental / Outstation) AT THE TOP of home.
  - Tapping Rental → `navigate({ to: "/booking/rental" })`.
  - Tapping Outstation → `navigate({ to: "/booking/outstation" })`.
- Remove the "Select on map" pill button and the small inline RouteMap preview.
- Remove the Date & Time card from home (moved to summary only).
- Pickup/Drop inputs stay (autocomplete). As soon as both pickup AND drop are set:
  - Open the full-screen single map (state-based, not a separate route). Reuse the same map component the driver trip uses (`RouteMap` already wraps Google Maps; we'll add the live ETA overlay used in `driver.trip.$id.tsx`).
  - UI layers: small top card showing pickup + drop addresses with a back chevron, bottom sheet with vehicle list, persistent "Use current location" FAB.
- Bottom-sheet vehicle picker shows Sedan / SUV with fares.
- Primary CTA renamed from "Book Now" → **"Review and Book"**, opens the Trip Summary sheet.

## Trip Summary (Local)
- Read-only chip row showing the trip type (Local).
- Route card: Drop has an **Edit** button (returns to home map to re-pick drop); Pickup is read-only here.
- Date & Time editor (this is where the date picker now lives).
- Vehicle + fare.
- Confirm Booking.

## Dedicated Rental page (`/booking/rental`)
- New route file `src/routes/_app.booking.rental.tsx`.
- Shows pickup input only (no drop), package picker (existing `RENTAL_PACKAGES`), vehicle picker, schedule, Review and Book → summary → confirm.

## Dedicated Outstation page (`/booking/outstation`)
- New route file `src/routes/_app.booking.outstation.tsx`.
- Pickup + Drop, vehicle picker, pickup date.
- **No return-date picker on the trip summary** — return date stays only on this page (or hidden, single date model). Trip summary just shows the chosen date with an Edit link back to this page.

## Shared map screen
- Extract `src/components/BookingMap.tsx` from the patterns already in `driver.trip.$id.tsx`:
  - Auto-fit pickup→drop with the route polyline.
  - Live "Driver arrives in X minutes · Y km away" overlay (only relevant on track screen; on booking screen it shows trip distance/duration instead).
  - "Recenter to my location" FAB using `navigator.geolocation`.
- Replace any ad-hoc map UI on `/track/$id` user view to use the same component so user + driver see identical map behavior.

## Files
- Edit: `src/routes/_app.booking.tsx` (gut Local home flow, remove date+map-pill, add map state, rename CTA, move trip chips, navigate on rental/outstation).
- Add: `src/routes/_app.booking.rental.tsx`, `src/routes/_app.booking.outstation.tsx`.
- Add: `src/components/BookingMap.tsx` (current-location FAB + ETA overlay reused by booking + track).
- Edit: `src/routes/track.$id.tsx` to use `BookingMap`.
- Remove `PickDropFlow` usage from booking (the inline map state replaces it).

## Out of scope
No backend/schema changes. No fare logic changes.
