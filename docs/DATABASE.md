# Super Shine database and Supabase handoff

## Reading status

**CURRENTLY IMPLEMENTED** below means the objects are referenced by repository code or migrations. **PLANNED** is not an assertion about remote state. **KNOWN ISSUE** records what this review could not prove. **DO NOT CHANGE WITHOUT REVIEW** marks data/security contracts.

## CURRENTLY IMPLEMENTED — Supabase architecture

The repository uses Supabase Auth, Postgres, RLS, Realtime, Storage, database RPCs/triggers, and Edge Functions. The configured project reference in repository files is `tozgpzdvddjtcdzhgbqa`.

Migrations found in `supabase/migrations/` cover customer/catalog/security, coupons, realtime, demo/order/payment hotfixes, accounting, shared fulfillment, LINE notifications, scheduler/realtime dispatch, live GPS, staff-owned tracking, and a local driver workflow migration. They are ordered source history, not proof that every migration has been applied remotely.

## CURRENTLY IMPLEMENTED — primary tables and relationships

The following table groups are actively referenced in source/migrations.

| Group | Tables / relationship summary |
| --- | --- |
| Identity | `profiles` is the application profile tied to authenticated users and carries role/profile data. |
| Catalog and scheduling | `services`, `service_options`, `business_settings`, `pickup_slots`; orders select services/options and may reserve slots. |
| Customer/order | `addresses`, `orders`, `order_items`, `order_status_history`, `notifications`, `coupon_usage`, `profile_pickup_benefit_usage`; an order belongs to a customer and has ordered items/history. |
| Payment/support/files | `payments`, `support_messages`, `uploaded_files`; these attach customer/admin activity to orders/users. |
| Accounting | `accounting_staff_roles`, settings, accounts, tax rules, journal templates/lines, events, journal entries/lines, expenses, supplies, inventory movements/layers, service-cost rules/snapshots, budgets, invoices/lines, receipts, refunds, reprint history, and audit log. |
| LINE | `line_connections`, `line_link_attempts`, `line_webhook_events`, `line_notification_deliveries`. |
| GPS | `order_live_locations`, storing the current order-location model used by tracking code. Existing write paths assume one current row per order. |
| Local driver work | `driver_tasks`, `driver_task_verifications`, `driver_task_events`, `driver_task_issues` appear in `20260910_driver_employee_workflow.sql` only. |

Important table relationships inferred from foreign-key use and RPC/UI access: an order links to its customer profile, address/schedule/fulfillment choices, items, history, payments, customer notifications, files, support messages, LINE deliveries, and (when enabled) a current location. Accounting events and records may refer to order/payment lifecycle data. Driver tasks in the local migration link order and driver profile, with dependent verification/event/issue records.

## CURRENTLY IMPLEMENTED — critical database functions and triggers

Customer code calls versioned RPCs including:

- `place_order_v20`
- `withdraw_order_v11`
- `respond_to_price_v17`
- `prepare_promptpay_attempt_v19`
- `request_promptpay_confirmation_v19`
- `customer_change_payment_method_v19`

Migration source also contains admin/order status functions, notification triggers, accounting capture logic, and GPS/staff tracking functions such as `staff_start_order_tracking_v1`, `staff_update_order_location_v1`, and `staff_stop_order_tracking_v1`. The exact remote definitions must be read before changing a caller, status, or policy.

Accounting migrations describe event-driven, immutable journal entries/lines and capture/reversal/retry patterns. Do not substitute direct UI writes for the accounting workflow.

## CURRENTLY IMPLEMENTED — RLS and storage approach

Migration source enables RLS across the application. The source-backed pattern is:

- public/anonymous read access is narrowly used for active catalog/business/slot content where intended;
- customer access is scoped to that customer’s own records;
- normal administrative operations depend on admin checks/RPCs;
- direct client access to sensitive LINE delivery data and tracking writes is restricted or revoked in favor of protected server/RPC paths;
- accounting uses dedicated staff-role permissions, not simply an arbitrary client-side role;
- private order uploads use a private storage bucket, while business-public assets use a separate public bucket/policies.

GPS migration source grants participants limited reads but protects location writes through functions and authenticated role/ownership checks. The local driver migration adds task-specific RLS: drivers read their assigned task, customers read tasks for their own orders, and admins can manage; verification/issue access is more restrictive. It also adds task-scoped start/update/stop RPCs, a client role-change guard, a database guard against routine Admin transport transitions, schedule synchronization, driver operational notifications, audit events, and a reason-required override. This is local migration source only.

## KNOWN ISSUE

- The complete original baseline schema and remote `auth`/RLS state were not read directly during this documentation pass. Do not assume a policy exists remotely merely because a later migration refers to it.
- The remote migration history, applied cron configuration, realtime publication membership, and storage bucket configuration are unverified.
- RLS names/details can differ by migration version. Before modifying a policy, inspect the actual target database with an authorized read-only query and compare it to the migration chain.

## PLANNED

The local driver migration is intended to introduce task assignment, acceptance, verification/events/issues, and task-scoped live location. It requires a reviewed production rollout; see `docs/WORKFLOW.md`. It is not currently verified as part of the deployed data model.

## DO NOT CHANGE WITHOUT REVIEW

- RLS policies, grants, `SECURITY DEFINER` functions, storage policies, and realtime publication membership.
- Versioned order/payment RPC signatures and status enum-like values.
- Accounting triggers/events/journal immutability, receipt/refund paths, or their audit trail.
- The LINE outbox tables and worker claim/retry semantics.
- GPS location visibility and retention data. A performance shortcut must not expose another customer’s address or driver location.
