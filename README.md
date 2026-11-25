# open-center-os

Open-source MIT full-suite operations server (`node:sqlite` on Node >= 24) and multi-view SaaS App Shell (`BI Analytics`, `Weekly Timetable & Teacher Roster`, `Multi-Item Touch POS Cart`, `Student & CRM Lead Pipeline`, `ISO QR Pass & Parent Portal`, `Multi-Branch Licensing`) for learning centers, tutoring studios, and appointment-based service businesses.

Single-branch deployments run unrestricted under the MIT license at `$0` forever with zero native C++ addons.

```
+-----------------------------------------------------------------------------+
|                        open-center-os v2.1 Architecture                      |
+-----------------------------------------------------------------------------+
|  6-View App Shell (UI)     --->  Node 24 HTTP + node:sqlite Server (server/) |
|  - BI Analytics & Bar Chart      - CRM Leads (Inquiry -> Trial -> Convert)   |
|  - Weekly Timetable & Roster     - Roster Check-In (Present/Absent/Makeup)   |
|  - Multi-Item POS Cart & Print   - Mark Paid / Void / Refund & INV-YYYYMMDD  |
|  - Student Directory & Ledger    - Edit Student, Credit Audit & Catalog      |
|  - Camera-Scannable ISO QR Pass  - qrcode-generator ISO SVG + Parent Portal  |
|  - 100% Trilingual (繁/简/EN)    - 1 ($0) -> 2-3 ($499) -> 4+ ($999) Gate    |
+-----------------------------------------------------------------------------+
```

## Features

- **Pure Node >= 24 + Built-In `node:sqlite`**: Zero `better-sqlite3` or native compiler toolchain required. Serves the embedded web UI directly at `/` (`node dist/src/cli.js serve --seed`).
- **CRM Trial Pipeline (`查詢 -> 預約試堂 -> 一鍵轉正`)**: Track walk-in/social inquiries through trial booking and convert directly into enrolled student records (`POST /api/leads/:id/convert`).
- **Weekly Timetable & Teacher Roster Check-In**: Add/edit/delete slots, attach student passes (`POST /api/schedule/:id/enroll`), and mark `Present (-1)`, `Absent (0)`, or `Makeup (+1)` atomically in `credit_ledger`.
- **Multi-Item Touch POS Cart & Bilingual Invoices**: Create custom courses or books/materials (`POST /api/catalog`), mix items with fixed or `%` discounts (`POST /api/pos/checkout`), `Mark Paid` / `Void` / `Refund` invoices with automatic unused-credit reversal, print receipts, and export sanitized RFC 4180 CSV ledgers.
- **Real ISO Scannable QR Pass (`qrcode-generator`) & Parent Portal**: Deterministic ISO/IEC 18004 SVG passes (`GET /api/pass/:passCode.svg`) paired with read-only client/parent portal lookup (`GET /api/portal/:passCode`).

## Quickstart (Local MIT Server)

```bash
git clone https://github.com/apexhive-hq/open-center-os.git
cd open-center-os/server
pnpm install --ignore-scripts
pnpm run sync:ui
pnpm run build
node dist/src/cli.js serve --seed --port 3800 --data-dir ./data
```

Open `http://127.0.0.1:3800/` to run the full local SQLite-backed application.

Run the integration test suites:

```bash
cd open-center-os/server && pnpm test
cd open-center-os/storefront && pnpm test
```

## Open-Core Licensing Model

- **Single-Branch MIT (`0 USDC` Forever)**: `1` active branch with unlimited students, CRM leads, timetable slots, multi-item POS invoices, ISO QR passes, check-ins, and CSV exports.
- **Voluntary Community Donations (`15 USDC` / `49 USDC`)**: Optional supporter (`15 USDC`) or patron (`49 USDC`) donation with an Ed25519 supporter token.
- **Growth Multi-Branch Team (`499 USDC` Lifetime)**: Unlocks **up to `3` branches** (`maxBranches: 3`) via offline Ed25519 verification (`node dist/src/cli.js activate --token "<token>"`).
- **Enterprise Unlimited Chain (`999 USDC` Lifetime)**: Unlocks **unlimited (`4+`) branches** (`maxBranches: null`) and chain-wide commercial rights.

## License & Commercial Support

Licensed under the [MIT License](LICENSE).
For multi-branch commercial support or questions, contact `apexhive.hq@proton.me`.
