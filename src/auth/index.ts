import type { ChatGPTOAuthCredentials } from '../chatgpt-oauth-settings';
import { ChatGPTOAuthError } from '../chatgpt-oauth-error';
import { loadCredentialsFromFile } from './credentials-loader';
import { refreshAccessToken } from './token-refresh';

export interface AuthProvider {
  getCredentials(): Promise<ChatGPTOAuthCredentials>;
}

export class DefaultAuthProvider implements AuthProvider {
  private credentials?: ChatGPTOAuthCredentials;
  private refreshPromise?: Promise<ChatGPTOAuthCredentials>;

  constructor(
    private options: {
      credentials?: ChatGPTOAuthCredentials;
      credentialsPath?: string;
      autoRefresh?: boolean;
    } = {}
  ) {
    this.credentials = options.credentials;
  }

  async getCredentials(): Promise<ChatGPTOAuthCredentials> {
    if (!this.credentials) {
      this.credentials = await this.loadCredentials();
    }

    if (this.options.autoRefresh !== false && this.shouldRefresh()) {
      if (!this.refreshPromise) {
        this.refreshPromise = this.refreshToken();
      }
      try {
        this.credentials = await this.refreshPromise;
      } finally {
        this.refreshPromise = undefined;
      }
    }

    return this.credentials;
  }

  private async loadCredentials(): Promise<ChatGPTOAuthCredentials> {
    if (this.options.credentials) {
      return this.options.credentials;
    }

    const envToken = process.env.CHATGPT_OAUTH_ACCESS_TOKEN;
    const envAccountId = process.env.CHATGPT_OAUTH_ACCOUNT_ID;

    if (envToken && envAccountId) {
      return {
        accessToken: envToken,
        accountId: envAccountId,
        refreshToken: process.env.CHATGPT_OAUTH_REFRESH_TOKEN,
      };
    }

    if (this.options.credentialsPath) {
      return loadCredentialsFromFile(this.options.credentialsPath);
    }

    try {
      return loadCredentialsFromFile();
    } catch (error) {
      if (error instanceof ChatGPTOAuthError && error.code !== 'AUTH_FILE_NOT_FOUND') {
        throw error;
      }
      throw new Error(
        'No ChatGPT OAuth credentials found. Please provide credentials directly, ' +
          'set environment variables (CHATGPT_OAUTH_ACCESS_TOKEN, CHATGPT_OAUTH_ACCOUNT_ID), ' +
          'or ensure ~/.codex/auth.json exists with valid credentials.',
        { cause: error }
      );
    }
  }

  private shouldRefresh(): boolean {
    if (!this.credentials?.expiresAt) {
      return false;
    }

    const now = Date.now();
    const expiresIn = this.credentials.expiresAt - now;

    return expiresIn < 60000;
  }

  private async refreshToken(): Promise<ChatGPTOAuthCredentials> {
    if (!this.credentials?.refreshToken) {
      throw new ChatGPTOAuthError('No refresh token available', 'REFRESH_TOKEN_MISSING');
    }

    try {
      const newCredentials = await refreshAccessToken(
        this.credentials.refreshToken,
        this.credentials.accountId
      );

      return newCredentials;
    } catch (error) {
      if (error instanceof ChatGPTOAuthError) {
        throw error;
      }
      throw new ChatGPTOAuthError(
        'Failed to refresh ChatGPT OAuth token',
        'TOKEN_REFRESH_FAILED',
        undefined,
        { cause: error }
      );
    }
  }
}

export function extractAccountIdFromToken(idToken: string): string {
  try {
    const payload = idToken.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      [key: string]: unknown;
      'https://api.openai.com/auth'?: {
        chatgpt_account_id?: string;
      };
    };

    const accountId =
      decoded['https://chatgpt.com/account_id'] ??
      decoded['https://api.openai.com/auth']?.chatgpt_account_id ??
      decoded.account_id ??
      decoded.sub;

    return typeof accountId === 'string' ? accountId : '';
  } catch {
    return '';
  }
}
