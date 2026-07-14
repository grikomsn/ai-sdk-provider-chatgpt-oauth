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

Provider- and model-level `reasoningEffort` also accept `max` for models that
advertise it. `max` is not currently part of AI SDK 7's standard call-level
union, so configure it on the provider or selected model instead.

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

During verification on July 15, 2026, GPT-5.6 Luna, Terra, and Sol advertised
`low`, `medium`, `high`, `xhigh`, and `max`. Sol and Terra also advertised
`ultra`, which is a Codex client orchestration mode rather than a direct
reasoning effort; direct provider requests must use `max` or lower. Catalog
capabilities can vary by account and change over time.

When reasoning is enabled, the provider requests encrypted reasoning content and
maps summary text to AI SDK V4 reasoning parts. Usage maps cached input and
reasoning output tokens into AI SDK 7's detailed usage fields.
