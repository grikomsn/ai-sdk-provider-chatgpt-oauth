import type { LanguageModelV4FunctionTool } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { prepareChatGPTTools } from '../chatgpt-oauth-prepare-tools';
import { mapChatGPTFinishReason } from '../map-chatgpt-finish-reason';
import { validateToolResponse } from '../tool-response-schemas';

const inputSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const;

function functionTool(name: string): LanguageModelV4FunctionTool {
  return {
    type: 'function',
    name,
    inputSchema,
  };
}

describe('prepareChatGPTTools', () => {
  it('maps command and planning tools to the Codex schemas', () => {
    const result = prepareChatGPTTools({
      tools: [functionTool('bash'), functionTool('project_plan')],
    });

    expect(result.tools?.map(({ name }) => name)).toEqual(['shell', 'update_plan']);
    expect(result.toolChoice).toBe('auto');
    expect(result.toolMapping).toEqual(
      new Map([
        ['shell', 'bash'],
        ['update_plan', 'project_plan'],
      ])
    );
    expect(result.warnings).toEqual([]);
  });

  it('omits unsupported tools and warns for a specific tool choice', () => {
    const result = prepareChatGPTTools({
      tools: [functionTool('weather')],
      toolChoice: {
        type: 'tool',
        toolName: 'weather',
      },
    });

    expect(result.tools).toEqual([]);
    expect(result.toolChoice).toBe('auto');
    expect(result.warnings).toEqual([
      {
        type: 'unsupported',
        feature: 'tool:weather',
        details: 'ChatGPT backend only supports shell and update_plan tools',
      },
      {
        type: 'unsupported',
        feature: 'toolChoice',
        details: 'Specific tool choice is not supported',
      },
    ]);
  });
});

describe('validateToolResponse', () => {
  it('validates shell and update_plan payloads', () => {
    expect(validateToolResponse('shell', '{"command":["pwd"],"timeout":1000}')).toEqual({
      command: ['pwd'],
      timeout: 1000,
    });
    expect(
      validateToolResponse(
        'update_plan',
        '{"plan":[{"step":"Test","status":"in_progress"}],"explanation":"Starting"}'
      )
    ).toEqual({
      plan: [{ step: 'Test', status: 'in_progress' }],
      explanation: 'Starting',
    });
  });

  it('reports invalid JSON and schema changes clearly', () => {
    expect(() => validateToolResponse('shell', '{')).toThrow(
      "Failed to parse tool arguments as JSON for tool 'shell'"
    );
    expect(() => validateToolResponse('shell', '{"command":"pwd"}')).toThrow(
      "unexpected format for 'shell' tool"
    );
  });
});

describe('mapChatGPTFinishReason', () => {
  it.each([
    ['completed', 'stop'],
    ['max_tokens', 'length'],
    ['function_call', 'tool-calls'],
    ['content_filter', 'content-filter'],
    ['error', 'error'],
    ['future-status', 'other'],
    [undefined, 'other'],
  ] as const)('maps %s to %s', (raw, unified) => {
    expect(mapChatGPTFinishReason(raw)).toEqual({
      unified,
      raw,
    });
  });
});
