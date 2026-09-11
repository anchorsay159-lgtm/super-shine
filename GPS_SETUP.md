# Super Shine live GPS

The Driver workflow shares the assigned Driver's live location with the customer who owns the active order.

## Deploy

1. In Supabase, open **SQL Editor** and create a new query.
2. Paste and run `supabase/migrations/20260908150000_live_order_gps_tracking.sql`.
3. Create a second SQL Editor query, paste and run `supabase/migrations/20260908170000_gps_distance_arrival_notifications.sql`.
4. Create a third SQL Editor query, paste and run `supabase/migrations/20260908180000_staff_owned_live_tracking.sql`.
5. Publish the Expo web app from PowerShell:

   ```powershell
   cd "C:\Users\acer\Documents\IT SuperShine Project\SuperShine"
   npx.cmd expo export --platform web
   npx.cmd eas-cli deploy --prod
   ```

6. If you want the polished LINE Flex card for the arrival warning, deploy the updated worker from PowerShell:

   ```powershell
   $env:NODE_OPTIONS='--use-system-ca'
   npx.cmd supabase functions deploy line-notifications-worker --project-ref tozgpzdvddjtcdzhgbqa --no-verify-jwt
   Remove-Item Env:NODE_OPTIONS
   ```

## Use

1. Sign in to the admin app on the staff or driver's phone.
2. Open an order that is in **Accepted**, **Pickup in progress**, **Ready**, or **Out for delivery**.
3. The assigned Driver accepts the task, then presses **Start pickup & live GPS** or **Start delivery & live GPS**. Allow location access when the device asks.
4. That signed-in Driver and phone own the active tracking session. If the Admin reassigns the task, the prior session stops and only the newly assigned Driver can publish the trip location.
5. Keep the admin/driver order page open while travelling. The customer map, road route, distance, and ETA update automatically.
6. The customer order page requests the customer location automatically when pickup or delivery tracking becomes active.
7. When the driver is within about 1 km, the customer receives one **Driver arriving soon** notification in the app and through LINE (if LINE notifications are enabled).
8. The staff member can press **End live tracking**. Moving the order to **Picked up**, **Delivered**, **Collected**, or **Cancelled** also closes the applicable session automatically.

The web app must be served over HTTPS for browser location access. The production `expo.app` URL already meets this requirement. This release keeps only the latest driver point and latest customer pickup/delivery point; it does not retain a route history. The web prototype uses the public OSRM endpoint for a driving route, distance, and ETA. Configure `EXPO_PUBLIC_ROUTING_BASE_URL` to a managed/self-hosted OSRM-compatible service before relying on it for production dispatch. Browser GPS is foreground-only: the driver page must remain open, and the operating system’s location permission cannot be bypassed. True locked-screen/background tracking requires an installed native build with foreground and background location permissions.
