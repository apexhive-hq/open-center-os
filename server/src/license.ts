import { createPublicKey, verify } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { LicenseVerificationResult, OpenCenterLicensePayload } from './types.js';

export const DEFAULT_OPEN_CENTER_PUBLIC_KEY_SPKI_B64 =
  'MCowBQYDK2VwAyEAIZ0+vY6AoGS1MjRWirRbdfdgEnjRUWMdsKtRv4hek0g=';

const TOKEN_PREFIX = 'OPENCEN-PRO-v1.';

const LicensePayloadSchema = z.object({
  v: z.literal(1),
  product: z.literal('open-center-os'),
  tier: z.enum(['sponsor15', 'sponsor49', 'team', 'chain']),
  maxBranches: z.number().int().positive().nullable().optional(),
  payer: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  issuedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive().nullable()
});

function toPublicKeyObject(spkiB64: string) {
  const der = Buffer.from(spkiB64.trim(), 'base64');
  return createPublicKey({ key: der, format: 'der', type: 'spki' });
}

export function verifyOpenCenterLicenseToken(
  token: string,
  options?: { publicKeySpkiB64?: string; nowMs?: number }
): LicenseVerificationResult {
  const trimmed = token.trim();
  if (!trimmed.startsWith(TOKEN_PREFIX)) {
    return { valid: false, reason: 'Invalid license token prefix (expected OPENCEN-PRO-v1.).' };
  }

  const parts = trimmed.slice(TOKEN_PREFIX.length).split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, reason: 'Malformed license token structure.' };
  }

  const [payloadB64Url, sigB64Url] = parts;
  const spkiB64 =
    options?.publicKeySpkiB64 ||
    process.env.OPEN_CENTER_PUBLIC_KEY ||
    DEFAULT_OPEN_CENTER_PUBLIC_KEY_SPKI_B64;

  let sigVerified = false;
  try {
    const pubKey = toPublicKeyObject(spkiB64);
    const signingInput = Buffer.from(`${TOKEN_PREFIX}${payloadB64Url}`, 'utf8');
    const sigBytes = Buffer.from(sigB64Url, 'base64url');
    sigVerified = verify(null, signingInput, pubKey, sigBytes);
  } catch (err) {
    return {
      valid: false,
      reason: `Ed25519 verification error: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  if (!sigVerified) {
    return { valid: false, reason: 'Invalid Ed25519 signature.' };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(Buffer.from(payloadB64Url, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, reason: 'Malformed JSON payload in license token.' };
  }

  const parsed = LicensePayloadSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return { valid: false, reason: `Invalid license payload fields: ${parsed.error.message}` };
  }

  const payload: OpenCenterLicensePayload = parsed.data;
  const now = options?.nowMs ?? Date.now();
  if (payload.expiresAt !== null && now > payload.expiresAt) {
    return { valid: false, reason: 'License token has expired.', payload };
  }

  return { valid: true, payload };
}

export function getMaxAllowedBranches(result: LicenseVerificationResult | null): number | null {
  if (!result || !result.valid || !result.payload) return 1;
  if (result.payload.tier === 'chain') {
    return result.payload.maxBranches === undefined ? null : result.payload.maxBranches;
  }
  if (result.payload.tier === 'team') {
    return typeof result.payload.maxBranches === 'number' && result.payload.maxBranches >= 1
      ? result.payload.maxBranches
      : 3;
  }
  return 1;
}

export function isMultiBranchAuthorized(result: LicenseVerificationResult | null): boolean {
  const max = getMaxAllowedBranches(result);
  return max === null || max > 1;
}

export function resolveOpenCenterHome(customHome?: string): string {
  if (customHome) return customHome;
  if (process.env.OPEN_CENTER_HOME) return process.env.OPEN_CENTER_HOME;
  const base = process.env.APPDATA || homedir();
  return join(base, '.open-center-os');
}

export function saveActivatedLicense(
  token: string,
  options?: { homeDir?: string; publicKeySpkiB64?: string }
): { filePath: string; verification: LicenseVerificationResult } {
  const verification = verifyOpenCenterLicenseToken(token, {
    publicKeySpkiB64: options?.publicKeySpkiB64
  });
  if (!verification.valid || !verification.payload) {
    throw new Error(verification.reason ?? 'Invalid license token.');
  }

  const home = resolveOpenCenterHome(options?.homeDir);
  mkdirSync(home, { recursive: true });
  const filePath = join(home, 'license.json');
  writeFileSync(
    filePath,
    JSON.stringify(
      {
        token: token.trim(),
        payload: verification.payload,
        activatedAt: new Date().toISOString()
      },
      null,
      2
    ),
    'utf8'
  );
  return { filePath, verification };
}

export function loadActiveLicense(options?: {
  homeDir?: string;
  publicKeySpkiB64?: string;
  inlineToken?: string;
}): LicenseVerificationResult | null {
  const envToken = options?.inlineToken || process.env.OPEN_CENTER_LICENSE_TOKEN;
  if (envToken) {
    return verifyOpenCenterLicenseToken(envToken, {
      publicKeySpkiB64: options?.publicKeySpkiB64
    });
  }

  const filePath = join(resolveOpenCenterHome(options?.homeDir), 'license.json');
  if (!existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8')) as { token?: string };
    if (!raw.token) return null;
    return verifyOpenCenterLicenseToken(raw.token, {
      publicKeySpkiB64: options?.publicKeySpkiB64
    });
  } catch {
    return { valid: false, reason: 'Corrupted stored license.json file.' };
  }
}
