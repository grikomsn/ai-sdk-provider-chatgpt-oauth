import 'server-only';

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { ChatGPTOAuthCredentials } from '@grikomsn/ai-sdk-provider-chatgpt-oauth';
import { cookies } from 'next/headers';
import { refreshCredentials } from './openai-oauth';
import { deriveLegacySessionKey, deriveSessionKey, validateSessionSecret } from './session-key';

const SESSION_COOKIE = 'chatgpt_oauth_session';
const DEVICE_COOKIE = 'chatgpt_oauth_device';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const DEVICE_MAX_AGE_SECONDS = 15 * 60;
const REFRESH_WINDOW_MS = 5 * 60 * 1000;
const MAX_ENCRYPTED_COOKIE_LENGTH = 3_800;
const refreshOperations = new Map<string, Promise<ChatGPTOAuthCredentials>>();

let cachedSecret: string | undefined;
let cachedEncryptionKey: Buffer | undefined;
let cachedLegacyEncryptionKey: Buffer | undefined;

export interface DeviceFlowSession {
  deviceAuthId: string;
  userCode: string;
  interval: number;
  expiresAt: number;
}

export class SessionRequiredError extends Error {
  constructor(message = 'Sign in with ChatGPT to continue.') {
    super(message);
    this.name = 'SessionRequiredError';
  }
}

function encryptionKey(): Buffer {
  const secret = validateSessionSecret();
  if (cachedSecret !== secret || !cachedEncryptionKey) {
    cachedSecret = secret;
    cachedEncryptionKey = deriveSessionKey(secret);
    cachedLegacyEncryptionKey = deriveLegacySessionKey(secret);
  }
  return cachedEncryptionKey;
}

function legacyEncryptionKey(): Buffer {
  encryptionKey();
  return cachedLegacyEncryptionKey as Buffer;
}

function encrypt(value: object): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const encrypted = [
    'v2',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');

  if (encrypted.length > MAX_ENCRYPTED_COOKIE_LENGTH) {
    throw new Error('The encrypted OAuth session is too large for a browser cookie.');
  }

  return encrypted;
}

function decrypt(value: string): unknown {
  const [version, encodedIv, encodedTag, encodedCiphertext] = value.split('.');
  if (!['v1', 'v2'].includes(version) || !encodedIv || !encodedTag || !encodedCiphertext) {
    return null;
  }

  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      version === 'v1' ? legacyEncryptionKey() : encryptionKey(),
      Buffer.from(encodedIv, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(plaintext) as unknown;
  } catch {
    return null;
  }
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    maxAge,
    path: '/',
    priority: 'high' as const,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
  };
}

function isCredentials(value: unknown): value is ChatGPTOAuthCredentials {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const credentials = value as Partial<ChatGPTOAuthCredentials>;
  return (
    typeof credentials.accessToken === 'string' &&
    typeof credentials.accountId === 'string' &&
    (credentials.refreshToken === undefined || typeof credentials.refreshToken === 'string') &&
    (credentials.expiresAt === undefined || typeof credentials.expiresAt === 'number')
  );
}

function isDeviceFlow(value: unknown): value is DeviceFlowSession {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const flow = value as Partial<DeviceFlowSession>;
  return (
    typeof flow.deviceAuthId === 'string' &&
    typeof flow.userCode === 'string' &&
    typeof flow.interval === 'number' &&
    typeof flow.expiresAt === 'number'
  );
}

export async function readAuthSession(): Promise<ChatGPTOAuthCredentials | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) {
    return null;
  }
  const session = decrypt(value);
  return isCredentials(session) ? session : null;
}

export async function writeAuthSession(credentials: ChatGPTOAuthCredentials): Promise<void> {
  (await cookies()).set(
    SESSION_COOKIE,
    encrypt(credentials),
    cookieOptions(SESSION_MAX_AGE_SECONDS)
  );
}

export async function clearAuthSession(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, '', cookieOptions(0));
}

export async function readDeviceFlow(): Promise<DeviceFlowSession | null> {
  const value = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (!value) {
    return null;
  }
  const flow = decrypt(value);
  return isDeviceFlow(flow) ? flow : null;
}

export async function writeDeviceFlow(flow: DeviceFlowSession): Promise<void> {
  (await cookies()).set(DEVICE_COOKIE, encrypt(flow), cookieOptions(DEVICE_MAX_AGE_SECONDS));
}

export async function clearDeviceFlow(): Promise<void> {
  (await cookies()).set(DEVICE_COOKIE, '', cookieOptions(0));
}

export async function requireFreshCredentials(): Promise<ChatGPTOAuthCredentials> {
  const credentials = await readAuthSession();
  if (!credentials) {
    throw new SessionRequiredError();
  }

  if (!credentials.expiresAt || credentials.expiresAt - Date.now() > REFRESH_WINDOW_MS) {
    return credentials;
  }

  if (!credentials.refreshToken) {
    await clearAuthSession();
    throw new SessionRequiredError('Your ChatGPT session expired. Sign in again.');
  }

  try {
    const refreshKey = createHash('sha256').update(credentials.refreshToken).digest('base64url');
    let refreshOperation = refreshOperations.get(refreshKey);
    if (!refreshOperation) {
      refreshOperation = refreshCredentials(
        credentials.refreshToken,
        credentials.accountId
      ).finally(() => {
        refreshOperations.delete(refreshKey);
      });
      refreshOperations.set(refreshKey, refreshOperation);
    }

    const refreshed = await refreshOperation;
    await writeAuthSession(refreshed);
    return refreshed;
  } catch {
    await clearAuthSession();
    throw new SessionRequiredError('Your ChatGPT session expired. Sign in again.');
  }
}
