import { createPrivateKey, sign as nodeEd25519Sign } from 'node:crypto';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { verifyMessage } from 'viem';
import { renderPassBadgeSvg } from './qr-svg.ts';

export interface Env {
  ASSETS: Fetcher;
  LICENSES_KV: KVNamespace;
  GLOBAL_CLAIMED_TX_KV: KVNamespace;
  BRAND_NAME: string;
  PRODUCT_ID: string;
  TOKEN_PREFIX: string;
  PAY_TO_EVM_ADDRESS: string;
  BASE_USDC_CONTRACT: string;
  BASE_CHAIN_ID: string;
  BASE_RPC_URL: string;
  BASE_RPC_URLS?: string;
  SPONSOR15_PRICE_USDC_ATOMIC?: string;
  SPONSOR49_PRICE_USDC_ATOMIC?: string;
  TEAM_PRICE_USDC_ATOMIC: string;
  CHAIN_PRICE_USDC_ATOMIC?: string;
  MIN_CONFIRMATIONS: string;
  CHALLENGE_TTL_SECONDS: string;
  DOWNLOAD_TTL_SECONDS: string;
  SOLANA_RECEIVE_ADDRESS: string;
  BTC_RECEIVE_ADDRESS: string;
  TRON_RECEIVE_ADDRESS: string;
  LICENSE_SIGNING_PRIVATE_JWK?: string;
  LICENSE_SIGNING_PUBLIC_SPKI_B64?: string;
  DOWNLOAD_HMAC_SECRET?: string;
}

type Tier = 'sponsor15' | 'sponsor49' | 'team' | 'chain';

const ERC20_TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const SIG_RE = /^0x[0-9a-fA-F]{130}$/;
const STRICT_HEX_RE = /^0x[0-9a-fA-F]+$/;
const SCOPE_STOREFRONT = 'storefront:open-center-os';

const DEFAULT_BASE_RPC_URLS = [
  'https://mainnet.base.org',
  'https://base-rpc.publicnode.com',
  'https://1rpc.io/base'
];

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0f172a"/><rect x="7" y="7" width="8" height="8" rx="2" fill="#10b981"/><rect x="17" y="7" width="8" height="8" rx="2" fill="#38bdf8"/><rect x="7" y="17" width="18" height="8" rx="2" fill="#f59e0b"/></svg>`;

interface ChallengeRecord {
  nonce: string;
  txHash: string;
  tier: Tier;
  ts: number;
  message: string;
}

interface GlobalClaimRecord {
  scope: string;
  payer: string;
  tier: string;
  txHash: string;
  claimedAt: number;
}

interface DownloadGrantRecord {
  txHash: string;
  payer: string;
  tier: Tier;
  remainingDownloads: number;
  createdAt: number;
  licenseToken: string;
}

interface RpcLog {
  address: string;
  topics: string[];
  data: string;
}

interface RpcReceipt {
  status: string;
  blockNumber: string;
  logs: RpcLog[];
}

function parseTier(raw: string | undefined): Tier | null {
  const t = (raw ?? '').trim();
  if (t === 'sponsor15' || t === 'sponsor49' || t === 'team' || t === 'chain') return t;
  return null;
}

function getTierMaxBranches(tier: Tier): number | null {
  if (tier === 'chain') return null;
  if (tier === 'team') return 3;
  return 1;
}

