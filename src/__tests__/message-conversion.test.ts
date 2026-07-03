import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { convertToChatGPTMessages } from '../convert-to-chatgpt-messages';

describe('convertToChatGPTMessages', () => {
  it('converts system, text, assistant, and tool messages', () => {
    const prompt = [
      {
        role: 'system',
        content: 'Follow the repository rules.',
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'Inspect the project.' }],
      },
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'I should inspect it.' },
          { type: 'text', text: 'I will inspect it.' },
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'shell',
            input: { command: ['pwd'] },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'shell',
            output: { type: 'json', value: { cwd: '/workspace' } },
          },
        ],
      },
    ] satisfies LanguageModelV4Prompt;

    const result = convertToChatGPTMessages({ prompt });

    expect(result.messages).toEqual([
      {
        role: 'user',
        content: 'Follow the repository rules.',
      },
      {
        role: 'user',
        content: 'Inspect the project.',
      },
      {
        role: 'assistant',
        content: 'I will inspect it.',
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'shell',
              arguments: '{"command":["pwd"]}',
            },
          },
        ],
      },
      {
        role: 'tool',
        content: '{"cwd":"/workspace"}',
        tool_call_id: 'call-1',
      },
    ]);
    expect(result.warnings).toContainEqual({
      type: 'other',
      message: 'System messages are converted to user messages',
    });
  });

  it('serializes supported file inputs and warns for references', () => {
    const prompt = [
      {
        role: 'user',
        content: [
          {
            type: 'file',
            filename: 'photo.png',
            mediaType: 'image/png',
            data: {
              type: 'url',
              url: new URL('https://example.com/photo.png'),
            },
          },
          {
            type: 'file',
            filename: 'notes.txt',
            mediaType: 'text/plain',
            data: {
              type: 'text',
              text: 'hello',
            },
          },
          {
            type: 'file',
            filename: 'stored.png',
            mediaType: 'image/png',
            data: {
              type: 'reference',
              reference: { example: 'file-1' },
            },
          },
        ],
      },
    ] satisfies LanguageModelV4Prompt;

    const result = convertToChatGPTMessages({ prompt });

    expect(result.messages).toEqual([
      {
        role: 'user',
        content: [
          '[Image: https://example.com/photo.png]',
          '[File: notes.txt]\nhello',
          '[Image: stored.png]',
        ].join('\n'),
      },
    ]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'unsupported',
          feature: 'file-input:image/png',
        }),
        expect.objectContaining({
          type: 'unsupported',
          feature: 'file-input:text/plain',
        }),
        expect.objectContaining({
          type: 'unsupported',
          feature: 'file-data:reference',
        }),
      ])
    );
  });

  it('omits tool approval responses with a warning', () => {
    const prompt = [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-approval-response',
            approvalId: 'approval-1',
            approved: false,
            reason: 'Not allowed',
          },
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'shell',
            output: {
              type: 'execution-denied',
              reason: 'Not allowed',
            },
          },
        ],
      },
    ] satisfies LanguageModelV4Prompt;

    const result = convertToChatGPTMessages({ prompt });

    expect(result.messages).toEqual([
      {
        role: 'tool',
        content: 'Tool execution denied: Not allowed',
        tool_call_id: 'call-1',
      },
    ]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'unsupported',
        feature: 'tool-approval-response',
      })
    );
  });
});
