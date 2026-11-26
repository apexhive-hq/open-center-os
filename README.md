# open-center-os

**100% Free MIT Multi-Branch SME & Education ERP** — self-hosted operations server (`node:sqlite` on Node >= 24) and trilingual UI (EN/繁中/簡中) with bilingual EN/ZH receipts (`BI Analytics`, `Weekly Timetable & Teacher Roster`, `Multi-Item POS Cart`, `Student & CRM Lead Pipeline`, `ISO QR Pass & Parent Portal`, `Unlimited Free Multi-Branch`) for learning centers, tutoring studios, and appointment-based service businesses.

```
+-----------------------------------------------------------------------------+
|                        open-center-os v2.2 Architecture                      |
+-----------------------------------------------------------------------------+
|  Web App Shell (server/public) ---> Node 24 HTTP + node:sqlite (server/src)  |
|  - scrypt + SQLite Session Auth     - Login Rate Limit + Strict CORS        |
|  - BI Analytics & Bar Chart         - CRM Leads (Inquiry -> Trial -> Convert)|
|  - Weekly Timetable & Roster        - Roster Check-In (Present/Absent/Makeup)|
|  - Multi-Item POS Cart & Print      - Mark Paid / Void / Refund & INV-No     |
|  - Unlimited Multi-Branch (MIT)     - qrcode-generator ISO SVG + Portal      |
+-----------------------------------------------------------------------------+
```

## Security & Authentication Model

- **Session / Bearer Admin Auth:** Mutating and PII routes (`/api/branches`, `/api/students`, `/api/leads`, `/api/invoices`, `/api/pos/checkout`, `/api/schedule`, `/api/checkin`, `/api/analytics`) require an authenticated admin session (`POST /api/auth/login` issuing an `HttpOnly; SameSite=Lax` HMAC-SHA256 cookie and Bearer token backed by a SQLite `sessions` store). `POST /api/auth/logout` revokes the session token server-side.
- **scrypt Password Storage & Login Lockout:** Admin credentials are stored as per-user salted `crypto.scrypt` hashes with timing-safe verification, and `POST /api/auth/login` enforces per-IP + username lockout backoff (`429`) on repeated failures.
- **Auto-Generated Per-Instance Password:** Set `OPENCENTER_ADMIN_PASSWORD` in production (or `--admin-password`). When unset, a random CSPRNG password is generated at startup and logged once.
- **Trusted Proxy Opt-In:** `x-forwarded-proto` and `x-forwarded-for` are only honored when `TRUST_PROXY=true` is explicitly configured.
- **Locked CORS:** Wildcard `Access-Control-Allow-Origin: *` is disabled. Same-origin requests matching `Host` and protocol (honoring `x-forwarded-proto` only when `TRUST_PROXY=true`) are permitted; cross-origin access is permitted only for origins explicitly listed in `OPENCENTER_ALLOWED_ORIGINS`.
- **Public Read-Only Endpoints:** `/api/health`, `/api/config`, `/api/auth/me`, `/api/portal/:passCode` (rate-limited; masked contact + credit balance only), and `/api/pass/:passCode.svg` (rendered strictly from authentic database pass records with 128-bit `passCode` entropy).

## Quickstart (`MIT` Free Forever)

Requires **Node >= 24.0.0** (uses built-in unflagged `node:sqlite`; matches `engines.node` in `server/package.json` and `node:24-slim` in `Dockerfile`).

```bash
git clone https://github.com/apexhive-hq/open-center-os.git
cd open-center-os/server
pnpm install --ignore-scripts
pnpm run build
OPENCENTER_ADMIN_PASSWORD="change-me-local" node dist/src/cli.js serve --seed --port 3800 --data-dir ./data
```

### Docker (Durable Volume, Opt-In Demo Seeding)

```bash
docker build -t open-center-os .
docker run -d -p 3800:3800 \
  -e OPENCENTER_ADMIN_PASSWORD="change-me-prod" \
  -v open-center-data:/app/data \
  open-center-os
```

Set `-e DEV_SEED=true` only in development if you want demo branches/students seeded when the database has zero branches.

Open `http://127.0.0.1:3800/` and sign in with your admin password.

Run the integration test suite:

```bash
cd open-center-os/server && pnpm test
```

---

License: [MIT](LICENSE) · Support: `apexhive.hq@proton.me`.
