# Zoid Bank finance companion

Zoid Bank is a local-first personal finance companion for the Mac Mini.

The dashboard can now read incoming Bank Al Ahly and Banque Misr alerts from the local Apple Messages database through a read-only macOS helper.

No message is sent, marked as read, edited, deleted, or uploaded.

## Run the dashboard

From this folder, run:

`bash
npm run start
`

Then open [http://127.0.0.1:4173/?variant=settings](http://127.0.0.1:4173/?variant=settings).

## Run the local production package

Build and serve the compiled dashboard with:

`npm run prod`

The production server listens on `127.0.0.1:4173` and exposes a local `/health` endpoint.
The dashboard still uses the separate Messages bridge on `127.0.0.1:4317`.

To keep the compiled dashboard running after Mac Mini login, run `npm run dashboard:install`.
It serves the production package at [http://127.0.0.1:4180/?variant=overview](http://127.0.0.1:4180/?variant=overview).
Use `npm run dashboard:uninstall` to remove that service.

## Build the native macOS app

Run `npm run macos:build` to create `.harbor/macos-build/Zoid Bank.app`.
The native window contains the compiled Zoid Bank dashboard and a native local-source status bar.
The app reads the dashboard from its own bundle and uses the separate read-only Messages bridge on `127.0.0.1:4317`.

For the first local test, run `npm run messages:install` once, then run `npm run macos:open`.
The app is currently an unsigned local build, so it is intended for this Mac Mini test phase rather than public distribution.

For an always-on Mac Mini bridge, run `npm run messages:install` once from this project.
It installs a per-user macOS LaunchAgent that starts the read-only bridge at login and restarts it if it exits.
Use `npm run messages:uninstall` to remove that agent.

## Run the local Messages bridge

In a second terminal, run:

`bash
npm run messages:bridge
`

The bridge listens only on `127.0.0.1:4317`.

Open Settings and select `Scan Mac Messages`.

The first scan reads the approved sender profiles and stores only structured ledger events and redacted review previews in the browser's local prototype storage.

## Approved source profiles

- Bank Al Ahly: `BanK-AlAhly` and `Bank-AlAhly`.
- Banque Misr: `Banque Misr`.

Only validated transaction patterns are eligible for automatic approval.

OTP messages, account notices, maintenance notices, and other non-transaction alerts are ignored.

Ambiguous financial alerts are routed to Review Queue.

## Recurring projection

The Recurring view derives observations only from approved debit events in the local Messages ledger.

Merchant names are normalized for grouping, while cadence, amount tolerance, evidence count, and status are calculated locally.

Signals are observations rather than scheduled payments, and the dashboard never executes a payment.

In Transactions, an approved imported debit can be converted through Make recurring into a separate manual local rule.

Manual rules do not add evidence, change bank totals, sync to the cloud, or execute payments.

## Safety boundary

The macOS helper opens `~/Library/Messages/chat.db` read-only.

The helper does not write to the Messages database.

The bridge has no cloud endpoint and binds only to the local machine.

The source parser records sender profile, parser version, direction, amount, date, category, and an audit decision.

## Verify the implementation

`bash
npm test
npm run build
`

The Swift source helper is built into the ignored `.harbor/` folder by `npm run messages:build`.