function parseStrictHexBigInt(val: unknown): bigint | null {
  if (typeof val !== 'string' || !STRICT_HEX_RE.test(val)) return null;
  return BigInt(val);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomHex(byteCount = 16): string {
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return toHex(new Uint8Array(sig));
}

function normalizeAddressFromTopic(topic: string): string {
  return `0x${topic.slice(-40).toLowerCase()}`;
}

function getTierPriceAtomic(env: Env, tier: Tier): bigint {
  if (tier === 'chain') return BigInt(env.CHAIN_PRICE_USDC_ATOMIC || '999000000');
  if (tier === 'team') return BigInt(env.TEAM_PRICE_USDC_ATOMIC || '499000000');
  if (tier === 'sponsor49') return BigInt(env.SPONSOR49_PRICE_USDC_ATOMIC || '49000000');
  return BigInt(env.SPONSOR15_PRICE_USDC_ATOMIC || '15000000');
}

function getBaseRpcUrls(env: Env): string[] {
  if (env.BASE_RPC_URLS && env.BASE_RPC_URLS.trim()) {
    const parsed = env.BASE_RPC_URLS.split(',')
      .map((u) => u.trim())
      .filter(Boolean);
    if (parsed.length > 0) return parsed;
  }
  if (env.BASE_RPC_URL && env.BASE_RPC_URL.trim()) {
    return [env.BASE_RPC_URL.trim()];
  }
  return DEFAULT_BASE_RPC_URLS;
}

async function rpcCallSingle<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(6000)
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (json.error) throw new Error(`RPC error: ${json.error.message ?? 'unknown'}`);
  return json.result as T;
}

async function rpcCallWithFailover<T>(urls: string[], method: string, params: unknown[]): Promise<T> {
  let lastError: unknown;
  for (const url of urls) {
    try {
      return await rpcCallSingle<T>(url, method, params);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `All Base RPC endpoints failed: ${lastError instanceof Error ? lastError.message : 'unknown'}`
  );
}

function sumBaseUsdcTransfers(
  logs: RpcLog[] | undefined,
  expectedUsdcContract: string,
  expectedPayTo: string
): Map<string, bigint> {
  const expectedUsdc = expectedUsdcContract.toLowerCase();
  const expectedTo = expectedPayTo.toLowerCase();
  const payerTotals = new Map<string, bigint>();
  for (const log of logs ?? []) {
    if (log.address?.toLowerCase() !== expectedUsdc) continue;
    if (!log.topics || log.topics.length < 3) continue;
    if (log.topics[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC) continue;
    const from = normalizeAddressFromTopic(log.topics[1]);
    const to = normalizeAddressFromTopic(log.topics[2]);
    if (to !== expectedTo) continue;
    const value = parseStrictHexBigInt(log.data);
    if (value === null) continue;
    payerTotals.set(from, (payerTotals.get(from) ?? 0n) + value);
  }
  return payerTotals;
}

function buildChallengeMessage(params: {
  brand: string;
  product: string;
  tier: Tier;
  txHash: string;
  nonce: string;
  ts: number;
}): string {
  return [
    `${params.brand} Open-Center OS Ownership Proof`,
    `product=${params.product}`,
    `tier=${params.tier}`,
    `tx=${params.txHash.toLowerCase()}`,
    `nonce=${params.nonce}`,
    `ts=${params.ts}`
  ].join('\n');
}

async function signOpenCenterLicense(
  env: Env,
  payload: {
    v: 1;
    product: string;
    tier: Tier;
    maxBranches: number | null;
    payer: string;
    txHash: string;
    issuedAt: number;
    expiresAt: null;
  }
): Promise<string> {
  const rawJwk = env.LICENSE_SIGNING_PRIVATE_JWK!.trim().replace(/^'(.*)'$/, '$1');
  const jwk = JSON.parse(rawJwk) as JsonWebKey;
  const prefix = env.TOKEN_PREFIX || 'OPENCEN-PRO-v1.';
  const payloadB64Url = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = new TextEncoder().encode(`${prefix}${payloadB64Url}`);

  try {
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['sign']);
    const sigBuf = await crypto.subtle.sign('Ed25519', key, signingInput);
    return `${prefix}${payloadB64Url}.${base64UrlEncode(new Uint8Array(sigBuf))}`;
  } catch {
    const privKey = createPrivateKey({ key: jwk as Record<string, unknown>, format: 'jwk' });
    const sigBuf = nodeEd25519Sign(null, Buffer.from(signingInput), privKey);
    return `${prefix}${payloadB64Url}.${base64UrlEncode(new Uint8Array(sigBuf))}`;
  }
}

const app = new Hono<{ Bindings: Env }>();

app.onError((err, c) => {
  console.error('[open-center-os unhandled]', err instanceof Error ? err.stack || err.message : String(err));
  return c.json({ error: 'INTERNAL_ERROR' }, 500);
});

const apiCors = cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-OpenCenter-License']
});

