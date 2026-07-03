import type { LanguageModelV4FinishReason } from '@ai-sdk/provider';

export function mapChatGPTFinishReason(
  finishReason: string | null | undefined
): LanguageModelV4FinishReason {
  let unified: LanguageModelV4FinishReason['unified'];

  switch (finishReason) {
    case 'stop':
    case 'completed': // ChatGPT backend uses 'completed' status
      unified = 'stop';
      break;
    case 'length':
    case 'max_tokens':
      unified = 'length';
      break;
    case 'tool_calls':
    case 'function_call':
      unified = 'tool-calls';
      break;
    case 'content_filter':
      unified = 'content-filter';
      break;
    case 'failed':
    case 'error':
      unified = 'error';
      break;
    default:
      unified = 'other';
  }

  return {
    unified,
    raw: finishReason ?? undefined,
  };
}
