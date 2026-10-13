# Multi-Tenant + Optional Multi-Branch (Platinum) — Implementation Plan

Status: **DRAFT FOR REVIEW — nothing below has been applied.**
Branch: `feature/multi-tenant-architecture-support`

## 0. Decisions needed before starting

| # | Question | Recommendation |
|---|----------|----------------|
| 1 | Plan for the existing company after migration | `platinum` (keeps all options open; downgrade is safe) |
| 2 | Chart of accounts | One per tenant; branch reporting via `transactions.branch_id` |
| 3 | Email uniqueness | Keep globally unique (login needs no tenant picker) |
| 4 | Who changes a tenant's plan | `super_admin` flips `tenants.plan` manually; no billing integration |
| 5 | Dealer sub-accounts (`users` double as ledger accounts) | Dealers stay tenant-scoped; branch via `user_branches` |

## 1. Backup protocol (runs BEFORE any edit — Phase 0)

Three independent layers; none is skipped.

1. **Git safety net**
   - Commit or stash current work (`neon_backup.dump` is untracked — leave it untracked, add to `.gitignore`).
   - `git tag pre-multitenant-2026-10-12` on the current commit.
2. **Per-file copies** of every file in §3 into `backups/pre-multitenant/` preserving relative paths
   (e.g. `backups/pre-multitenant/server/routes/deals.js`). One script, `backup-affected-files.js`, reads the §3 list,
   copies each file, writes a `MANIFEST.txt` with SHA-256 per file, and refuses to overwrite an existing backup.
   `backups/` is added to `.gitignore`. Restore = copy back; verify against the manifest.
3. **Database backup**
   - Live DB: `pg_dump -Fc "$DATABASE_URL" -f backups/pre-multitenant/live-<timestamp>.dump`.
   - Verify by restoring into a throwaway database and comparing row counts for every table.
   - All migration rehearsals run against that restored copy, never against live.

Gate: manifest verified + restore test passes → proceed.

## 2. Target design (summary)

- `tenants(id, name, slug UNIQUE, plan CHECK IN ('basic','pro','platinum'), status, created_at)`
- `branches(id, tenant_id, name, is_default, is_active)`; `UNIQUE(tenant_id,name)`; partial unique index → one default per tenant.
- `users.tenant_id` (NULL only for `super_admin`); `user_branches(user_id, branch_id)`.
- Tenant context comes only from the JWT (`tenant_id`); branch from `X-Branch-Id`, validated against `user_branches`.
  Non-Platinum tenants always resolve to the default branch.
- Isolation: app-level `tenant_id`/`branch_id` filters + Postgres RLS (`SET LOCAL app.tenant_id`) as a fail-closed net.
- Entitlement: `assertMultiBranch(tenantId)` inside the service function that creates/activates a branch (not only the route).
- Downgrade: extra branches become read-only; no data deleted or merged.

### Table classification

| Class | Columns added | Tables |
|---|---|---|
| New | — | `tenants`, `branches`, `user_branches`, `audit_log` |
| Tenant-only | `tenant_id` | `users`, `agencies`, `investors`, `accounts`, `app_settings`, `balance_projects`, `dealer_exchanges`, `agreements` |
| Tenant + branch | `tenant_id`, `branch_id` | `customers`, `inventory`, `deals`, `payments`, `leads`, `transactions`, `slips`, `inventory_payments`, `inventory_requests`, `deal_adjustments` |
| Child (tenant only, inherits branch via parent) | `tenant_id` | `inventory_plots`, `inventory_plot_assignments`, `deal_plots`, `lead_status_updates`, `transaction_lines` |

(Re-verify against `information_schema.tables` in Phase 1 — `dbInit.js` has ~30 later `ALTER TABLE ADD COLUMN`s.)

### Unique-constraint changes

| Current | New |
|---|---|
| `users.email` UNIQUE | unchanged (global) |
| `customers.cnic` UNIQUE | `UNIQUE(tenant_id, cnic)` |
| `app_settings.setting_key` PK | `PRIMARY KEY(tenant_id, setting_key)` |
| `slips(source_type, source_id)` partial | add `tenant_id` (also update `ON CONFLICT` in `slips.js:99,123`) |
| `accounts` fixed ids 1–9 (`ON CONFLICT (id)`) | add `accounts.code` (`CASH`,`AR`,…); `UNIQUE(tenant_id, code)`; code resolves id per tenant |
| `inventory_plots(inventory_id, plot_number)`, `deal_plots(deal_id, plot_id)` | unchanged (scoped through parent) + `tenant_id` column |