app.use('/api/*', apiCors);

app.use('*', async (c, next) => {
  await next();
  const ct = c.res.headers.get('content-type');
  if (ct && (ct.startsWith('application/json') || ct.startsWith('text/html')) && !/charset=/i.test(ct)) {
    c.res.headers.set('content-type', `${ct}; charset=utf-8`);
  }
});

app.get('/favicon.svg', () => {
  return new Response(FAVICON_SVG, {
    status: 200,
    headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=86400' }
  });
});

app.get('/favicon.ico', () => {
  return new Response(FAVICON_SVG, {
    status: 200,
    headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=86400' }
  });
});

app.get('/api/pass/:passCode', (c) => {
  const rawPass = c.req.param('passCode') ?? '';
  const passCode = rawPass.endsWith('.svg') ? rawPass.slice(0, -4) : rawPass;
  const svg = renderPassBadgeSvg({
    passCode,
    studentName: c.req.query('student'),
    courseTitle: c.req.query('course'),
    branchName: c.req.query('branch'),
    credits: c.req.query('credits')
  });
  return new Response(svg, {
    status: 200,
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=300'
    }
  });
});

app.get('/api/health', (c) => {
  return c.json({
    ok: true,
    service: 'open-center-os',
    singleBranchLicense: 'MIT ($0 Forever)',
    kvBound: Boolean(c.env.LICENSES_KV),
    globalReplayGuardBound: Boolean(c.env.GLOBAL_CLAIMED_TX_KV)
  });
});

app.get('/api/config', (c) => {
  return c.json({
    brand: c.env.BRAND_NAME || 'ApexHive Labs',
    productId: c.env.PRODUCT_ID || 'open-center-os',
    tokenPrefix: c.env.TOKEN_PREFIX || 'OPENCEN-PRO-v1.',
    licensePublicKeySpkiB64: c.env.LICENSE_SIGNING_PUBLIC_SPKI_B64 || null,
    supportEmail: 'apexhive.hq@proton.me',
    chainId: Number(c.env.BASE_CHAIN_ID || '8453'),
    usdcContract: c.env.BASE_USDC_CONTRACT,
    payToEvmAddress: c.env.PAY_TO_EVM_ADDRESS,
    minConfirmations: Number(c.env.MIN_CONFIRMATIONS || '2'),
    tiers: {
      free: { priceUsd: '0', maxBranches: 1, license: 'MIT Single-Branch Unrestricted' },
      sponsor15: { priceAtomic: c.env.SPONSOR15_PRICE_USDC_ATOMIC || '15000000', priceUsd: '15.00', maxBranches: 1 },
      sponsor49: { priceAtomic: c.env.SPONSOR49_PRICE_USDC_ATOMIC || '49000000', priceUsd: '49.00', maxBranches: 1 },
      team: { priceAtomic: c.env.TEAM_PRICE_USDC_ATOMIC || '499000000', priceUsd: '499.00', maxBranches: 3 },
      chain: { priceAtomic: c.env.CHAIN_PRICE_USDC_ATOMIC || '999000000', priceUsd: '999.00', maxBranches: null }
    },
    altTreasury: {
      solana: c.env.SOLANA_RECEIVE_ADDRESS,
      btc: c.env.BTC_RECEIVE_ADDRESS,
      tron: c.env.TRON_RECEIVE_ADDRESS
    }
  });
});

