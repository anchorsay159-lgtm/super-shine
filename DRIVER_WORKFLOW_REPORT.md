# Super Shine Driver Workflow Upgrade

## 1–4. Architecture and database change

Before this upgrade, Super Shine already had one customer order workflow, existing
admin order controls, `assigned_driver_id`, live-location storage, Supabase
Realtime, notifications, the LINE delivery outbox, and payment/accounting rules.
There was no separate employee task lifecycle. The upgrade keeps those systems and
adds one small operational layer: `driver_tasks`.

`orders` remains the customer’s laundry journey. `driver_tasks` represents one
employee trip (pickup or delivery). Driver, customer, and admin views query the
same order/task records; no duplicate order statuses were introduced.

The migration adds `driver_tasks`, `driver_task_verifications`,
`driver_task_events`, `driver_task_issues`, task linkage on the existing
`order_live_locations` row, indexes, foreign keys, checks, RLS, server RPCs, and
Realtime publication entries.

## 5–7. Driver role, task model, and app routes

- Public registration is unchanged: it creates customers only.
- Admins create driver accounts through the protected `admin-create-driver` Edge
  Function, which creates a confirmed Auth user and a `profiles.role = 'driver'`
  profile server-side.
- Driver routes are `/driver` and `/driver/task/[id]`; customer and admin routes
  redirect drivers away from their respective app areas.
- The Driver app contains sign-in, assigned/current tasks, history, task detail,
  destination/contact details, action buttons, active GPS route, confirmation, and
  an issue report. It intentionally does not duplicate the Admin dashboard.

## 8–16. Operational workflow

Driver actions are buttons, never status dropdowns:

| Driver action | Driver task | Order result |
| --- | --- | --- |
| Accept assignment | `assigned → accepted` | No order change |
| Start pickup | `accepted → en_route` | `pickup_in_progress` |
| Start delivery | `accepted → en_route` | `out_for_delivery` |
| I’ve arrived | `en_route → arrived` | Order status remains unchanged |
| Confirm pickup | `arrived → completed` | `picked_up` |
| Confirm delivery | `arrived → completed` | `delivered` |

The start action requires the task to have been accepted. All transitions are
validated in server-side PostgreSQL RPCs. Driver actions cannot enter processing,
ready, store receipt, or store collection states.

The four fulfillment combinations are preserved:

| Fulfillment | Auto-created driver tasks |
| --- | --- |
| Home pickup + home delivery | Pickup after acceptance; delivery once ready |
| Home pickup + store collection | Pickup only |
| Store drop-off + home delivery | Delivery only once ready |
| Store drop-off + store collection | None |

Task creation is idempotent: the unique `(order_id, task_type)` constraint and
`ON CONFLICT DO NOTHING` mean retries, backfills, and repeated status events cannot
make duplicate pickup or delivery tasks.

## 17–20. GPS, realtime, notifications, and LINE

- The driver starts foreground GPS only when starting a task. The first valid
  location atomically starts the task and live tracking; later updates are
  throttled to at least four seconds/eight metres.
- GPS is task-scoped and reuses `order_live_locations`; it contains the latest
  active position instead of a permanent employee movement history.
- The watcher is cleaned up on pause, completion, sign-out/unmount, and task
  reassignment. An active en-route task resumes sharing when its driver opens it
  again. Permission/API failures leave the order unchanged and show the driver an
  error.
- Customer tracking shows driver assignment, the customer’s private four-digit
  code, live route, ETA/distance, and the existing customer journey. Admin order
  detail shows Driver trips; the new Drivers page provides dispatch, active work,
  and issues.
- Driver task tables are published to Supabase Realtime. Assignments and actions
  refresh relevant Driver/Admin/Customer screens without manual reload.
- Existing order-status notifications continue to flow through the existing
  notification/outbox/LINE worker. Arrival adds a customer notification. No LINE
  OAuth, channel, or webhook configuration was changed.

## 21–24. Security, audit, idempotency, and exceptions

- RLS allows an admin to supervise tasks, a driver to read only their assigned
  tasks, and a customer to read only task information for their own order.
- The verification-code table deliberately blocks driver reads. Customers can read
  their own code; drivers only submit a code to the completion RPC.
- Driver task issue notes are admin/assigned-driver only; they are not exposed to
  the customer payload.
- Direct task writes are revoked from anonymous/authenticated clients. Trusted RPCs
  validate role, ownership, task state, coordinates, and order state.
