# open-center-os

**100% Free & Open-Source (MIT)** multi-branch operations server (`node:sqlite` on Node >= 24) and trilingual operations UI (`BI Analytics`, `Weekly Timetable & Teacher Roster`, `Multi-Item POS Cart`, `Student & CRM Lead Pipeline`, `ISO QR Pass & Parent Portal`, `Unlimited Free Multi-Branch`) for learning centers, tutoring studios, and appointment-based service businesses.

```
+-----------------------------------------------------------------------------+
|                        open-center-os v2.2 Architecture                      |
+-----------------------------------------------------------------------------+
|  Web App Shell (server/public) ---> Node 24 HTTP + node:sqlite (server/src)  |
|  - Cookie / Bearer Admin Auth       - HMAC-SHA256 Sessions + Strict CORS     |
|  - BI Analytics & Bar Chart         - CRM Leads (Inquiry -> Trial -> Convert)|
|  - Weekly Timetable & Roster        - Roster Check-In (Present/Absent/Makeup)|
|  - Multi-Item POS Cart & Print      - Mark Paid / Void / Refund & INV-No     |
|  - Unlimited Multi-Branch (MIT)     - qrcode-generator ISO SVG + Portal      |
+-----------------------------------------------------------------------------+
```

## Security & Authentication Model

- **Session / Bearer Admin Auth:** Mutating and PII routes (`/api/branches`, `/api/students`, `/api/leads`, `/api/invoices`, `/api/pos/checkout`, `/api/schedule`, `/api/checkin`, `/api/analytics`) require an authenticated admin session (`POST /api/auth/login` issuing an `HttpOnly; SameSite=Lax` HMAC-SHA256 cookie and Bearer token; unauthenticated calls return `401`).
- **Auto-Generated Per-Instance Password:** Set `OPENCENTER_ADMIN_PASSWORD` in production (or `--admin-password`). When unset, a random CSPRNG password is generated at startup and logged once.
- **Locked CORS:** Wildcard `Access-Control-Allow-Origin: *` is disabled. Cross-origin access is permitted only for loopback same-origin requests or origins explicitly listed in `OPENCENTER_ALLOWED_ORIGINS`.
- **Public Read-Only Endpoints:** `/api/health`, `/api/config`, `/api/auth/me`, `/api/portal/:passCode` (masked contact + credit balance only), and `/api/pass/:passCode.svg`.

## Quickstart (`MIT` Free Forever)

```bash
git clone https://github.com/apexhive-hq/open-center-os.git
cd open-center-os/server
pnpm install --ignore-scripts
pnpm run build
OPENCENTER_ADMIN_PASSWORD="change-me-local" node dist/src/cli.js serve --seed --port 3800 --data-dir ./data
```

Open `http://127.0.0.1:3800/` and sign in with your admin password.

Run the integration test suite:

```bash
cd open-center-os/server && pnpm test
```

---

If `open-center-os` helped your center or studio, Base USDC tips are welcome at `0x32eceaC45DBED9E555dAb80346aBd4Ab9C676206`. Support: `apexhive.hq@proton.me`.
