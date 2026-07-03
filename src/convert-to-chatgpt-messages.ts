import type { LanguageModelV4Prompt, SharedV4Warning } from '@ai-sdk/provider';
import type { ChatGPTMessage } from './chatgpt-oauth-settings';

export function convertToChatGPTMessages({
  prompt,
  systemMessageMode = 'user',
}: {
  prompt: LanguageModelV4Prompt;
  systemMessageMode?: 'user' | 'system';
}): {
  messages: ChatGPTMessage[];
  warnings: SharedV4Warning[];
} {
  const warnings: SharedV4Warning[] = [];
  const messages: ChatGPTMessage[] = [];

  for (const message of prompt) {
    switch (message.role) {
      case 'system': {
        if (systemMessageMode === 'user') {
          messages.push({
            role: 'user',
            content: message.content,
          });

          warnings.push({
            type: 'other',
            message: 'System messages are converted to user messages',
          });
        } else {
          messages.push({
            role: 'user',
            content: message.content,
          });
        }
        break;
      }

      case 'user': {
        if (message.content.length === 1 && message.content[0].type === 'text') {
          messages.push({
            role: 'user',
            content: message.content[0].text,
          });
        } else {
          const parts: string[] = [];

          for (const part of message.content) {
            switch (part.type) {
              case 'text': {
                parts.push(part.text);
                break;
              }

              case 'file': {
                warnings.push({
                  type: 'unsupported',
                  feature: `file-input:${part.mediaType}`,
                  details: 'The ChatGPT OAuth provider serializes file inputs as text placeholders',
                });
                if (part.mediaType.startsWith('image/')) {
                  switch (part.data.type) {
                    case 'url':
                      parts.push(`[Image: ${part.data.url.href}]`);
                      break;
                    case 'data': {
                      const base64 =
                        typeof part.data.data === 'string'
                          ? part.data.data
                          : convertUint8ArrayToBase64(part.data.data);
                      parts.push(`[Image: data:${part.mediaType};base64,${base64}]`);
                      break;
                    }
                    default:
                      parts.push(`[Image: ${part.filename ?? 'unsupported image reference'}]`);
                      warnings.push({
                        type: 'unsupported',
                        feature: `file-data:${part.data.type}`,
                        details: 'ChatGPT OAuth only supports inline or URL image inputs',
                      });
                  }
                } else {
                  const text =
                    part.data.type === 'text'
                      ? `\n${part.data.text}`
                      : part.data.type === 'url'
                        ? `: ${part.data.url.href}`
                        : '';
                  parts.push(`[File: ${part.filename || 'unnamed'}]${text}`);
                }
                break;
              }

              default: {
                const unknownPart = part as { type: string };
                warnings.push({
                  type: 'other',
                  message: `Unsupported content part type: ${unknownPart.type}`,
                });
              }
            }
          }

          messages.push({
            role: 'user',
            content: parts.join('\n'),
          });
        }
        break;
      }

      case 'assistant': {
        let content: string | null = null;

        if (message.content.length > 0) {
          const textParts = message.content
            .filter((part) => part.type === 'text')
            .map((part) => part.text);

          if (textParts.length > 0) {
            content = textParts.join('');
          }
        }

        const chatGPTMessage: ChatGPTMessage = {
          role: 'assistant',
          content,
        };

        if (message.content.some((part) => part.type === 'tool-call')) {
          const toolCalls = message.content
            .filter((part) => part.type === 'tool-call')
            .map((part) => ({
              id: part.toolCallId,
              type: 'function' as const,
              function: {
                name: part.toolName,
                arguments: JSON.stringify(part.input),
              },
            }));

          if (toolCalls.length > 0) {
            chatGPTMessage.tool_calls = toolCalls;
          }
        }

        for (const part of message.content) {
          if (part.type !== 'text' && part.type !== 'tool-call' && part.type !== 'reasoning') {
            warnings.push({
              type: 'unsupported',
              feature: `assistant-content:${part.type}`,
              details: 'This assistant content part is omitted from the ChatGPT OAuth request',
            });
          }
        }

        messages.push(chatGPTMessage);
        break;
      }

      case 'tool': {
        for (const toolResponse of message.content) {
          if (toolResponse.type === 'tool-approval-response') {
            warnings.push({
              type: 'unsupported',
              feature: 'tool-approval-response',
              details: 'ChatGPT OAuth does not support provider-side tool approvals',
            });
            continue;
          }

          let content: string;
          switch (toolResponse.output.type) {
            case 'text':
            case 'error-text':
              content = toolResponse.output.value;
              break;
            case 'json':
            case 'error-json':
              content = JSON.stringify(toolResponse.output.value);
              break;
            case 'execution-denied':
              content = toolResponse.output.reason
                ? `Tool execution denied: ${toolResponse.output.reason}`
                : 'Tool execution denied';
              break;
            case 'content':
              content = toolResponse.output.value
                .map((part) => (part.type === 'text' ? part.text : `[${part.type}]`))
                .join('\n');
              break;
          }
          messages.push({
            role: 'tool',
            content,
            tool_call_id: toolResponse.toolCallId,
          });
        }
        break;
      }

      default: {
        const unknownMessage = message as { role: string };
        warnings.push({
          type: 'other',
          message: `Unsupported message role: ${unknownMessage.role}`,
        });
      }
    }
  }

  return { messages, warnings };
}

function convertUint8ArrayToBase64(array: Uint8Array): string {
  return Buffer.from(array).toString('base64');
}
