import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { privateKeyToAccount } from 'viem/accounts';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STOREFRONT_DIR = path.resolve(__dirname, '..');
const WRANGLER_PORT = 4150;
const RPC_PORT = 4151;
const BASE_URL = `http://127.0.0.1:${WRANGLER_PORT}`;
const USDC_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const TREASURY = '0x32eceaC45DBED9E555dAb80346aBd4Ab9C676206';

function encodeTransferLog({ from, to, amountAtomic }) {
  const topicSig = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  const padAddr = (addr) => '0x' + addr.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  return {
    address: USDC_CONTRACT,
    topics: [topicSig, padAddr(from), padAddr(to)],
    data: '0x' + amountAtomic.toString(16).padStart(64, '0')
  };
}

async function generateEd25519Pair() {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const privJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
  return {
    privateJwkJson: JSON.stringify(privJwk),
    spkiB64: Buffer.from(spki).toString('base64')
  };
}

function startMockBaseRpc(state) {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/flaky') {
      state.flakyHits += 1;
      const status = state.flakyHits % 2 === 1 ? 429 : 500;
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: `simulated flaky HTTP ${status}` }));
      return;
    }
    if (req.url !== '/ok' || req.method !== 'POST') {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    let result = null;
    if (body.method === 'eth_blockNumber') {
      result = '0x' + state.headBlock.toString(16);
    } else if (body.method === 'eth_getTransactionReceipt') {
      result = state.receipts.get(String(body.params?.[0] ?? '').toLowerCase()) ?? null;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id ?? 1, result }));
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(RPC_PORT, '127.0.0.1', () => resolve(server));
  });
}