app.post('/api/challenge', async (c) => {
  let body: { txHash?: string; tier?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'INVALID_JSON' }, 400);
  }

  const txHash = (body.txHash ?? '').trim();
  const tier = parseTier(body.tier);
  if (!TX_HASH_RE.test(txHash)) {
    return c.json({ error: 'INVALID_TX_HASH', message: 'Expected 0x-prefixed 64-hex txHash.' }, 400);
  }
  if (!tier) {
    return c.json({ error: 'INVALID_TIER', message: 'Tier must be sponsor15, sponsor49, team, or chain.' }, 400);
  }

  const ttl = Math.max(60, Number(c.env.CHALLENGE_TTL_SECONDS || '300'));
  const nonce = randomHex(16);
  const ts = Math.floor(Date.now() / 1000);
  const message = buildChallengeMessage({
    brand: c.env.BRAND_NAME || 'ApexHive Labs',
    product: c.env.PRODUCT_ID || 'open-center-os',
    tier,
    txHash,
    nonce,
    ts
  });

  const record: ChallengeRecord = { nonce, txHash: txHash.toLowerCase(), tier, ts, message };
  await c.env.LICENSES_KV.put(`challenge:${nonce}`, JSON.stringify(record), { expirationTtl: ttl });
  return c.json({ nonce, ts, expiresInSeconds: ttl, message });
});

