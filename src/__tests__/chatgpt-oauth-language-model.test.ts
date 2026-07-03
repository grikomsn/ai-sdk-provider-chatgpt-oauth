import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { generateText, streamText } from 'ai';
import type { SharedV4Warning } from '@ai-sdk/provider';
import { ChatGPTOAuthLanguageModel } from '../chatgpt-oauth-language-model';
import type { AuthProvider } from '../auth';
import type { ChatGPTRequest } from '../chatgpt-oauth-settings';
import { createChatGPTOAuth } from '../chatgpt-oauth-provider';

class MockAuthProvider implements AuthProvider {
  async getCredentials() {
    return {
      accessToken: 'test-token',
      accountId: 'test-account',
    };
  }
}

const prompt = [
  {
    role: 'user' as const,
    content: [
      {
        type: 'text' as const,
        text: 'Say hello to the new model.',
      },
    ],
  },
];

const baseInstructionsPath = join(__dirname, '..', 'codex-instructions.txt');
const codexInstructionsPath = join(__dirname, '..', 'codex-gpt5-codex-instructions.txt');
const applyPatchInstructionsPath = join(__dirname, '..', 'codex-apply-patch-instructions.txt');

const baseInstructions = readFileSync(baseInstructionsPath, 'utf8');
const codexInstructions = readFileSync(codexInstructionsPath, 'utf8');
const applyPatchInstructions = readFileSync(applyPatchInstructionsPath, 'utf8');

const BASE_PROMPT_HASH = '8441530b38aba0ba999aa3657b9906df803c92f4ed78e59ecc2895ac010a844d';
const GPT5_CODEX_PROMPT_HASH = 'beea8f974b13e5c241320afd71706b162e2006ef0e2f5b2bdcc7891743abbdd1';
const APPLY_PATCH_PROMPT_HASH = '061ad07965f437292a604be2518a6fe445c19324946f9e827fffa0a3e8695d94';
const GPT5_PROMPT_HASH = 'eefaf14fa9d709fe650181e6af8bdc781f9646bcc7ce36ccf99980fa781bcc86';

const baseHash = createHash('sha256').update(baseInstructions).digest('hex');
const codexHash = createHash('sha256').update(codexInstructions).digest('hex');
const applyPatchHash = createHash('sha256').update(applyPatchInstructions).digest('hex');

if (baseHash !== BASE_PROMPT_HASH) {
  throw new Error('Base Codex instructions are out of sync with Codex CLI prompt.md');
}

if (codexHash !== GPT5_CODEX_PROMPT_HASH) {
  throw new Error('GPT-5 Codex instructions are out of sync with Codex CLI gpt_5_codex_prompt.md');
}

if (applyPatchHash !== APPLY_PATCH_PROMPT_HASH) {
  throw new Error(
    'Apply patch instructions are out of sync with Codex CLI apply_patch_tool_instructions.md'
  );
}

function createModel(modelId: string) {
  return new ChatGPTOAuthLanguageModel(modelId, {
    provider: 'chatgpt-oauth',
    baseURL: 'https://chatgpt.com/backend-api',
    headers: {},
    authProvider: new MockAuthProvider(),
  });
}

