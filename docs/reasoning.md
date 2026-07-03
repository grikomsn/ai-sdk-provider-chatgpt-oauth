# Reasoning

Reasoning-capable models default to `medium` effort and an `auto` summary, matching
the Codex CLI behavior used by this provider.

## AI SDK 7 Call Option

The standard AI SDK 7 `reasoning` option overrides the configured default:

```typescript
import { generateText } from 'ai';
import { createChatGPTOAuth } from '@grikomsn/ai-sdk-provider-chatgpt-oauth';

const chatgpt = createChatGPTOAuth();

const result = await generateText({
  model: chatgpt('gpt-5.5'),
  reasoning: 'high',
  prompt: 'Prove that the square root of two is irrational.',
});

console.log(result.finalStep.reasoningText);
```

Accepted AI SDK values are `provider-default`, `none`, `minimal`, `low`,
`medium`, `high`, and `xhigh`. Individual models can support only a subset. The
backend returns an error for an unavailable effort.

## Provider Defaults

Set a default for every model created by a provider:

```typescript
const chatgpt = createChatGPTOAuth({
  reasoningEffort: 'high',
  reasoningSummary: 'detailed',
});
```

Or override it when selecting a model:

```typescript
const model = chatgpt('gpt-5.5', {
  reasoningEffort: 'xhigh',
  reasoningSummary: 'auto',
});
```

Set `reasoningEffort: null` to omit reasoning configuration:

```typescript
const model = chatgpt('gpt-5.5', {
  reasoningEffort: null,
  reasoningSummary: null,
});
```

## Current Catalog

During verification on July 3, 2026, `gpt-5.5`, `gpt-5.4`, and
`gpt-5.4-mini` advertised `low`, `medium`, `high`, and `xhigh`. Catalog
capabilities can vary by account and change over time.

When reasoning is enabled, the provider requests encrypted reasoning content and
maps summary text to AI SDK V4 reasoning parts. Usage maps cached input and
reasoning output tokens into AI SDK 7's detailed usage fields.