## 3. Files affected (this is the backup list)

### Server — core / config
| File | Change |
|---|---|
| `server/config/dbInit.js` | Fresh-install schema gets new tables/columns; seeding (admin, chart of accounts, settings) moves into `createTenant()` |
| `server/config/database.js` | Add `withTenant(req, fn)` helper: checkout client, `BEGIN`, `SET LOCAL app.tenant_id`, run, `COMMIT` |
| `server/index.js` | Mount `tenantContext` after `auth`; add `/api/branches`, `/api/tenants` routes; authenticated uploads route |
| `server/middleware/auth.js` | JWT carries `tenant_id`; add `superAdminOnly`; export `tenantContext` (or new `middleware/tenant.js`) |
| `server/services/ledgerService.js` | Take `tenantId` explicitly; replace hard-coded account ids with `accMap(tenantId)` |

### Server — routes (each: scope every query, set scope on every INSERT, tenant-scope `users` lookups)
| File | Tables touched |
|---|---|
| `server/routes/auth.js` | users (login puts `tenant_id` in JWT; `/register` scoped to caller's tenant) |
| `server/routes/dealers.js` | users |
| `server/routes/employees.js` | users |
| `server/routes/agencies.js` | agencies |
| `server/routes/agreements.js` | agreements |
| `server/routes/customers.js` | customers, users |
| `server/routes/deals.js` | deals, deal_plots, payments, agreements, agencies, customers, inventory, inventory_plots, users |
| `server/routes/payments.js` | payments, deals, customers |
| `server/routes/inventory.js` | inventory, inventory_plots, inventory_payments, investors, deals, deal_plots, payments, customers, balance_projects, users |
| `server/routes/inventoryPayments.js` | inventory_payments, inventory, inventory_plots, investors, users |
| `server/routes/inventoryRequests.js` | inventory_requests, inventory_plot_assignments, inventory, inventory_plots, users |
| `server/routes/investors.js` | investors |
| `server/routes/leads.js` | leads, lead_status_updates, customers, users |
| `server/routes/finance.js` | accounts, transactions, transaction_lines, app_settings, agencies, balance_projects, customers, deals, users |
| `server/routes/ledger.js` | accounts, transactions, transaction_lines |
| `server/routes/balanceTransactions.js` | accounts, transactions, transaction_lines, deal_adjustments, deals, deal_plots, inventory_plots, customers, balance_projects, users |
| `server/routes/balanceProjects.js` | balance_projects, transaction_lines, users |
| `server/routes/dealerExchanges.js` | dealer_exchanges, accounts, transactions, transaction_lines, users |
| `server/routes/settings.js` | app_settings |
| `server/routes/slips.js` | slips, deals, deal_plots, deal_adjustments, payments, transactions, customers, agencies, app_settings, inventory_plots, users |

### Server — new files (no backup needed)
`server/routes/branches.js`, `server/routes/tenants.js`, `server/services/tenantService.js` (`createTenant`, `assertMultiBranch`, `resolveBranch`),
`migrate-multi-tenant.js`, `backup-affected-files.js`, `server/tests/*.test.js`.

### Root scripts (hard-code table/account assumptions; need `--tenant` or default-tenant handling)
`server/scripts/reimport_union_town.js`, `server/scripts/cleanup_live_duplicates.js`, `server/scripts/verify_live_import.js`,
`migrate-live.js`, `import-certificates.js`, `import-nt-certificate-finance.js`, `migrate-excel-accounting.js`, `cleanup-all.js`,
`cleanup-transactions.js`, `delete-garbage-users.js`, `setup.js`.
`scratch_*.js`, `test_*.js`, `verify-schema.js`, `fix-db-schema.js` and the historical `migrate-*.js` / `add-*.sql` are one-off / already applied → **not modified** (marked legacy in a README note).

### Client
| File | Change |
|---|---|
| `client/src/services/api.js` | Send `X-Branch-Id` from stored selection |
| `client/src/context/AuthContext.js` | Hold `tenant`, `plan`, `branches`, `currentBranch` |
| `client/src/components/Layout.js` (+ `.css`) | Branch switcher (Platinum only); Branches nav item |
| `client/src/App.js` | Route for new Branches page |
| `client/src/pages/Login.js` | Receive tenant/plan/branches from login response (likely no visible change) |
| `client/src/pages/Dealers.js`, `Employees.js` | Branch assignment for Platinum |
| New: `client/src/pages/Branches.js` (+ `.css`) | Branch CRUD, user assignment; shows upgrade message if not Platinum |

Other pages need no change: they call the API and the backend scopes everything.

## 4. Phases (each is independently mergeable; each ends with a gate)

### Phase 0 — Backup (§1)
Gate: tag exists, manifest verified, DB restore test passes.

### Phase 1 — Schema + migration (no behaviour change)
1. Write `migrate-multi-tenant.js`: idempotent, single transaction, config-driven (table arrays from §2).
2. Steps: create `tenants`/`branches`/`user_branches` → insert default tenant + default branch → per table `ADD COLUMN IF NOT EXISTS`, backfill constant, `SET NOT NULL`, index, FK → unique-constraint swaps → `accounts.code` backfill for ids 1–9 and the 4 parent accounts.
3. Guard query (every public table except `tenants` has `tenant_id`) must return 0 rows.
4. Mirror schema in `dbInit.js` for fresh installs; move seeding into `createTenant()`.
Gate: run on the restored dump copy; per-table row counts identical; ledger trial balance identical before/after; app still runs unchanged.

### Phase 2 — Tenant context + route isolation
1. JWT `tenant_id`, `tenantContext` middleware, `withTenant` helper.
2. `ledgerService` + account-code refactor first, then routes in this order: ledger/finance → customers/inventory → deals/payments → leads → investors/inventoryPayments/inventoryRequests/dealerExchanges → slips/settings/balanceProjects/balanceTransactions/agencies/agreements → auth/dealers/employees.
3. Per route: scope SELECT/UPDATE/DELETE (including both sides of every JOIN), set scope on INSERT from `req`, never from body; cross-tenant id → 404.
4. Tests written alongside (§5).
Gate: isolation tests green; single-tenant smoke test (deal → payment → ledger) matches pre-migration results.

### Phase 3 — Branches + Platinum gate
1. `user_branches`, branch scoping on branch tables, `resolveBranch`.
2. `/api/branches` CRUD with `assertMultiBranch` in the service; default branch undeletable; branches with data deactivate-only.
3. Downgrade behaviour (extra branches read-only; creation/assignment blocked).
Gate: plan-gating + branch-access tests green.

### Phase 4 — RLS, uploads, client, audit
1. Enable RLS policies on all tenant tables (after Phase 2 verified); app DB role must not be a superuser/owner-bypass.
2. Uploads to `uploads/<tenant_id>/…`; replace `express.static('/uploads')` with authenticated route. Move existing proofs into the default tenant folder and update stored paths.
3. Client changes (§3). 4. `audit_log` for branch create/deactivate, plan change, user-branch grant/revoke; add tenant/branch/user to log lines.
Gate: RLS test (deliberately unscoped query returns nothing for other tenant); manual UI check on mobile + desktop.

### Phase 5 — Production rollout
Fresh backup → maintenance window → run migration → run guard + count checks → smoke test → enable RLS → keep backups 30 days.

## 5. Tests (`node --test` + `supertest`, throwaway Postgres schema; no Jest)

- **Tenant isolation:** tenants A/B; for every route family B cannot read/update/delete A's rows; forged `tenant_id` in body ignored; unscoped query blocked by RLS.
- **Branch isolation/access:** user on branch X cannot see Y; forged `X-Branch-Id` → 403; admin sees all.
- **Plan gating:** non-Platinum create-branch → 403 `PLAN_REQUIRED` (API); Platinum succeeds; downgrade keeps data, blocks writes to extra branches and new assignments.
- **Uniqueness:** same CNIC allowed across tenants, rejected within one.
- **Migration:** counts + ledger balances before/after on restored dump.
- **Schema guard:** every table has `tenant_id` (fails CI on future tables that forget it).
- **Regression:** existing flows as the migrated tenant.

## 6. Rollback

| Failure point | Action |
|---|---|
| Code bug in a phase | `git revert` the phase commits, or restore files from `backups/pre-multitenant/` using the manifest |
| Migration fails | It is one transaction — automatic rollback; nothing changed |
| Migration succeeded but app is wrong | Restore DB from the pre-migration dump + restore files from the tag |

## 7. Risks to watch

- Hard-coded account ids (1–9) across routes — grep every numeric account reference before the refactor; missing one silently posts to the wrong tenant's account.
- Unscoped JOINs against `users` (14 files) — dealer lookups can leak another tenant's users.
- Multi-statement transactions (`BEGIN`) in ~30 places must run on the same RLS-configured client.
- `ON CONFLICT` clauses must match the new unique indexes or they will error at runtime.
- JWTs already issued (7-day expiry) lack `tenant_id` — force re-login after deploy.

## 8. Not included (YAGNI, add when needed)

Subdomain tenant routing, separate `features`/`subscriptions` tables, billing integration, per-tenant database/schema, branch merge tool.

---

## Implementation status (2026-10-13) — implemented, NOT committed or pushed

Rollback: `backups/pre-multitenant/` (44 files + `MANIFEST.txt`), git tag `pre-multitenant-2026-10-13`, and `neon_backup.dump`.

**Deviations from the plan above**
- **Isolation is done in the database, not by editing ~330 queries.** Each request runs on a connection switched to the non-owner role `crm_app`, with `app.*` settings the RLS policies read; `tenant_id`/`branch_id` columns default from that context. Routes are unchanged apart from the few listed below. Code: `server/config/database.js`, `server/config/multiTenant.js`.
- **Standard accounts (ids 1–9 + the 4 parent accounts) are shared by all tenants** (`accounts.tenant_id IS NULL`); only per-tenant sub-accounts (loans/investments) are private. This keeps every hard-coded account id (client and server) valid, so no `accMap` refactor was needed.
- **Strict mode** (`DB_STRICT=1`, set in `server/index.js`): a `db.query` with no tenant context is rejected. Boot, login and tenant admin use `db.admin` (owner) explicitly. One-off scripts are not strict and default to the first tenant (`TENANT_ID` env overrides).
- Branch-scoped tables include the child tables (plots, transaction lines, …) so ledger sums respect branches. Tenant-wide: users, agencies, investors, app_settings, balance_projects, dealer_exchanges, agreements.
- No separate uploads change: proofs are uploaded from memory (multer memoryStorage), not stored in a shared local folder.
- The migration runs on every boot from `dbInit` (idempotent) instead of a separate script.
- Branch assignment lives on the new Branches page, not on Dealers/Employees.

**Files changed**: `server/config/{database,dbInit}.js`, `server/index.js`, `server/middleware/auth.js`, `server/routes/{auth,dealers,settings,slips,finance,balanceTransactions,dealerExchanges,leads}.js`, `client/src/{App.js,services/api.js,context/AuthContext.js,components/Layout.js}`, `package.json` (test script).
**New**: `server/config/multiTenant.js`, `server/services/tenantService.js`, `server/routes/{branches,tenants}.js`, `server/scripts/create_super_admin.js`, `server/tests/*`, `client/src/pages/Branches.js`, `backup-affected-files.js`.

**Verified** (throwaway Postgres 18 on port 5544, restored from `neon_backup.dump`): migration is idempotent; row counts, per-account ledger totals and account ids identical before/after; `npm test` 17/17 (6 pure + 11 DB); real server booted and exercised over HTTP (two tenants, plan gating, branch header, multipart ledger write); client builds.
**Not verified**: the migration on Neon itself (the `crm_app` role must be creatable and `SET ROLE`-able — otherwise boot stops with a clear error; `ALLOW_NO_RLS=true` is a single-tenant-only escape hatch); the new UI in a browser.
**Operating notes**: existing company becomes tenant `default` on plan `platinum` (set `DEFAULT_TENANT_PLAN=basic` before the first boot to change). Create the first platform admin with `node server/scripts/create_super_admin.js <email> <password>`, then use `POST /api/tenants`. There is no super_admin UI.
