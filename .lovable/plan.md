
## Scope

Multi-area update across user / driver / admin apps. All changes frontend + existing tables (no new schema unless noted).

---

### 1. Payment options on trip-complete (User)

- Add **UPI** and **Card** to existing Cash on `complete.$id.tsx` (and driver complete flow).
- UPI ID: `mabubbasha9791-1@oksbi` (constant in `src/lib/payment.ts`).
- "Pay via UPI" → opens `upi://pay?pa=mabubbasha9791-1@oksbi&pn=Luxury%20Cabs&am=<fare>&cu=INR&tn=Trip%20<id>`.
- "Pay via Card" → Lovable-style sheet with card number / expiry / CVV fields (UI only, no gateway). On submit just marks payment_method=card, payment_status=paid (mock confirmation toast).
- `completeRide` server fn already accepts `cash|upi|card` — no backend change.

### 2. Cancel-with-reason (User + Admin)

- `src/lib/booking-store.ts` + new server fn `cancelBookingWithReason` (or extend existing) that writes `status='cancelled'`, `cancellation_reason`, `cancelled_by` (`user`|`admin`).
- Migration: add `cancellation_reason text`, `cancelled_by text` columns to `bookings` if not present.
- **User**: cancel button on tracking screen opens a free-text reason modal → confirm → cancels.
- **Admin**: in `admin.bookings.tsx`, "Cancel" action on active bookings → reason modal → cancels. The reason is shown on the user's tracking screen (cancelled state) with "Cancelled by admin: <reason>".

### 3. Admin: delete driver (soft + hard)

- `admin.drivers.tsx`: add row actions **Deactivate** (soft) and **Delete permanently** (hard, confirm modal).
- Server fns `deactivateDriver` (set `status='inactive'`) and `deleteDriver` (delete row + auth user via `supabaseAdmin.auth.admin.deleteUser`). Both admin-gated via `has_role(admin)`.
- Deleted driver's past bookings retain snapshotted name/phone/vehicle (already stored on booking row).

### 4. Admin manual assign driver

- Already exists (`assignBookingToDriver`). Surface it in `admin.bookings.tsx` for pending bookings: "Assign driver" dropdown listing approved drivers, then assign.

### 5. Unified live driver location across all 3 apps

- Driver app already writes `driver_lat/lng` to `bookings` and `current_lat/lng` to `drivers` via location watch on `driver.trip.$id.tsx`.
- Confirm/ensure realtime is enabled on `bookings`. If not, migration: `ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;`
- User `track.$id.tsx`, driver `driver.trip.$id.tsx`, admin `admin.live.tsx` all subscribe to the same booking row → same coords → same marker.

### 6. Customer tracking: full-screen map + bottom sheet (Uber/Ola)

- Rewrite `src/routes/track.$id.tsx` layout:
  - `RouteMap` fills viewport (`h-screen`).
  - Floating top bar: back + status badge.
  - Bottom sheet (drag-collapsible or fixed) showing: driver photo, name, rating, vehicle model + number, **OTP (large)**, ETA "Driver reaching in X min" (updates every 60s using Routes API ETA from driver coords to pickup, or by `eta_to_pickup_seconds` stored on booking), call button, cancel button.
- Remove pickup/drop address text from the map overlay; show them in the sheet (small icons).
- Map still shows pickup pin, drop pin, driver car icon, polyline.

### 7. ETA refresh every minute

- `track.$id.tsx` + driver app: every 60s call `getRoute` server fn (already exists in `src/lib/maps/routes.functions.ts`) with driver→pickup (before pickup) or driver→drop (after pickup). Display `duration_text`.

### 8. Driver app pickup-page flicker fix

- Investigate `driver.trip.$id.tsx`. Likely cause: same `RouteMap`-effect dependency loop. Fix: stable deps in map effect, throttle GPS writes (already 5s), avoid re-fitting bounds on every coord update — `RouteMap` already handles this after last fix but the driver page may be re-rendering map with new `pickup`/`drop` object identities each render → wrap in `useMemo`.

### 9. Additional items I'd like to add (for your approval — see end)

---

## Technical Notes

- New file: `src/lib/payment.ts` (UPI constant, helpers).
- New component: `src/components/PaymentSheet.tsx` (Cash / UPI / Card tabs).
- New component: `src/components/CancelReasonModal.tsx`.
- New component: `src/components/TrackingBottomSheet.tsx`.
- Server fn additions in `src/lib/booking.functions.ts` (new file): `cancelBooking({booking_id, reason, by})`.
- Server fn additions in `src/lib/driver.functions.ts`: `deactivateDriver`, `deleteDriver`.
- Migration: add `cancellation_reason`, `cancelled_by`, `eta_minutes` columns to `bookings`; add `bookings` + `drivers` to `supabase_realtime` publication if missing.
- `useMemo` pickup/drop objects in `driver.trip.$id.tsx` and `track.$id.tsx` to stop RouteMap reinit loop.

---

## Items to approve (additional, not yet built)

1. **Auto-cancel if no driver in 5 min** during searching → user gets "No drivers available, please try again" instead of infinite spinner.
2. **In-app driver↔user chat** (simple text, realtime) on tracking screen.
3. **Show fare breakdown** in bottom sheet (base + distance + GST).
4. **"Share live trip" button** that copies a public tracking link to clipboard (read-only view for family).
5. **Cancellation fee** (₹0 free if cancel within 2 min of assign, else ₹25 deducted from next ride).

Reply approve 1 / 2 / 3 / 4 / 5 (or "skip") after the main implementation.
