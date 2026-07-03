import type { ChatGPTOAuthCredentials } from '../chatgpt-oauth-settings';
import { ChatGPTOAuthError } from '../chatgpt-oauth-error';

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const TOKEN_URL = 'https://auth.openai.com/oauth/token';

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token: string;
  expires_in: number;
}

export async function refreshAccessToken(
  refreshToken: string,
  accountId: string
): Promise<ChatGPTOAuthCredentials> {
  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
      }),
    });

    if (!response.ok) {
      throw new ChatGPTOAuthError(
        `Token refresh failed: ${response.status} ${response.statusText}`,
        'TOKEN_REFRESH_FAILED',
        response.status
      );
    }

    const data = (await response.json()) as TokenResponse;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      accountId,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
  } catch (error) {
    if (error instanceof ChatGPTOAuthError) {
      throw error;
    }
    throw new ChatGPTOAuthError(
      'Failed to refresh ChatGPT OAuth token',
      'TOKEN_REFRESH_FAILED',
      undefined,
      {
        cause: error,
      }
    );
  }
}