describe('ChatGPTOAuthLanguageModel', () => {
  it('uses model-specific instructions for GPT-5 variants and codex models', async () => {
    const cases = [
      {
        modelId: 'gpt-5',
        expectedInstructions: [baseInstructions, applyPatchInstructions].join('\n'),
        expectedHash: GPT5_PROMPT_HASH,
      },
      {
        modelId: 'gpt-5-codex',
        expectedInstructions: codexInstructions,
        expectedHash: GPT5_CODEX_PROMPT_HASH,
      },
      {
        modelId: 'codex-mini-latest',
        expectedInstructions: codexInstructions,
        expectedHash: GPT5_CODEX_PROMPT_HASH,
      },
    ] as const;

    for (const testCase of cases) {
      const model = createModel(testCase.modelId);
      const exposedModel = model as unknown as ChatGPTOAuthLanguageModel & {
        getArgs: (options: { prompt: typeof prompt }) => Promise<{
          args: ChatGPTRequest;
          warnings: SharedV4Warning[];
          toolMapping: Map<string, string>;
        }>;
      };
      const args = await exposedModel.getArgs({ prompt });

      expect(args.args.model).toBe(testCase.modelId);
      expect(args.args.instructions).toBe(testCase.expectedInstructions);

      const hash = createHash('sha256').update(args.args.instructions).digest('hex');
      expect(hash).toBe(testCase.expectedHash);
    }
  });

  it('treats gpt-5-codex as a reasoning-capable model', () => {
    const model = createModel('gpt-5-codex');
    const exposedModel = model as unknown as ChatGPTOAuthLanguageModel & {
      supportsReasoning: () => boolean;
    };
    const supportsReasoning = exposedModel.supportsReasoning();

    expect(supportsReasoning).toBe(true);
  });

  it('implements the AI SDK v7 provider and language model V4 contracts', () => {
    const provider = createChatGPTOAuth({
      credentials: {
        accessToken: 'test-token',
        accountId: 'test-account',
      },
    });

    expect(provider.specificationVersion).toBe('v4');
    expect(provider('gpt-5').specificationVersion).toBe('v4');
  });

  it('generates text through AI SDK v7 with live model instructions and V4 usage', async () => {
    const requests: Array<{ url: string; body?: ChatGPTRequest }> = [];
    const fetch = createMockFetch(requests, [
      {
        type: 'response.reasoning_summary_text.delta',
        delta: 'Brief reasoning.',
      },
      {
        type: 'response.output_text.delta',
        delta: 'Hello from AI SDK 7.',
      },
      {
        type: 'response.completed',
        response: {
          status: 'completed',
          usage: {
            input_tokens: 12,
            output_tokens: 8,
            input_tokens_details: { cached_tokens: 2 },
            output_tokens_details: { reasoning_tokens: 3 },
          },
        },
      },
    ]);
    const provider = createChatGPTOAuth({
      credentials: {
        accessToken: 'test-token',
        accountId: 'test-account',
      },
      fetch,
    });

    const result = await generateText({
      model: provider('gpt-5.5'),
      prompt: 'Say hello.',
    });

    expect(result.text).toBe('Hello from AI SDK 7.');
    expect(result.finalStep.reasoningText).toBe('Brief reasoning.');
    expect(result.finishReason).toBe('stop');
    expect(result.usage).toMatchObject({
      inputTokens: 12,
      outputTokens: 8,
      totalTokens: 20,
      inputTokenDetails: {
        noCacheTokens: 10,
        cacheReadTokens: 2,
      },
      outputTokenDetails: {
        textTokens: 5,
        reasoningTokens: 3,
      },
    });
    expect(requests.map(({ url }) => url)).toEqual([
      'https://chatgpt.com/backend-api/codex/models?client_version=2.0.0',
      'https://chatgpt.com/backend-api/codex/responses',
    ]);
    expect(requests[1].body).toMatchObject({
      model: 'gpt-5.5',
      instructions: 'Current model instructions',
      stream: true,
    });
  });

  it('streams correctly framed V4 text parts through AI SDK v7', async () => {
    const requests: Array<{ url: string; body?: ChatGPTRequest }> = [];
    const fetch = createMockFetch(requests, [
      { type: 'response.output_text.delta', delta: 'Hello ' },
      { type: 'response.output_text.delta', delta: 'stream.' },
      {
        type: 'response.completed',
        response: {
          status: 'completed',
          usage: { input_tokens: 4, output_tokens: 2 },
        },
      },
    ]);
    const provider = createChatGPTOAuth({
      credentials: {
        accessToken: 'test-token',
        accountId: 'test-account',
      },
      fetch,
    });

    const result = streamText({
      model: provider('gpt-5.5'),
      prompt: 'Stream hello.',
    });
    const chunks: string[] = [];
    for await (const chunk of result.textStream) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['Hello ', 'stream.']);
    await expect(result.text).resolves.toBe('Hello stream.');
    await expect(result.finishReason).resolves.toBe('stop');
    await expect(result.usage).resolves.toMatchObject({
      inputTokens: 4,
      outputTokens: 2,
      totalTokens: 6,
    });
  });

  it('maps tool calls and emits complete V4 tool stream framing', async () => {
    const requests: Array<{ url: string; body?: ChatGPTRequest }> = [];
    const fetch = createMockFetch(requests, [
      {
        type: 'response.output_item.added',
        item: {
          id: 'call-1',
          type: 'function_call',
          name: 'shell',
        },
      },
      {
        type: 'response.function_call_arguments.delta',
        item_id: 'call-1',
        delta: '{"command":["pwd"]}',
      },
      {
        type: 'response.output_item.done',
        item: {
          id: 'call-1',
          type: 'function_call',
          name: 'shell',
          arguments: '{"command":["pwd"]}',
        },
      },
      {
        type: 'response.completed',
        response: {
          status: 'completed',
          usage: { input_tokens: 5, output_tokens: 3 },
        },
      },
    ]);
    const provider = createChatGPTOAuth({
      credentials: {
        accessToken: 'test-token',
        accountId: 'test-account',
      },
      fetch,
    });
    const model = provider('gpt-5.5');
    const options = {
      prompt,
      tools: [
        {
          type: 'function' as const,
          name: 'bash',
          inputSchema: {
            type: 'object' as const,
            properties: {
              command: {
                type: 'array' as const,
                items: { type: 'string' as const },
              },
            },
            required: ['command'],
          },
        },
      ],
    };

    const generated = await model.doGenerate(options);

    expect(generated.finishReason).toEqual({
      unified: 'tool-calls',
      raw: 'tool_calls',
    });
    expect(generated.content).toContainEqual({
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'bash',
      input: '{"command":["pwd"]}',
    });

    const { stream } = await model.doStream(options);
    const parts = [];
    for await (const part of stream) {
      parts.push(part);
    }

    expect(parts.map(({ type }) => type)).toEqual([
      'stream-start',
      'tool-input-start',
      'tool-input-delta',
      'tool-input-end',
      'tool-call',
      'finish',
    ]);
    expect(parts).toContainEqual({
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'bash',
      input: '{"command":["pwd"]}',
    });
    expect(requests.filter(({ url }) => url.includes('/codex/models'))).toHaveLength(1);
  });
});

function createMockFetch(
  requests: Array<{ url: string; body?: ChatGPTRequest }>,
  events: unknown[]
): typeof globalThis.fetch {
  return async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as ChatGPTRequest) : undefined;
    requests.push({ url, body });

    if (url.endsWith('/codex/models?client_version=2.0.0')) {
      return Response.json({
        models: [
          {
            slug: 'gpt-5.5',
            base_instructions: 'Current model instructions',
          },
        ],
      });
    }

    const sse = `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`;
    return new Response(sse, {
      headers: {
        'Content-Type': 'text/event-stream',
      },
    });
  };
}
