export type ChatGPTOAuthModelId =
  | 'gpt-5.5'
  | 'gpt-5.4'
  | 'gpt-5.4-mini'
  | 'gpt-5'
  | 'gpt-5-codex'
  | 'codex-mini-latest'
  | (string & {});

export const chatGPTOAuthModels = {
  'gpt-5.5': {
    contextWindow: 372000,
    supportsReasoning: true,
  },
  'gpt-5.4': {
    contextWindow: 272000,
    supportsReasoning: true,
  },
  'gpt-5.4-mini': {
    contextWindow: 272000,
    supportsReasoning: true,
  },
} as const;

export interface ChatGPTModelInfo {
  slug: string;
  base_instructions?: string;
  context_window?: number;
  visibility?: 'list' | 'hide' | 'none' | string;
}

export interface ChatGPTModelsResponse {
  models: ChatGPTModelInfo[];
}

export interface ChatGPTMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_calls?: ChatGPTToolCall[];
  tool_call_id?: string;
}

export interface ChatGPTToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatGPTTool {
  type: 'function';
  name: string;
  description: string;
  strict: boolean;
  parameters: Record<string, unknown>;
}

export type ChatGPTToolChoice =
  'none' | 'auto' | 'required' | { type: 'function'; function: { name: string } };

// Reasoning types based on OpenAI's reasoning API
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
export type ReasoningSummary = 'auto' | 'none' | 'concise' | 'detailed';

export interface ChatGPTReasoning {
  effort: ReasoningEffort;
  summary?: ReasoningSummary;
}

export interface ChatGPTRequest {
  model: string;
  instructions: string;
  input: ChatGPTMessage[];
  tools?: ChatGPTTool[];
  tool_choice?: ChatGPTToolChoice;
  parallel_tool_calls: boolean;
  reasoning: ChatGPTReasoning | null;
  store: boolean;
  stream: boolean;
  include: string[];
}

export interface ChatGPTOAuthCredentials {
  accessToken: string;
  refreshToken?: string;
  accountId: string;
  expiresAt?: number;
}