app.post('/api/verify', async (c) => {
  if (
    !c.env.LICENSE_SIGNING_PRIVATE_JWK ||
    !c.env.DOWNLOAD_HMAC_SECRET ||
    c.env.DOWNLOAD_HMAC_SECRET.length < 16 ||
    !c.env.GLOBAL_CLAIMED_TX_KV
  ) {
    return c.json(
      {
        error: 'SERVER_MISCONFIGURED',
        message: 'Missing LICENSE_SIGNING_PRIVATE_JWK, DOWNLOAD_HMAC_SECRET, or GLOBAL_CLAIMED_TX_KV.'
      },
      500
    );
  }

  let body: { txHash?: string; nonce?: string; signature?: string; tier?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'INVALID_JSON' }, 400);
  }

  const txHash = (body.txHash ?? '').trim();
  const nonce = (body.nonce ?? '').trim();
  const signature = (body.signature ?? '').trim();
  const tier = parseTier(body.tier);

  if (!TX_HASH_RE.test(txHash) || !nonce || !SIG_RE.test(signature)) {
    return c.json({ error: 'INVALID_REQUEST', message: 'Provide valid txHash, nonce, and EIP-191 signature.' }, 400);
  }
  if (!tier) {
    return c.json({ error: 'INVALID_TIER', message: 'Tier must be sponsor15, sponsor49, team, or chain.' }, 400);
  }

  const txLower = txHash.toLowerCase();
  const challengeKey = `challenge:${nonce}`;
  const challengeRaw = await c.env.LICENSES_KV.get(challengeKey);
  if (!challengeRaw) {
    return c.json({ error: 'CHALLENGE_EXPIRED_OR_MISSING', message: 'Challenge expired (>300s) or unknown.' }, 403);
  }

  const challenge = JSON.parse(challengeRaw) as ChallengeRecord;
  const ttl = Math.max(60, Number(c.env.CHALLENGE_TTL_SECONDS || '300'));
  const nowSec = Math.floor(Date.now() / 1000);
  if (challenge.txHash !== txLower || challenge.tier !== tier || nowSec - challenge.ts > ttl) {
    await c.env.LICENSES_KV.delete(challengeKey);
    return c.json({ error: 'CHALLENGE_MISMATCH_OR_EXPIRED', message: 'Challenge mismatch or expired.' }, 403);
  }

  const rpcUrls = getBaseRpcUrls(c.env);
  let receipt: RpcReceipt | null;
  let latestBlockHex: string;
  try {
    [receipt, latestBlockHex] = await Promise.all([
      rpcCallWithFailover<RpcReceipt | null>(rpcUrls, 'eth_getTransactionReceipt', [txLower]),
      rpcCallWithFailover<string>(rpcUrls, 'eth_blockNumber', [])
    ]);
  } catch (err) {
    return c.json(
      { error: 'RPC_UNAVAILABLE', message: err instanceof Error ? err.message : 'Base RPC error' },
      502
    );
  }

  if (!receipt || receipt.status !== '0x1') {
    return c.json({ error: 'TX_NOT_CONFIRMED', message: 'Receipt missing or reverted.' }, 403);
  }
  const txBlock = parseStrictHexBigInt(receipt.blockNumber);
  const headBlock = parseStrictHexBigInt(latestBlockHex);
  if (txBlock === null || headBlock === null) {
    return c.json({ error: 'TX_NOT_CONFIRMED', message: 'Malformed hex blockNumber from RPC.' }, 403);
  }

  const minConf = Math.max(1, Number(c.env.MIN_CONFIRMATIONS || '2'));
  const confirmations = headBlock >= txBlock ? Number(headBlock - txBlock) + 1 : 0;
  if (confirmations < minConf) {
    return c.json({ error: 'INSUFFICIENT_CONFIRMATIONS', message: `Need >= ${minConf} confirmations.` }, 403);
  }

  const requiredAmount = getTierPriceAtomic(c.env, tier);
  const payerTotals = sumBaseUsdcTransfers(
    receipt.logs,
    c.env.BASE_USDC_CONTRACT,
    c.env.PAY_TO_EVM_ADDRESS
  );

  let matchedPayer: string | null = null;
  let paidAtomic = 0n;
  for (const [fromAddr, totalPaid] of payerTotals.entries()) {
    if (totalPaid < requiredAmount) continue;
    const sigOk = await verifyMessage({
      address: fromAddr as `0x${string}`,
      message: challenge.message,
      signature: signature as `0x${string}`
    }).catch(() => false);
    if (sigOk) {
      matchedPayer = fromAddr;
      paidAtomic = totalPaid;
      break;
    }
  }

  if (!matchedPayer) {
    await c.env.LICENSES_KV.delete(challengeKey);
    return c.json(
      { error: 'PAYMENT_OR_SIGNATURE_INVALID', message: 'Transfer or EIP-191 signature verification failed.' },
      403
    );
  }

  const globalKey = `global_tx:${txLower}`;
  const globalRaw = await c.env.GLOBAL_CLAIMED_TX_KV.get(globalKey);
  if (globalRaw) {
    const globalRec = JSON.parse(globalRaw) as GlobalClaimRecord;
    if (globalRec.scope !== SCOPE_STOREFRONT) {
      await c.env.LICENSES_KV.delete(challengeKey);
      return c.json(
        { error: 'TX_ALREADY_CLAIMED_ELSEWHERE', message: `Already claimed on ${globalRec.scope}.` },
        403
      );
    }
    if (globalRec.payer?.toLowerCase() !== matchedPayer.toLowerCase() || globalRec.tier !== tier) {
      await c.env.LICENSES_KV.delete(challengeKey);
      return c.json({ error: 'TX_ALREADY_CLAIMED', message: 'Transaction already claimed.' }, 403);
    }
  }

  await c.env.LICENSES_KV.delete(challengeKey);

  const claimedKey = `claimed_tx:${txLower}`;
  const existingRaw = await c.env.LICENSES_KV.get(claimedKey);
  let reclaimed = false;
  if (existingRaw) {
    const existing = JSON.parse(existingRaw) as { payer?: string; tier?: Tier };
    if (existing.payer?.toLowerCase() === matchedPayer.toLowerCase() && existing.tier === tier) {
      reclaimed = true;
    } else {
      return c.json({ error: 'TX_ALREADY_CLAIMED', message: 'Transaction already claimed.' }, 403);
    }
  }

  const issuedAt = Date.now();
  const maxBranches = getTierMaxBranches(tier);
  const licenseToken = await signOpenCenterLicense(c.env, {
    v: 1,
    product: c.env.PRODUCT_ID || 'open-center-os',
    tier,
    maxBranches,
    payer: matchedPayer,
    txHash: txLower,
    issuedAt,
    expiresAt: null
  });

  const grantId = randomHex(16);
  const sigHex = await hmacSha256Hex(c.env.DOWNLOAD_HMAC_SECRET, grantId);
  const downloadToken = `${grantId}.${sigHex}`;
  const downloadTtl = Math.max(120, Number(c.env.DOWNLOAD_TTL_SECONDS || '600'));

  const grant: DownloadGrantRecord = {
    txHash: txLower,
    payer: matchedPayer,
    tier,
    remainingDownloads: 3,
    createdAt: issuedAt,
    licenseToken
  };

  const writes: Array<Promise<void>> = [
    c.env.LICENSES_KV.put(`dl:${grantId}`, JSON.stringify(grant), { expirationTtl: downloadTtl })
  ];
  if (!reclaimed) {
    writes.push(
      c.env.LICENSES_KV.put(
        claimedKey,
        JSON.stringify({ txHash: txLower, payer: matchedPayer, tier, paidAtomic: paidAtomic.toString(), issuedAt })
      ),
      c.env.GLOBAL_CLAIMED_TX_KV.put(
        globalKey,
        JSON.stringify({ scope: SCOPE_STOREFRONT, payer: matchedPayer, tier, txHash: txLower, claimedAt: issuedAt })
      )
    );
  }
  await Promise.all(writes);

  return c.json({
    ok: true,
    reclaimed,
    tier,
    maxBranches,
    multiBranchUnlocked: tier === 'team' || tier === 'chain',
    payer: matchedPayer,
    txHash: txLower,
    paidAtomic: paidAtomic.toString(),
    licenseToken,
    downloadToken,
    downloadUrl: `/api/download?token=${encodeURIComponent(downloadToken)}`,
    activationCommand: `node dist/src/cli.js activate --token "${licenseToken}"`
  });
});