- Task events audit assignment, reassignment, accept/start/arrival/completion,
  failed code attempts, issues, resets, and emergency overrides. Existing order
  history correctly attributes driver-generated status transitions.
- Repeated accept/start/complete calls are safe. Verification failures are counted;
  five failures lock the code for ten minutes. The raw code is never written to an
  event.
- Drivers report an issue instead of changing arbitrary order data. Admins can
  resolve it, reset a task for retry, reassign it (reason required), or use the
  deliberately non-primary emergency completion override (reason required). An
  admin cannot use normal “More actions” to bypass a driver’s pickup/delivery
  completion.

## 25–26. Principal files and migration

- `supabase/migrations/20260910_driver_employee_workflow.sql`
- `supabase/functions/admin-create-driver/index.ts`
- `src/app/driver/index.tsx`
- `src/app/driver/task/[id].tsx`
- `src/app/admin/drivers.tsx`
- `src/components/admin-driver-task-card.tsx`
- `src/components/customer-driver-task-card.tsx`
- `src/driver/use-driver-tasks.ts`
- `src/hooks/use-driver-task-tracking.ts` and `.web.ts`
- `src/hooks/use-customer-driver-tasks.ts`
- `src/types/driver.ts`

## 27–29. Verification performed

Automated source/regression coverage validates task separation, the four
fulfillment paths, permission boundaries, verification locking, realtime wiring,
GPS ownership, existing payment/accounting separation, LINE behavior, customer
flow, web compatibility, and visual regressions.

Commands run successfully:

```powershell
npm.cmd test              # 88 passed, 0 failed
npm.cmd run check         # TypeScript and Expo lint passed
npx.cmd expo export --platform web --output-dir .tmp-driver-workflow-export
npx.cmd expo export --platform android --output-dir .tmp-driver-android-export
npx.cmd expo export --platform ios --output-dir .tmp-driver-ios-export
```

The exported web routes include `/driver`, `/driver/task/[id]`, and
`/admin/drivers`.

## 30–31. Remaining manual work and configuration

This implementation has not been deployed to the production database or Edge
Functions. Before testing with real staff, apply the migration and deploy the
trusted driver-account function from the `SuperShine` directory:

```powershell
npx.cmd supabase db push --project-ref tozgpzdvddjtcdzhgbqa
npx.cmd supabase functions deploy admin-create-driver --project-ref tozgpzdvddjtcdzhgbqa
```

Then create a test Driver account under **Admin → Drivers**, use a real customer
order, and grant location permission on the Driver’s device. This release uses
foreground tracking only: the Driver app must remain open while sharing location.
Background tracking was intentionally not enabled because it needs a separate
privacy policy, platform permissions, and product decision.

Payment and accounting stay owned by the existing payment/admin workflow. A driver
does not mark any payment paid; delivery status still uses the existing financial
closure rule for outstanding payments.

## 32. Before versus after

| Routine operation | Before | After |
| --- | --- | --- |
| Pickup starts | Driver calls admin; admin changes status | Driver starts pickup; order/GPS update automatically |
| Driver arrives | Informal/manual update | Driver records arrival; customer is notified |
| Pickup/delivery ends | Admin reproduces the physical action | Driver confirms with customer code; order advances |
| Assignment follow-up | Manual checking | Driver receives Realtime task update |
| Exception | Informal coordination | Driver issue + admin resolution/reset/reassign/override audit |

## 33. Professor-friendly explanation

Super Shine coordinates Customer, Driver, and Admin through one Supabase backend.
When an order reaches a pickup or delivery point, the backend automatically creates
one secure Driver task. The admin assigns an employee. The driver records their
real-world actions in a small driver interface, and trusted backend functions update
the main order, audit the action, send notifications, and publish Realtime changes.
The customer sees progress and the live route only for their own active order, while
the admin supervises exceptions instead of repeating every driver action.

## 34. Strongest presentation demonstration

Demonstrate **Home Pickup + Home Delivery** with three accounts/devices:

1. Customer places an order and opens its tracking screen.
2. Admin confirms it; the pickup task appears automatically.
3. Admin assigns Driver A; Driver A sees it without refresh.
4. Driver accepts and starts pickup; the customer and admin see live progress.
5. Driver arrives; customer receives the arrival update and gives the four-digit code.
6. Driver confirms pickup; the order advances to `picked_up`.
7. Admin progresses store-side cleaning to `ready`, assigns delivery, and repeat the
   start/arrival/code-confirmation flow for delivery.

This demonstrates role separation, automatic status propagation, GPS, Realtime,
notifications, security, and the fact that the admin is now an operations supervisor.
