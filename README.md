# ChatGPT OAuth Provider for AI SDK 7

An ESM-only [Vercel AI SDK](https://ai-sdk.dev/) v7 provider for using models
available to a ChatGPT account through Codex OAuth.

> This community provider uses ChatGPT's Codex backend rather than the public
> OpenAI API. The endpoint and available models can change without notice.
> Review the
> [limitations](https://github.com/grikomsn/ai-sdk-provider-chatgpt-oauth/blob/main/docs/limitations.md)
> before using it in production.

## Features

- Native AI SDK 7 `ProviderV4` and `LanguageModelV4` implementation
- Text generation, reasoning summaries, streaming, usage, and tool-call events
- PKCE OAuth, automatic token refresh, environment variables, or Codex CLI credentials
- Live model catalog lookup, including the exact instructions required by each model
- Zod 3.25.76+ and Zod 4.1.8+ compatibility
- Node.js 22+, ESM-only package

## Install

```bash
npm install ai@7 @grikomsn/ai-sdk-provider-chatgpt-oauth
```

## Authenticate

The quickest option is to sign in with the Codex CLI:

```bash
npm install --global @openai/codex
codex login
```

The provider reads `~/.codex/auth.json` by default. It also supports:

- A standalone
  [PKCE OAuth example](https://github.com/grikomsn/ai-sdk-provider-chatgpt-oauth/tree/main/oauth-example)
- `CHATGPT_OAUTH_ACCESS_TOKEN`, `CHATGPT_OAUTH_ACCOUNT_ID`, and optional
  `CHATGPT_OAUTH_REFRESH_TOKEN` environment variables
- Direct `credentials`
- A custom `AuthProvider`

Never commit OAuth tokens or Codex authentication files.

## Generate Text

```typescript
import { generateText } from 'ai';
import { createChatGPTOAuth } from '@grikomsn/ai-sdk-provider-chatgpt-oauth';

const chatgpt = createChatGPTOAuth();

const result = await generateText({
  model: chatgpt('gpt-5.5'),
  prompt: 'Write a haiku about TypeScript.',
});

console.log(result.text);
console.log(result.usage);
```

## Stream Text

```typescript
import { streamText } from 'ai';
import { createChatGPTOAuth } from '@grikomsn/ai-sdk-provider-chatgpt-oauth';

const result = streamText({
  model: createChatGPTOAuth()('gpt-5.5'),
  prompt: 'Explain OAuth PKCE in three short paragraphs.',
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

## Provider Registry

The provider implements the complete AI SDK 7 `ProviderV4` registry contract:

```typescript
import { createProviderRegistry } from 'ai';
import { createChatGPTOAuth } from '@grikomsn/ai-sdk-provider-chatgpt-oauth';

const registry = createProviderRegistry({
  chatgpt: createChatGPTOAuth(),
});

const model = registry.languageModel('chatgpt:gpt-5.5');
```

Only language models are available. Registry requests for embedding or image
models throw AI SDK's `NoSuchModelError`.

## Reasoning

Use AI SDK 7's call-level `reasoning` option:

```typescript
const result = await generateText({
  model: chatgpt('gpt-5.5'),
  reasoning: 'high',
  prompt: 'Analyze this concurrency bug.',
});
```

Provider defaults can also be configured per provider or model:

```typescript
const chatgpt = createChatGPTOAuth({
  reasoningEffort: 'medium',
  reasoningSummary: 'auto',
});

const model = chatgpt('gpt-5.5', {
  reasoningEffort: 'xhigh',
});
```

See the
[reasoning options](https://github.com/grikomsn/ai-sdk-provider-chatgpt-oauth/blob/main/docs/reasoning.md).

## Tools

This provider currently maps command tools to the Codex `shell` tool and planning
tools to `update_plan`. Other custom function tools are returned as unsupported
warnings.

```typescript
import { generateText, tool } from 'ai';
import { z } from 'zod';

const result = await generateText({
  model: chatgpt('gpt-5.5'),
  prompt: 'List TypeScript files in the current directory.',
  tools: {
    shell: tool({
      description: 'Run a command',
      inputSchema: z.object({
        command: z.array(z.string()),
      }),
      execute: async ({ command }) => runSandboxed(command),
    }),
  },
});
```

Only execute model-provided commands inside an appropriate sandbox. See
[tool calling](https://github.com/grikomsn/ai-sdk-provider-chatgpt-oauth/blob/main/docs/tool-calling.md).

## Models

The provider fetches `/codex/models` for the authenticated account and caches the
selected model's required instructions. It therefore follows account entitlements
instead of maintaining a permanently hard-coded allowlist.

Verified on July 3, 2026:

| Model          | Context window | Live verification             |
| -------------- | -------------: | ----------------------------- |
| `gpt-5.5`      |        372,000 | Text generation and streaming |
| `gpt-5.4`      |        272,000 | Text generation               |
| `gpt-5.4-mini` |        272,000 | Catalog availability          |

Other IDs are accepted by the TypeScript API, but calls fail with
`MODEL_NOT_AVAILABLE` when the account catalog does not contain them.

## Configuration

| Option             | Type                       | Description                                                 |
| ------------------ | -------------------------- | ----------------------------------------------------------- |
| `baseURL`          | `string`                   | API base URL; defaults to `https://chatgpt.com/backend-api` |
| `headers`          | `Record<string, string>`   | Additional request headers                                  |
| `fetch`            | `FetchFunction`            | Custom fetch implementation                                 |
| `credentials`      | `ChatGPTOAuthCredentials`  | Direct OAuth credentials                                    |
| `credentialsPath`  | `string`                   | Codex auth path; defaults to `~/.codex/auth.json`           |
| `authProvider`     | `AuthProvider`             | Custom credential source                                    |
| `autoRefresh`      | `boolean`                  | Refresh expiring credentials; defaults to `true`            |
| `reasoningEffort`  | `ReasoningEffort \| null`  | Default reasoning effort                                    |
| `reasoningSummary` | `ReasoningSummary \| null` | Default reasoning summary                                   |
| `instructions`     | `string`                   | Override catalog instructions for custom backends           |

## Unsupported Settings

The Codex backend currently ignores or rejects several standard language-model
settings. The provider emits AI SDK warnings for `temperature`, `topP`, and
`maxOutputTokens`. Structured output APIs are not supported; use text generation,
parse the result, and validate it in application code.

See the
[limitations](https://github.com/grikomsn/ai-sdk-provider-chatgpt-oauth/blob/main/docs/limitations.md)
and
[JSON formatting](https://github.com/grikomsn/ai-sdk-provider-chatgpt-oauth/blob/main/docs/json-formatting.md)
guides.

## Errors

```typescript
import { ChatGPTOAuthError } from '@grikomsn/ai-sdk-provider-chatgpt-oauth';

try {
  await generateText({
    model: chatgpt('gpt-5.5'),
    prompt: 'Hello',
  });
} catch (error) {
  if (error instanceof ChatGPTOAuthError) {
    console.error(error.code, error.statusCode, error.message);
  }
}
```

## Development

```bash
npm ci
npm run check
npm run test:coverage
```

`npm run check` verifies formatting, lint, library and example typechecking,
deterministic unit/integration tests, the package build, and the exact tarball
contents. Live OAuth verification is separate:

```bash
cd oauth-example
npm install
CHATGPT_OAUTH_BROWSER=Safari npm run login
npm test
```

Changesets manages versions and changelog entries. Add a changeset with
`npm run changeset` in every pull request that changes the published package.
Merging the automated release pull request publishes through npm trusted
publishing; the workflow stores no npm token.

Report security issues privately as described in
[SECURITY.md](https://github.com/grikomsn/ai-sdk-provider-chatgpt-oauth/security/policy).

## Ownership

This maintained fork uses the `@grikomsn` package scope and lives at
[grikomsn/ai-sdk-provider-chatgpt-oauth](https://github.com/grikomsn/ai-sdk-provider-chatgpt-oauth).
The original work by Ben Vargas remains credited in the package metadata and
license.

## License

MIT
