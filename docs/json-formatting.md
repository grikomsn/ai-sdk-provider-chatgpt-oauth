# JSON Formatting

The ChatGPT Codex backend does not currently support AI SDK structured response
formats. Use ordinary text generation followed by parsing and validation.

```typescript
import { generateText } from 'ai';
import { z } from 'zod';

const profileSchema = z.object({
  name: z.string(),
  age: z.number().int().nonnegative(),
  email: z.string().email(),
});

const result = await generateText({
  model: chatgpt('gpt-5.5'),
  prompt: `
Return only a JSON object with this shape:
{"name":"string","age":0,"email":"string"}
`,
});

const profile = profileSchema.parse(JSON.parse(result.text));
```

## Production Pattern

Treat model output as untrusted:

1. Remove Markdown fences only when your prompt permits them.
2. Parse with `JSON.parse`.
3. Validate with Zod or another schema library.
4. Return a useful error when parsing or validation fails.
5. Retry only with a strict attempt limit.

```typescript
async function generateValidatedJson<T>(prompt: string, schema: z.ZodType<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await generateText({
        model: chatgpt('gpt-5.5'),
        prompt: `${prompt}\nReturn JSON only. No Markdown fences.`,
      });
      return schema.parse(JSON.parse(result.text));
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error('The model did not return valid JSON', {
    cause: lastError,
  });
}
```

Prompted JSON is not equivalent to constrained decoding. Use the official OpenAI
provider when schema-constrained output is a hard requirement.