app.get('/api/download', async (c) => {
  if (!c.env.DOWNLOAD_HMAC_SECRET || c.env.DOWNLOAD_HMAC_SECRET.length < 16) {
    return c.json({ error: 'SERVER_MISCONFIGURED', message: 'Missing DOWNLOAD_HMAC_SECRET.' }, 500);
  }

  const token = (c.req.query('token') ?? '').trim();
  const match = /^([0-9a-f]{32})\.([0-9a-f]{64})$/.exec(token);
  if (!match) {
    return c.json({ error: 'INVALID_DOWNLOAD_TOKEN' }, 403);
  }

  const [, grantId, sigHex] = match;
  const expectedSig = await hmacSha256Hex(c.env.DOWNLOAD_HMAC_SECRET, grantId);
  if (!constantTimeEqualHex(sigHex, expectedSig)) {
    return c.json({ error: 'INVALID_DOWNLOAD_TOKEN' }, 403);
  }

  const dlKey = `dl:${grantId}`;
  const raw = await c.env.LICENSES_KV.get(dlKey);
  if (!raw) {
    return c.json({ error: 'DOWNLOAD_TOKEN_EXPIRED', message: 'Download grant expired or exhausted.' }, 403);
  }

  const grant = JSON.parse(raw) as DownloadGrantRecord;
  if (grant.remainingDownloads <= 0) {
    await c.env.LICENSES_KV.delete(dlKey);
    return c.json({ error: 'DOWNLOAD_LIMIT_REACHED' }, 403);
  }

  const nextRemaining = grant.remainingDownloads - 1;
  const downloadTtl = Math.max(120, Number(c.env.DOWNLOAD_TTL_SECONDS || '600'));
  if (nextRemaining <= 0) {
    await c.env.LICENSES_KV.delete(dlKey);
  } else {
    await c.env.LICENSES_KV.put(
      dlKey,
      JSON.stringify({ ...grant, remainingDownloads: nextRemaining }),
      { expirationTtl: downloadTtl }
    );
  }

  const bundle = {
    ok: true,
    product: 'open-center-os',
    openSourceLicense: 'MIT',
    mitRepoUrl: 'https://github.com/apexhive-hq/open-center-os',
    singleBranchFreedom: '1 active branch unrestricted at $0 forever',
    tier: grant.tier,
    maxBranches: getTierMaxBranches(grant.tier),
    multiBranchUnlocked: grant.tier === 'team' || grant.tier === 'chain',
    payer: grant.payer,
    txHash: grant.txHash,
    issuedAt: grant.createdAt,
    licenseToken: grant.licenseToken
  };

  return new Response(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': 'attachment; filename="open-center-os-entitlement.json"',
      'cache-control': 'no-store'
    }
  });
});

app.all('*', async (c) => {
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text('Not Found', 404);
});

export default app;
