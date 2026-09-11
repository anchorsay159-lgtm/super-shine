# Super Shine order workflow handoff

## Reading status

**CURRENTLY IMPLEMENTED** is source inspected in this repository. **PLANNED** is not production behavior. **KNOWN ISSUE** is an observed gap/uncertainty. **DO NOT CHANGE WITHOUT REVIEW** marks a cross-system contract.

## CURRENTLY IMPLEMENTED — roles and order statuses

`src/types/domain.ts` defines the order statuses below:

```text
pending
accepted
pickup_in_progress
picked_up
awaiting_dropoff
received_at_store
processing
ready
ready_for_collection
out_for_delivery
delivered
collected
cancelled
```

`src/lib/order-workflow.ts` defines the currently coded normal routes:

| Fulfillment choice | Status route |
| --- | --- |
| Home pickup + home delivery | `pending → accepted → pickup_in_progress → picked_up → processing → ready → out_for_delivery → delivered` |
| Store drop-off + home delivery | `pending → awaiting_dropoff → received_at_store → processing → ready → out_for_delivery → delivered` |
| Home pickup + store collection | `pending → accepted → pickup_in_progress → picked_up → processing → ready → ready_for_collection → collected` |
| Store drop-off + store collection | `pending → awaiting_dropoff → received_at_store → processing → ready → ready_for_collection → collected` |

The valid-next-status helper enforces a sequential route in client terminology. The database migration history includes server-side status update functions, so client routing is not the sole integrity control.

Fulfillment values are:

- collection: `home_pickup` or `store_dropoff`
- return: `home_delivery` or `store_collection`

The customer order flow collects services, care preferences/options, fulfillment/address/schedule information, and review/payment. The current app uses order, payment, status-history, upload, support-message, notification, and coupon flows around this lifecycle.

## CURRENTLY IMPLEMENTED — payment and pricing workflow

Payment methods in the domain type are `cash_pickup`, `cash_delivery`, and `promptpay`. Payment statuses are `unpaid`, `pending`, `paid`, `partially_paid`, `failed`, `expired`, and `refunded`. Price approval statuses are `not_required`, `pending`, `approved`, and `rejected`.

Customer code calls RPCs including `place_order_v20`, `withdraw_order_v11`, `respond_to_price_v17`, `prepare_promptpay_attempt_v19`, `request_promptpay_confirmation_v19`, and `customer_change_payment_method_v19`. Admin order detail code handles final pricing, PromptPay verification/failure, cash handoff/outstanding amounts, receipts, rescheduling, private notes, messages, and uploads.

Accounting is distinct from “payment status”: accounting migrations add immutable journal/event structures and accounting roles. See `docs/DATABASE.md` for source-backed detail.

## CURRENTLY IMPLEMENTED — status-driven notifications and tracking

Status changes can create in-app notifications; the repository contains a LINE outbox/worker design for eligible LINE-connected customers. Customer order tracking displays order journey/status information and can use realtime updates. GPS/live tracking migration source and hooks exist; historical setup documents describe staff-owned foreground tracking.

## CURRENTLY IMPLEMENTED IN LOCAL WORKTREE — driver workflow artifacts

The following driver/employee implementation is in the local worktree:

- driver and task routes: `src/app/driver/index.tsx`, `src/app/driver/task/[id].tsx`;
- admin and customer task cards: `src/components/admin-driver-task-card.tsx`, `src/components/customer-driver-task-card.tsx`;
- task/location hooks under `src/driver/` and `src/hooks/`;
- local driver role/types and `/admin/drivers` route;
- a Customer Web order-detail driver trip panel with task/location Realtime refresh;
- Edge Function source `supabase/functions/admin-create-driver/index.ts`;
- migration source `supabase/migrations/20260910_driver_employee_workflow.sql`.

The local migration also protects profile roles from client promotion, synchronizes task schedules, emits assignment/reassignment/schedule/cancellation notifications, supports task-scoped foreground tracking pause/resume, and prevents normal Admin order mutations from reproducing driver-owned transport transitions while an active task exists. The reason-required Admin override remains a separate audited path.

The migration and deployment were not verified remotely. These artifacts must be treated as local/unapplied work, not as a currently available customer or staff workflow.

## KNOWN ISSUE

- A customer can only observe reliable “live” tracking where the applicable database schema, realtime publication, authenticated staff/driver path, and device location permissions are all deployed/configured. This handoff does not verify those conditions remotely.
- `expo-location` supports foreground device-location use in the local worktree. There is no verified background tracking implementation in this handoff. Do not promise Grab-style tracking while the app is closed or backgrounded.
- Earlier staff-owned GPS functions remain in migration history for compatibility. New driver UI calls the task-scoped functions. Verify the target database definitions and active clients before retiring any legacy function.

## PLANNED — NEXT WORK: reviewed rollout of Customer ↔ Driver/Employee ↔ Admin

The following is the intended production architecture. Matching source is now present locally, but this remains **PLANNED** until the migration/function/build are reviewed, deployed, and tested with controlled real-role accounts:

1. An authorized admin assigns a pickup or delivery task to one active driver/employee for an eligible order stage.
2. The assigned driver sees only their own task, explicitly accepts it, and grants foreground location permission with a clear purpose message.
3. At the appropriate transit stage, the driver app periodically writes task-associated current location through a protected RPC; customers only see location for their own order and only while tracking is active.
4. Admin sees assignment, acceptance, last update, verification/issue events, and can use a reason-required exceptional override. Normal driver progress should remain driver-controlled to preserve accountability.
5. Customer tracking shows one plain status, ETA/distance when usable, a map only while shared tracking is active, support contact, and an “arriving soon” notification threshold. No customer location is required for a saved pickup/delivery address unless a separately approved feature asks for it.
6. Handoff verification should record collection/delivery evidence and status transitions. Payment confirmation remains an admin/accounting-controlled process; drivers must not be able to mark a payment paid.
7. End a task at collection/delivery/cancellation, stop location writes, reduce customer visibility, retain only the minimum audit history necessary for operations and disputes.

Before deploying this plan: confirm the remote schema/migration history, review the existing GPS objects against the task migration, test RLS and every fulfillment route using separate customer/driver/admin accounts, verify LINE and in-app delivery, confirm foreground-location privacy/retention wording, and obtain explicit user approval for database/function/app deployment.

## DO NOT CHANGE WITHOUT REVIEW

- Status labels or their ordering; they affect customer UI, admin pipeline grouping, RPC validation, notifications, GPS eligibility, and reports.
- Payment and price approval paths; especially do not permit drivers to confirm funds or bypass admin/accounting records.
- Assignment, visibility, and task transition rules; they are authorization and privacy controls, not only UI.
- GPS cadence, persistence, permission language, retention, and background behavior. These require product/privacy review and device testing.
