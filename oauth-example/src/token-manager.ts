import { chmodSync, readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { OAuthClient } from './oauth-client.js';
import type { TokenResponse } from './oauth-client.js';
import type { ChatGPTOAuthCredentials } from '@grikomsn/ai-sdk-provider-chatgpt-oauth';

export interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  accountId?: string;
  createdAt: number;
  lastRefreshed?: number;
}

export class TokenManager {
  private storagePath: string;
  private oauthClient: OAuthClient;

  constructor(storagePath?: string) {
    this.storagePath =
      storagePath || process.env.TOKEN_STORAGE_PATH || resolve(process.cwd(), 'oauth-tokens.json');
    this.oauthClient = new OAuthClient();

    // Ensure directory exists
    const dir = dirname(this.storagePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Save tokens to file
   */
  saveTokens(tokens: TokenResponse): void {
    try {
      const accountId = this.oauthClient.extractAccountId(tokens.access_token);

      const storedTokens: StoredTokens = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
        accountId,
        createdAt: Date.now(),
      };

      this.writeTokens(storedTokens);
      console.log(`✅ Tokens saved to ${this.storagePath}`);
    } catch (error) {
      throw new Error(`Failed to save tokens: ${error}`);
    }
  }

  /**
   * Load tokens from file
   */
  loadTokens(): StoredTokens | null {
    if (!existsSync(this.storagePath)) {
      return null;
    }

    try {
      const data = readFileSync(this.storagePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error(`Failed to load tokens: ${error}`);
      return null;
    }
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getValidToken(): Promise<string | null> {
    const stored = this.loadTokens();
    if (!stored) {
      return null;
    }

    // Check if token is still valid (with 5 minute buffer)
    const bufferMs = 5 * 60 * 1000; // 5 minutes
    if (stored.expiresAt > Date.now() + bufferMs) {
      return stored.accessToken;
    }

    // Token expired or about to expire, refresh it
    if (!stored.refreshToken) {
      console.log('⚠️  No refresh token available, please login again');
      return null;
    }

    try {
      console.log('🔄 Refreshing expired token...');
      const newTokens = await this.oauthClient.refreshAccessToken(stored.refreshToken);

      // Update stored tokens
      const updatedTokens: StoredTokens = {
        ...stored,
        accessToken: newTokens.access_token,
        refreshToken: newTokens.refresh_token || stored.refreshToken,
        expiresAt: Date.now() + newTokens.expires_in * 1000,
        lastRefreshed: Date.now(),
      };

      this.writeTokens(updatedTokens);
      console.log('✅ Token refreshed successfully');

      return newTokens.access_token;
    } catch (error) {
      console.error(`Failed to refresh token: ${error}`);
      return null;
    }
  }

  /**
   * Get credentials for AI SDK provider
   */
  async getCredentials(): Promise<ChatGPTOAuthCredentials | null> {
    const stored = this.loadTokens();
    if (!stored) {
      return null;
    }

    // Get valid token (will refresh if needed)
    const accessToken = await this.getValidToken();
    if (!accessToken) {
      return null;
    }

    const current = this.loadTokens() ?? stored;
    return {
      accessToken,
      refreshToken: current.refreshToken,
      accountId: current.accountId || this.oauthClient.extractAccountId(accessToken),
      expiresAt: current.expiresAt,
    };
  }

  /**
   * Clear stored tokens
   */
  clearTokens(): void {
    if (existsSync(this.storagePath)) {
      try {
        unlinkSync(this.storagePath);
        console.log('✅ Tokens cleared');
      } catch (error) {
        console.error(`Failed to clear tokens: ${error}`);
      }
    }
  }

  /**
   * Check if tokens exist and are valid
   */
  async hasValidTokens(): Promise<boolean> {
    const token = await this.getValidToken();
    return token !== null;
  }

  /**
   * Get token status information
   */
  getStatus(): { isAuthenticated: boolean; expiresIn?: string; accountId?: string } | null {
    const stored = this.loadTokens();
    if (!stored) {
      return { isAuthenticated: false };
    }

    const now = Date.now();
    const expiresIn = stored.expiresAt - now;

    if (expiresIn <= 0) {
      return {
        isAuthenticated: false,
        accountId: stored.accountId,
      };
    }

    // Format expiry time
    const hours = Math.floor(expiresIn / (1000 * 60 * 60));
    const minutes = Math.floor((expiresIn % (1000 * 60 * 60)) / (1000 * 60));
    const expiryString = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

    return {
      isAuthenticated: true,
      expiresIn: expiryString,
      accountId: stored.accountId,
    };
  }

  private writeTokens(tokens: StoredTokens): void {
    writeFileSync(this.storagePath, JSON.stringify(tokens, null, 2), {
      mode: 0o600,
    });
    chmodSync(this.storagePath, 0o600);
  }
}
