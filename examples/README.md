# Examples

These examples target AI SDK 7 and the current ChatGPT Codex model catalog.

## Authentication and Models

- `check-auth.ts` verifies that credentials can be loaded.
- `model-support.ts` calls the current `gpt-5.5`, `gpt-5.4`, and
  `gpt-5.4-mini` models.

## Text and Reasoning

- `basic-usage.ts` generates text.
- `streaming.ts` consumes AI SDK's `textStream`.
- `reasoning-effort.ts` compares reasoning effort levels.
- `basic-usage-gpt-5-4.ts` and `streaming-gpt-5-4.ts` target `gpt-5.4`.
- `instructions-gpt-5-4.ts` uses AI SDK 7's top-level `instructions`.

## Tools

- `tool-calling-basic.ts` maps a command tool to Codex `shell`.
- `tool-calling-stateless.ts` sends full conversation history on every call.
- `tool-calling-limitations.ts` demonstrates unsupported custom-tool warnings.

Model-generated commands are untrusted input. The examples are demonstrations;
production applications must use a proper sandbox.

## JSON

The working JSON examples use `generateText`, `JSON.parse`, and Zod validation:

- `generate-json-basic.ts`
- `generate-json-nested.ts`
- `generate-json-advanced.ts`
- `generate-json-basic-gpt-5-4.ts`

AI SDK structured-output examples are intentionally omitted because the Codex
backend does not currently support those response formats.

## Run

Authenticate with the Codex CLI first:

```bash
codex login
```

Then use the package scripts:

```bash
npm run example:auth
npm run example:models
npm run example:basic
npm run example:streaming
npm run example:reasoning
npm run example:tools
npm run example:basic-5-4
npm run example:streaming-5-4
npm run example:instructions-5-4
```

All example sources are checked without making network calls:

```bash
npm run typecheck:examples
```

For a fresh browser-based PKCE flow and live assertions, use
[`oauth-example`](../oauth-example/).
