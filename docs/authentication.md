# Authentication

## Codex CLI

The default authentication provider reads the Codex CLI credential file:

```bash
npm install --global @openai/codex
codex login
```

```typescript
import { createChatGPTOAuth } from '@grikomsn/ai-sdk-provider-chatgpt-oauth';

const chatgpt = createChatGPTOAuth();
```

The default path is `~/.codex/auth.json`. Use `credentialsPath` to select another
Codex-format file.

## Environment Variables

```bash
export CHATGPT_OAUTH_ACCESS_TOKEN='...'
export CHATGPT_OAUTH_ACCOUNT_ID='...'
export CHATGPT_OAUTH_REFRESH_TOKEN='...' # optional
```

Environment variables are used when direct credentials and a credential file are
not configured.

## Direct Credentials

```typescript
const chatgpt = createChatGPTOAuth({
  credentials: {
    accessToken: process.env.CHATGPT_OAUTH_ACCESS_TOKEN!,
    accountId: process.env.CHATGPT_OAUTH_ACCOUNT_ID!,
    refreshToken: process.env.CHATGPT_OAUTH_REFRESH_TOKEN,
    expiresAt: Date.now() + 60 * 60 * 1000,
  },
});
```

`expiresAt` is milliseconds since the Unix epoch. When it is within 60 seconds of
expiry, `autoRefresh` is enabled, and a refresh token exists, the provider
refreshes it before making a request.

## Custom Provider

Implement `AuthProvider` when credentials live in a keychain, secret manager, or
another service:

```typescript
import type {
  AuthProvider,
  ChatGPTOAuthCredentials,
} from '@grikomsn/ai-sdk-provider-chatgpt-oauth';

class KeychainAuthProvider implements AuthProvider {
  async getCredentials(): Promise<ChatGPTOAuthCredentials> {
    return readCredentialsFromKeychain();
  }
}

const chatgpt = createChatGPTOAuth({
  authProvider: new KeychainAuthProvider(),
});
```

A custom provider owns loading and refreshing its credentials.

## Standalone PKCE Flow

[`oauth-example`](../oauth-example/) contains a complete localhost PKCE flow:

```bash
cd oauth-example
npm install
CHATGPT_OAUTH_BROWSER=Safari npm run login
npm test
```

The example:

1. Creates a PKCE verifier and SHA-256 challenge.
2. Opens the OpenAI authorization page.
3. Validates the callback state.
4. Exchanges the authorization code.
5. Stores access and refresh tokens in an ignored file with mode `0600`.
6. Verifies live AI SDK calls.

The localhost implementation is a development reference. Production applications
should use platform-appropriate encrypted credential storage and callback
handling.

## Security

- Never commit tokens, `.codex/auth.json`, `.env`, or `oauth-tokens.json`.
- Treat access and refresh tokens like passwords.
- Do not print `Authorization` headers in logs.
- Restrict credential-file permissions.
- Use only trusted `baseURL` values because OAuth headers are sent to that host.
- Revoke or replace credentials when they may have been exposed.