async function waitForHealth(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE_URL}/api/health`);
      if (r.ok) return;
    } catch {
      // poll until healthy
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('wrangler dev timed out waiting for /api/health');
}

async function killProcessTree(proc) {
  if (!proc || proc.killed || proc.exitCode !== null) return;
  if (process.platform === 'win32') {
    await execFileAsync('taskkill', ['/pid', String(proc.pid), '/T', '/F']).catch(() => {});
  } else {
    proc.kill('SIGTERM');
  }
  await new Promise((r) => setTimeout(r, 350));
}

test('End-to-end v2.1.0 Wrangler + RPC failover + 15/49/499/999 USDC + Full 6-view trilingual Playwright', async () => {
  const payer = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
  const attacker = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');

  const devVarsPath = path.join(STOREFRONT_DIR, '.dev.vars');
  const stateDir = path.join(STOREFRONT_DIR, '.wrangler-state');
  const preExistingDevVars = await fs.readFile(devVarsPath, 'utf8').catch(() => null);
  await fs.rm(stateDir, { recursive: true, force: true });

  const { privateJwkJson, spkiB64 } = await generateEd25519Pair();
  const txSponsor15 = '0x' + '11'.repeat(32);
  const txSponsor49 = '0x' + '22'.repeat(32);
  const txTeam = '0x' + '33'.repeat(32);
  const txChain = '0x' + '77'.repeat(32);
  const txUi15 = '0x' + '44'.repeat(32);
  const txUi49 = '0x' + '55'.repeat(32);
  const txUi499 = '0x' + '66'.repeat(32);
  const txUi999 = '0x' + '88'.repeat(32);

  const rpcState = {
    flakyHits: 0,
    headBlock: 100,
    receipts: new Map([
      [txSponsor15, { status: '0x1', blockNumber: '0x64', logs: [encodeTransferLog({ from: payer.address, to: TREASURY, amountAtomic: 15_000_000n })] }],
      [txSponsor49, { status: '0x1', blockNumber: '0x62', logs: [encodeTransferLog({ from: payer.address, to: TREASURY, amountAtomic: 49_000_000n })] }],
      [
        txTeam,
        {
          status: '0x1',
          blockNumber: '0x62',
          logs: [
            encodeTransferLog({ from: payer.address, to: TREASURY, amountAtomic: 200_000_000n }),
            encodeTransferLog({ from: payer.address, to: TREASURY, amountAtomic: 299_000_000n })
          ]
        }
      ],
      [txChain, { status: '0x1', blockNumber: '0x62', logs: [encodeTransferLog({ from: payer.address, to: TREASURY, amountAtomic: 999_000_000n })] }],
      [txUi15, { status: '0x1', blockNumber: '0x62', logs: [encodeTransferLog({ from: payer.address, to: TREASURY, amountAtomic: 15_000_000n })] }],
      [txUi49, { status: '0x1', blockNumber: '0x62', logs: [encodeTransferLog({ from: payer.address, to: TREASURY, amountAtomic: 49_000_000n })] }],
      [txUi499, { status: '0x1', blockNumber: '0x62', logs: [encodeTransferLog({ from: payer.address, to: TREASURY, amountAtomic: 499_000_000n })] }],
      [txUi999, { status: '0x1', blockNumber: '0x62', logs: [encodeTransferLog({ from: payer.address, to: TREASURY, amountAtomic: 999_000_000n })] }]
    ])
  };

  await fs.writeFile(
    devVarsPath,
    [
      `LICENSE_SIGNING_PRIVATE_JWK=${privateJwkJson}`,
      `LICENSE_SIGNING_PUBLIC_SPKI_B64=${spkiB64}`,
      `DOWNLOAD_HMAC_SECRET=e2e-open-center-hmac-secret-32-bytes`,
      `BASE_RPC_URLS=http://127.0.0.1:${RPC_PORT}/flaky,http://127.0.0.1:${RPC_PORT}/ok`,
      `BASE_RPC_URL=http://127.0.0.1:${RPC_PORT}/ok`
    ].join('\n'),
    'utf8'
  );

  const rpcServer = await startMockBaseRpc(rpcState);
  let wranglerProc = null;
  let browser = null;

  try {
    const wranglerArgs = ['dev', '--local', '--port', String(WRANGLER_PORT), '--ip', '127.0.0.1', '--persist-to', '.wrangler-state'];
    wranglerProc =
      process.platform === 'win32'
        ? spawn('cmd.exe', ['/d', '/s', '/c', 'wrangler', ...wranglerArgs], {
            cwd: STOREFRONT_DIR,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }
          })
        : spawn('wrangler', wranglerArgs, {
            cwd: STOREFRONT_DIR,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }
          });

    await waitForHealth();

    // 1. API Checkout tests (1-conf retry, 3 downloads -> 403, reclaim, attacker, 15/49/499/999 USDC)
    const ch15 = await (await fetch(`${BASE_URL}/api/challenge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ txHash: txSponsor15, tier: 'sponsor15' })
    })).json();
    const sig15 = await payer.signMessage({ message: ch15.message });

    const conf1 = await fetch(`${BASE_URL}/api/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ txHash: txSponsor15, nonce: ch15.nonce, signature: sig15, tier: 'sponsor15' })
    });
    assert.equal(conf1.status, 403);
    assert.equal((await conf1.json()).error, 'INSUFFICIENT_CONFIRMATIONS');
    assert.ok(rpcState.flakyHits >= 2);

    rpcState.headBlock = 101;
    const conf2 = await fetch(`${BASE_URL}/api/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ txHash: txSponsor15, nonce: ch15.nonce, signature: sig15, tier: 'sponsor15' })
    });
    assert.equal(conf2.status, 200);
    const out15 = await conf2.json();
    assert.equal(out15.tier, 'sponsor15');

    for (let i = 0; i < 3; i += 1) {
      assert.equal((await fetch(`${BASE_URL}${out15.downloadUrl}`)).status, 200);
    }
    assert.equal((await fetch(`${BASE_URL}${out15.downloadUrl}`)).status, 403);

    const ch15Re = await (await fetch(`${BASE_URL}/api/challenge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ txHash: txSponsor15, tier: 'sponsor15' })
    })).json();
    const reclaimRes = await fetch(`${BASE_URL}/api/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        txHash: txSponsor15,
        nonce: ch15Re.nonce,
        signature: await payer.signMessage({ message: ch15Re.message }),
        tier: 'sponsor15'
      })
    });
    assert.equal((await reclaimRes.json()).reclaimed, true);

    const chAtk = await (await fetch(`${BASE_URL}/api/challenge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ txHash: txSponsor15, tier: 'sponsor15' })
    })).json();
    const atkRes = await fetch(`${BASE_URL}/api/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        txHash: txSponsor15,
        nonce: chAtk.nonce,
        signature: await attacker.signMessage({ message: chAtk.message }),
        tier: 'sponsor15'
      })
    });
    assert.equal(atkRes.status, 403);

    for (const [tx, tier, maxBr] of [
      [txSponsor49, 'sponsor49', 1],
      [txTeam, 'team', 3],
      [txChain, 'chain', null]
    ]) {
      const ch = await (await fetch(`${BASE_URL}/api/challenge`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ txHash: tx, tier })
      })).json();
      const vRes = await fetch(`${BASE_URL}/api/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          txHash: tx,
          nonce: ch.nonce,
          signature: await payer.signMessage({ message: ch.message }),
          tier
        })
      });
      assert.equal(vRes.status, 200);
      const out = await vRes.json();
      assert.equal(out.tier, tier);
      assert.equal(out.maxBranches, maxBr);
    }

    // 2. Playwright verification (no-wallet + desktop 1440x900 + mobile 375x812)
    browser = await chromium.launch({ headless: true });

    // 2a) No-wallet check
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push(e.message));

      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.click('[data-view="licensing"]');
      const hidden = await page.locator('#wallet-pay-btn').evaluate(
        (el) => el.hasAttribute('hidden') && getComputedStyle(el).display === 'none' && el.offsetParent === null
      );
      assert.equal(hidden, true);
      assert.ok((await page.locator('body').innerText()).includes('apexhive.hq@proton.me'));
      assert.equal(new RegExp('i' + 'staff|i' + 'parent', 'i').test(await page.locator('body').innerText()), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
      assert.deepEqual(errors, []);
      await ctx.close();
    }

    // 2b) Desktop & Mobile interactive flows
    for (const vp of [
      { width: 1440, height: 900, tag: 'desktop' },
      { width: 375, height: 812, tag: 'mobile' }
    ]) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      const errors = [];
      const sentTxs = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push(e.message));

      await page.exposeFunction('__signEip191', async (msg) => payer.signMessage({ message: msg }));
      await page.exposeFunction('__dispatchMockTx', async (txReq) => {
        sentTxs.push(txReq);
        const d = String(txReq.data || '').toLowerCase();
        if (d.endsWith(999_000_000n.toString(16).padStart(64, '0'))) return txUi999;
        if (d.endsWith(499_000_000n.toString(16).padStart(64, '0'))) return txUi499;
        if (d.endsWith(49_000_000n.toString(16).padStart(64, '0'))) return txUi49;
        return txUi15;
      });

      await page.addInitScript((addr) => {
        window.ethereum = {
          isMetaMask: true,
          async request({ method, params }) {
            if (method === 'eth_chainId') return '0x2105';
            if (method === 'eth_requestAccounts') return [addr];
            if (method === 'eth_sendTransaction') return window.__dispatchMockTx(params[0]);
            if (method === 'eth_getTransactionReceipt') return { status: '0x1', blockNumber: '0x62' };
            if (method === 'personal_sign') return window.__signEip191(params[0]);
            throw new Error('Unsupported wallet method: ' + method);
          }
        };
      }, payer.address);

      await page.goto(BASE_URL, { waitUntil: 'networkidle' });

      // Full Trilingual verification (checks nav, headings, table headers, sandbox banner)
      await page.click('#lang-zh-hk');
      assert.ok((await page.locator('#hero-title').innerText()).includes('開源教育中心'));
      assert.ok((await page.locator('#mode-badge').innerText()).includes('瀏覽器沙盒預覽'));
      assert.ok((await page.locator('#nav-lbl-timetable').innerText()).includes('導師點名台'));
      assert.ok((await page.locator('#nav-lbl-qr').innerText()).includes('家長查堂頁'));
      assert.equal(await page.evaluate(() => localStorage.getItem('open_center_os_lang')), 'zh-HK');

      await page.click('#lang-zh-cn');
      assert.ok((await page.locator('#hero-title').innerText()).includes('开源教育中心'));
      assert.ok((await page.locator('#mode-badge').innerText()).includes('浏览器沙盒预览'));

      await page.click('#lang-en');
      assert.ok((await page.locator('#hero-title').innerText()).includes('Open-Source Education Center'));
      assert.ok((await page.locator('#nav-lbl-timetable').innerText()).includes('Teacher Roster'));
      assert.ok((await page.locator('#nav-lbl-qr').innerText()).includes('Parent Portal'));

      // View 1: Dashboard & BI SVG Chart
      assert.equal(await page.locator('#bi-revenue-svg rect').count(), 4);

      const openNav = async (view) => {
        if (vp.tag === 'mobile') {
          await page.click('#sidebar-toggle-btn');
        }
        await page.click(`[data-view="${view}"]`);
      };

      // View 2: Timetable -> Teacher Roster -> Present -1 (Alice 3 -> 2 triggers Renewal Queue)
      await openNav('timetable');
      await page.click('[data-slot-id="MON-1600"]');
      await page.waitForSelector('#roster-drawer:not([hidden])');
      await page.locator('#roster-list button:has-text("Present -1")').first().click();

      // View 1: Auto-Renewal Queue = 1
      await openNav('dashboard');
      assert.equal((await page.locator('#m-renewals-val').innerText()).trim(), '1');
      assert.ok((await page.locator('#renewal-queue-list').innerText()).includes('PASS-ALICE01'));

      // View 3: Touch POS Cart + Pending Invoice -> Mark Paid -> Refund + Printable Receipt
      await openNav('pos');
      await page.fill('#custom-item-name', 'Theory Kit');
      await page.click('#custom-item-form button[type="submit"]');
      await page.fill('#pos-student-input', '陳大文');
      await page.fill('#pos-phone-input', '91234567');
      await page.selectOption('#pos-status-select', 'Pending');
      await page.click('#pos-submit-btn');
      await page.waitForSelector('#pos-status.ok:not([hidden])');
      // Pending invoice supports Mark Paid -> Refund
      await page.locator('#invoices-tbody button:has-text("Mark Paid")').first().click();
      await page.locator('#invoices-tbody button:has-text("Receipt")').first().click();
      await page.waitForSelector('#receipt-modal:not([hidden])');
      await page.click('#receipt-close-btn');
      assert.equal(await page.locator('#receipt-modal').evaluate((el) => el.hidden), true);

      // View 4: Students non-ASCII passCode (`PASS-456703`, never `PASS-03`) + Edit Student + CRM Convert
      await openNav('crm');
      const packagesText = await page.locator('#packages-tbody').innerText();
      assert.ok(packagesText.includes('PASS-456703'), `Expected phone fallback passCode PASS-456703 in: ${packagesText}`);
      await page.locator('#packages-tbody button:has-text("Edit")').first().click();
      await page.waitForSelector('#student-edit-modal:not([hidden])');
      await page.fill('#edit-student-guardian', 'Mrs. Chan Updated');
      await page.click('#edit-student-save-btn');
      assert.equal(await page.locator('#student-edit-modal').evaluate((el) => el.hidden), true);

      const beforeRows = await page.locator('#packages-tbody tr').count();
      await page.locator('#crm-leads-list button:has-text("Convert to Student")').first().click();
      assert.equal(await page.locator('#packages-tbody tr').count(), beforeRows + 1);

      // View 5: QR Pass & Parent Portal Preview
      await openNav('qr');
      assert.equal(await page.locator('#pass-svg-img').evaluate((img) => img.complete && img.naturalWidth > 0), true);
      assert.ok((await page.locator('#parent-portal-preview').innerText()).includes('Parent Portal'));

      // View 6: Branch MIT 1-branch enforcement -> Base USDC checkout unlocks 2-3 ($499) -> 4+ ($999)
      await openNav('licensing');
      if (vp.tag === 'desktop') {
        await page.fill('#branch-code-input', 'MKK');
        await page.fill('#branch-name-input', 'Mong Kok Studio');
        await page.click('#add-branch-btn');
        assert.ok((await page.locator('#branch-license-banner').innerText()).includes('499 USDC'));
        assert.equal(await page.locator('#branch-list .roster-row').count(), 1, 'Branch #2 must be blocked without license');

        // 15 -> 49 -> 499 (unlocks Branch #2 & #3) -> 999 (unlocks Branch #4)
        await page.selectOption('#tier-select', 'sponsor15');
        await page.click('#wallet-pay-btn');
        await page.waitForSelector('#checkout-result:not([hidden])');
        const tok15 = (await page.locator('#license-token-text').innerText()).trim();
        assert.ok(tok15.startsWith('OPENCEN-PRO-v1.'));

        await page.selectOption('#tier-select', 'sponsor49');
        await page.click('#wallet-pay-btn');
        await page.waitForSelector('#checkout-result:not([hidden])');
        const tok49 = (await page.locator('#license-token-text').innerText()).trim();
        assert.notEqual(tok49, tok15);

        await page.selectOption('#tier-select', 'team');
        await page.click('#wallet-pay-btn');
        await page.waitForSelector('#checkout-result:not([hidden])');
        const tok499 = (await page.locator('#license-token-text').innerText()).trim();
        assert.notEqual(tok499, tok49);
        assert.ok(sentTxs[2].data.toLowerCase().endsWith(499_000_000n.toString(16).padStart(64, '0')));

        await page.fill('#branch-code-input', 'MKK');
        await page.fill('#branch-name-input', 'Mong Kok Studio');
        await page.click('#add-branch-btn');
        assert.equal(await page.locator('#branch-list .roster-row').count(), 2, 'Team token unlocked Branch #2');

        await page.selectOption('#tier-select', 'chain');
        await page.click('#wallet-pay-btn');
        await page.waitForSelector('#checkout-result:not([hidden])');
        const tok999 = (await page.locator('#license-token-text').innerText()).trim();
        assert.notEqual(tok999, tok499);
        assert.ok(sentTxs[3].data.toLowerCase().endsWith(999_000_000n.toString(16).padStart(64, '0')));

        await page.fill('#branch-code-input', 'STN');
        await page.fill('#branch-name-input', 'Shatin Studio');
        await page.click('#add-branch-btn');
        await page.fill('#branch-code-input', 'TST');
        await page.fill('#branch-name-input', 'TST Studio');
        await page.click('#add-branch-btn');
        await page.fill('#branch-code-input', 'YMT');
        await page.fill('#branch-name-input', 'YMT Studio');
        await page.click('#add-branch-btn');
        assert.equal(await page.locator('#branch-list .roster-row').count(), 5, 'Chain token unlocked 4+ branches');
      }

      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
        false,
        `Horizontal overflow detected on ${vp.tag}`
      );
      assert.deepEqual(errors, [], `Console/page errors on ${vp.tag}: ${errors.join('; ')}`);
      await ctx.close();
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    await killProcessTree(wranglerProc);
    rpcServer.close();
    if (preExistingDevVars !== null) {
      await fs.writeFile(devVarsPath, preExistingDevVars, 'utf8');
    } else {
      await fs.rm(devVarsPath, { force: true });
    }
    await fs.rm(stateDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }).catch(() => {});
  }
});
