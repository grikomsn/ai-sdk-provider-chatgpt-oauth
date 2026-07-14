import 'server-only';

import {
  extractAccountIdFromToken,
  type ChatGPTOAuthCredentials,
} from '@grikomsn/ai-sdk-provider-chatgpt-oauth';

const DEFAULT_ISSUER = 'https://auth.openai.com';
const DEFAULT_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const REQUEST_TIMEOUT_MS = 15_000;

interface DeviceCodeResponse {
  device_auth_id: string;
  user_code?: string;
  usercode?: string;
  interval: string | number;
}

interface DeviceTokenResponse {
  authorization_code: string;
  code_verifier: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
}

export interface DeviceCodeRequest {
  deviceAuthId: string;
  userCode: string;
  verificationUrl: string;
  interval: number;
  expiresAt: number;
}

export type DeviceCodePollResult =
  { status: 'pending' } | { status: 'complete'; authorizationCode: string; codeVerifier: string };

export class OAuthRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number
  ) {
    super(message);
    this.name = 'OAuthRequestError';
  }
}

function getOAuthConfig(): { issuer: string; clientId: string } {
  return {
    issuer: (process.env.CHATGPT_OAUTH_ISSUER ?? DEFAULT_ISSUER).replace(/\/$/, ''),
    clientId: process.env.CHATGPT_OAUTH_CLIENT_ID ?? DEFAULT_CLIENT_ID,
  };
}

function requestInit(init: RequestInit): RequestInit {
  return {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new OAuthRequestError('The OAuth server returned an invalid response.', response.status);
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function parseInterval(value: string | number): number {
  const interval = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  return Number.isFinite(interval) ? Math.min(Math.max(Math.trunc(interval), 1), 30) : 5;
}

export async function requestDeviceCode(): Promise<DeviceCodeRequest> {
  const { issuer, clientId } = getOAuthConfig();
  const response = await fetch(
    `${issuer}/api/accounts/deviceauth/usercode`,
    requestInit({
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ client_id: clientId }),
    })
  );

  if (!response.ok) {
    throw new OAuthRequestError('Unable to start ChatGPT device authorization.', response.status);
  }

  const data = await readJson<DeviceCodeResponse>(response);
  const userCode = data.user_code ?? data.usercode;

  if (!isNonEmptyString(data.device_auth_id) || !isNonEmptyString(userCode)) {
    throw new OAuthRequestError('The OAuth server returned an incomplete device code.');
  }

  return {
    deviceAuthId: data.device_auth_id,
    userCode,
    verificationUrl: `${issuer}/codex/device`,
    interval: parseInterval(data.interval),
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
}

export async function pollDeviceCode(
  deviceAuthId: string,
  userCode: string
): Promise<DeviceCodePollResult> {
  const { issuer } = getOAuthConfig();
  const response = await fetch(
    `${issuer}/api/accounts/deviceauth/token`,
    requestInit({
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        device_auth_id: deviceAuthId,
        user_code: userCode,
      }),
    })
  );

  if (response.status === 403 || response.status === 404) {
    return { status: 'pending' };
  }

  if (!response.ok) {
    throw new OAuthRequestError('ChatGPT device authorization failed.', response.status);
  }

  const data = await readJson<DeviceTokenResponse>(response);
  if (!isNonEmptyString(data.authorization_code) || !isNonEmptyString(data.code_verifier)) {
    throw new OAuthRequestError('The OAuth server returned an incomplete authorization code.');
  }

  return {
    status: 'complete',
    authorizationCode: data.authorization_code,
    codeVerifier: data.code_verifier,
  };
}

export async function exchangeDeviceCode(
  authorizationCode: string,
  codeVerifier: string
): Promise<ChatGPTOAuthCredentials> {
  const { issuer, clientId } = getOAuthConfig();
  const response = await fetch(
    `${issuer}/oauth/token`,
    requestInit({
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code: authorizationCode,
        code_verifier: codeVerifier,
        redirect_uri: `${issuer}/deviceauth/callback`,
      }),
    })
  );

  if (!response.ok) {
    throw new OAuthRequestError(
      'Unable to exchange the ChatGPT authorization code.',
      response.status
    );
  }

  return credentialsFromTokenResponse(await readJson<TokenResponse>(response));
}

export async function refreshCredentials(
  refreshToken: string,
  currentAccountId: string
): Promise<ChatGPTOAuthCredentials> {
  const { issuer, clientId } = getOAuthConfig();
  const response = await fetch(
    `${issuer}/oauth/token`,
    requestInit({
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: refreshToken,
      }),
    })
  );

  if (!response.ok) {
    throw new OAuthRequestError('Unable to refresh the ChatGPT session.', response.status);
  }

  const credentials = credentialsFromTokenResponse(await readJson<TokenResponse>(response));
  return {
    ...credentials,
    refreshToken: credentials.refreshToken ?? refreshToken,
    accountId: credentials.accountId || currentAccountId,
  };
}

function credentialsFromTokenResponse(data: TokenResponse): ChatGPTOAuthCredentials {
  if (!isNonEmptyString(data.access_token) || !Number.isFinite(data.expires_in)) {
    throw new OAuthRequestError('The OAuth server returned incomplete credentials.');
  }

  const accountId = [data.id_token, data.access_token]
    .filter(isNonEmptyString)
    .map((token) => extractAccountIdFromToken(token))
    .find(isNonEmptyString);

  if (!accountId) {
    throw new OAuthRequestError('The ChatGPT account ID was not present in the OAuth token.');
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accountId,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}
