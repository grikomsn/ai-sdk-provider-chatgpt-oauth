import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ChatGPTOAuthCredentials } from '../chatgpt-oauth-settings';
import { ChatGPTOAuthError } from '../chatgpt-oauth-error';
import { extractAccountIdFromToken } from './index';

interface CodexAuthJson {
  openai_api_key?: string;
  tokens?: {
    id_token: string;
    access_token: string;
    refresh_token: string;
    account_id?: string;
  };
  last_refresh?: string;
}

export function loadCredentialsFromFile(filePath?: string): ChatGPTOAuthCredentials {
  const path = filePath || join(homedir(), '.codex', 'auth.json');

  try {
    const content = readFileSync(path, 'utf-8');
    const auth: CodexAuthJson = JSON.parse(content);

    if (!auth.tokens) {
      throw new ChatGPTOAuthError('No OAuth tokens found in auth.json', 'INVALID_AUTH_FILE');
    }

    const { access_token, refresh_token, id_token, account_id } = auth.tokens;

    if (!access_token) {
      throw new ChatGPTOAuthError('No access token found in auth.json', 'INVALID_AUTH_FILE');
    }

    const accountId = account_id || extractAccountIdFromToken(id_token);

    if (!accountId) {
      throw new ChatGPTOAuthError(
        'Could not determine account ID from auth.json',
        'INVALID_AUTH_FILE'
      );
    }

    const expiresAt = extractTokenExpiry(access_token) ?? extractTokenExpiry(id_token);

    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      accountId,
      expiresAt,
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new ChatGPTOAuthError(
        `Auth file not found at ${path}`,
        'AUTH_FILE_NOT_FOUND',
        undefined,
        { cause: error }
      );
    }
    throw error;
  }
}

export function extractTokenExpiry(token: string): number | undefined {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      exp?: unknown;
    };
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}
