# Standalone ChatGPT OAuth Example

This directory demonstrates a local OAuth 2.0 PKCE flow without requiring the
Codex CLI. It is a development reference, not a production authentication
service.

## Quick Start

From the repository root:

```bash
npm run build
cd oauth-example
npm ci
CHATGPT_OAUTH_BROWSER=Safari npm run login
npm test
```

The login command opens the authorization page, validates the callback state,
exchanges the authorization code, and stores tokens in an ignored local file
with mode `0600`.

Available commands:

```bash
npm run login
npm run status
npm run logout
npm test
npm run example
npm run typecheck
```

## How It Works

1. `OAuthClient` creates a PKCE verifier, SHA-256 challenge, and random state.
2. `OAuthCallbackServer` listens on `localhost:1455`.
3. The browser completes authorization.
4. The callback server verifies state and returns the authorization code.
5. `OAuthClient` exchanges the code for access and refresh tokens.
6. `TokenManager` stores and refreshes credentials.

The integration test makes live AI SDK calls with the stored credentials. It
therefore consumes account quota and requires access to the tested models.

## Headless Environments

When a browser cannot open automatically, the CLI offers either:

- Paste the complete callback URL after authorizing in another browser.
- Run the callback server through SSH port forwarding:

  ```bash
  ssh -L 1455:localhost:1455 user@server
  ```

## Configuration

Defaults are suitable for local development. Override them in an ignored `.env`
file when needed:

```env
OAUTH_CLIENT_ID=app_EMoamEEZ73f0CkXaXp7hrann
OAUTH_ISSUER=https://auth.openai.com
OAUTH_REDIRECT_PORT=1455
TOKEN_STORAGE_PATH=./oauth-tokens.json
CHATGPT_OAUTH_BROWSER=Safari
DEBUG=false
```

## Provider Usage

```typescript
import { generateText } from 'ai';
import { createChatGPTOAuth } from '@grikomsn/ai-sdk-provider-chatgpt-oauth';
import { TokenManager } from './src/token-manager.js';

const tokenManager = new TokenManager();
const credentials = await tokenManager.getCredentials();
const chatgpt = createChatGPTOAuth({ credentials });

const result = await generateText({
  model: chatgpt('gpt-5.5'),
  prompt: 'Reply with a short greeting.',
});

console.log(result.text);
```

## Security

- Never commit `.env`, `oauth-tokens.json`, Codex credentials, or callback URLs.
- Treat access and refresh tokens like passwords.
- Use encrypted platform credential storage in production.
- Keep state validation and PKCE verification in any derived implementation.
- Use HTTPS and platform-appropriate callback handling outside localhost.
- Revoke or replace credentials that may have been exposed.

## Troubleshooting

- **Port already in use:** stop the process using port 1455 or change
  `OAUTH_REDIRECT_PORT`.
- **State mismatch:** restart the login flow; do not reuse an old callback URL.
- **Token refresh failed:** run `npm run login` again.
- **Model unavailable:** select a model listed for the authenticated workspace.

References: [OAuth 2.0](https://www.rfc-editor.org/rfc/rfc6749),
[PKCE](https://www.rfc-editor.org/rfc/rfc7636), and
[AI SDK](https://ai-sdk.dev/).
