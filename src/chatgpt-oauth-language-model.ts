import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
  LanguageModelV4Usage,
  SharedV4Warning,
} from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateToolResponse } from './tool-response-schemas';
import type {
  ChatGPTOAuthModelId,
  ChatGPTRequest,
  ChatGPTModelsResponse,
  ReasoningEffort,
  ReasoningSummary,
  ChatGPTReasoning,
} from './chatgpt-oauth-settings';
import { convertToChatGPTMessages } from './convert-to-chatgpt-messages';
import { prepareChatGPTTools } from './chatgpt-oauth-prepare-tools';
import { mapChatGPTFinishReason } from './map-chatgpt-finish-reason';
import type { AuthProvider } from './auth';
import { ChatGPTOAuthError } from './chatgpt-oauth-error';

// Load instructions file
function loadInstructions(filename: string, fallback: string): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    return readFileSync(join(__dirname, filename), 'utf8');
  } catch {
    return fallback;
  }
}

const baseInstructions = loadInstructions('codex-instructions.txt', 'You are a helpful assistant.');
const codexModelInstructions = loadInstructions(
  'codex-gpt5-codex-instructions.txt',
  baseInstructions
);
const applyPatchInstructions = loadInstructions('codex-apply-patch-instructions.txt', '');

type ChatGPTOAuthConfig = {
  provider: string;
  baseURL: string;
  headers: Record<string, string | undefined>;
  fetch?: FetchFunction;
  authProvider: AuthProvider;
  reasoningEffort?: ReasoningEffort | null;
  reasoningSummary?: ReasoningSummary | null;
  instructions?: string;
};

interface ChatGPTSseEvent {
  type?: string;
  delta?: string;
  status?: string;
  item_id?: string;
  item?: {
    id?: string;
    type?: string;
    name?: string;
    arguments?: string;
  };
  response?: {
    status?: string;
    usage?: ChatGPTUsage;
    error?: {
      message?: string;
    };
    incomplete_details?: {
      reason?: string;
    };
  };
}

interface ChatGPTUsage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
}

export class ChatGPTOAuthLanguageModel implements LanguageModelV4 {
  readonly specificationVersion = 'v4' as const;
  readonly modelId: ChatGPTOAuthModelId;
  readonly provider: string;
  readonly supportedUrls: Record<string, RegExp[]> = {};

  private readonly config: ChatGPTOAuthConfig;
  private instructionsPromise?: Promise<string>;

  constructor(modelId: ChatGPTOAuthModelId, config: ChatGPTOAuthConfig) {
    this.modelId = modelId;
    this.provider = config.provider;
    this.config = config;
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const credentials = await this.config.authProvider.getCredentials();

    return {
      Authorization: `Bearer ${credentials.accessToken}`,
      'chatgpt-account-id': credentials.accountId,
      'OpenAI-Beta': 'responses=experimental',
      originator: 'codex_cli_rs',
      session_id: this.generateSessionId(),
    };
  }

  private generateSessionId(): string {
    return randomUUID();
  }

  /**
   * Determine if reasoning should be enabled for the model.
   * Reasoning is supported for gpt-5 and codex models.
   */
  private supportsReasoning(): boolean {
    const modelName = this.modelId.toLowerCase();
    return (
      modelName.startsWith('gpt-5') || modelName.startsWith('codex') || modelName.startsWith('o')
    ); // o3, o4 etc if they get OAuth support
  }

  /**
   * Create reasoning parameter for the request.
   * For reasoning-capable models, defaults to medium effort and auto summary (matching Codex CLI).
   * Returns null if reasoning is not supported or explicitly disabled.
   */
  private createReasoningParam(
    callReasoning?: LanguageModelV4CallOptions['reasoning']
  ): ChatGPTReasoning | null {
    // If model doesn't support reasoning, don't send reasoning params
    if (!this.supportsReasoning()) {
      return null;
    }

    if (callReasoning === 'none' || this.config.reasoningEffort === null) {
      return null;
    }

    const effort =
      callReasoning && callReasoning !== 'provider-default'
        ? callReasoning
        : (this.config.reasoningEffort ?? 'medium');
    const summary = this.config.reasoningSummary ?? 'auto';

    // If summary is explicitly null, omit it
    if (summary === null) {
      return { effort, summary: undefined };
    }

    // Pass through exactly what the user specified
    // Let the API decide what's valid - this ensures future compatibility
    return {
      effort,
      summary,
    };
  }

  private getLegacyInstructions(): string | undefined {
    const modelName = this.modelId.toLowerCase();
    if (modelName.startsWith('codex-') || modelName.startsWith('gpt-5-codex')) {
      return codexModelInstructions;
    }

    if (modelName === 'gpt-5' && applyPatchInstructions) {
      return [baseInstructions, applyPatchInstructions].join('\n');
    }

    return undefined;
  }

  private async getInstructions(authHeaders: Record<string, string>): Promise<string> {
    if (this.config.instructions !== undefined) {
      return this.config.instructions;
    }

    const legacyInstructions = this.getLegacyInstructions();
    if (legacyInstructions !== undefined) {
      return legacyInstructions;
    }

    if (!this.instructionsPromise) {
      this.instructionsPromise = this.fetchModelInstructions(authHeaders);
    }

    try {
      return await this.instructionsPromise;
    } catch (error) {
      this.instructionsPromise = undefined;
      throw error;
    }
  }

  private async fetchModelInstructions(authHeaders: Record<string, string>): Promise<string> {
    const response = await (this.config.fetch ?? globalThis.fetch)(
      `${this.config.baseURL}/codex/models?client_version=2.0.0`,
      {
        headers: {
          Accept: 'application/json',
          ...this.config.headers,
          ...authHeaders,
        },
      }
    );

    if (!response.ok) {
      throw new ChatGPTOAuthError(
        `Unable to load the ChatGPT model catalog: ${response.status} ${response.statusText}`,
        'MODEL_CATALOG_ERROR',
        response.status
      );
    }

    const catalog = (await response.json()) as ChatGPTModelsResponse;
    const model = catalog.models?.find(({ slug }) => slug === this.modelId);
    if (!model?.base_instructions) {
      const availableModels = catalog.models?.map(({ slug }) => slug).join(', ');
      throw new ChatGPTOAuthError(
        `Model '${this.modelId}' is not available for this ChatGPT account.${
          availableModels ? ` Available models: ${availableModels}` : ''
        }`,
        'MODEL_NOT_AVAILABLE'
      );
    }

    return model.base_instructions;
  }

  private async getArgs(options: LanguageModelV4CallOptions, authHeaders: Record<string, string>) {
    const warnings: SharedV4Warning[] = [];

    const { messages: chatgptMessages, warnings: messageWarnings } = convertToChatGPTMessages({
      prompt: options.prompt,
      systemMessageMode: 'user',
    });
    warnings.push(...messageWarnings);

    const {
      tools,
      toolChoice,
      warnings: toolWarnings,
      toolMapping,
    } = prepareChatGPTTools({
      tools: options.tools,
      toolChoice: options.toolChoice,
    });
    warnings.push(...toolWarnings);

    const reasoning = this.createReasoningParam(options.reasoning);
    const include: string[] = [];

    // Request encrypted COT if reasoning is enabled and we're not storing responses
    if (reasoning) {
      include.push('reasoning.encrypted_content');

      // Warn about potentially problematic summary values
      if (reasoning.summary === 'none' || reasoning.summary === 'concise') {
        warnings.push({
          type: 'other',
          message: `Reasoning summary '${reasoning.summary}' may not be consistently supported by the ChatGPT OAuth API. If you encounter errors, try 'auto' or 'detailed' instead.`,
        });
      }
    }

    const args: ChatGPTRequest = {
      model: this.modelId,
      instructions: await this.getInstructions(authHeaders),
      input: chatgptMessages,
      tools,
      tool_choice: toolChoice,
      parallel_tool_calls: false,
      reasoning,
      store: false,
      stream: true,
      include,
    };

    // ChatGPT backend doesn't support these parameters
    // but we should warn if they're provided
    if (options.temperature !== undefined) {
      warnings.push({
        type: 'unsupported',
        feature: 'temperature',
        details: 'Temperature is not supported by the ChatGPT OAuth backend',
      });
    }
    if (options.topP !== undefined) {
      warnings.push({
        type: 'unsupported',
        feature: 'topP',
        details: 'Top-p is not supported by the ChatGPT OAuth backend',
      });
    }
    if (options.maxOutputTokens !== undefined) {
      warnings.push({
        type: 'unsupported',
        feature: 'maxOutputTokens',
        details: 'Maximum output tokens are not supported by the ChatGPT OAuth backend',
      });
    }
    if (options.topK !== undefined) {
      warnings.push({
        type: 'unsupported',
        feature: 'topK',
        details: 'Top-k is not supported by the ChatGPT OAuth backend',
      });
    }
    if (options.presencePenalty !== undefined) {
      warnings.push({
        type: 'unsupported',
        feature: 'presencePenalty',
        details: 'Presence penalty is not supported by the ChatGPT OAuth backend',
      });
    }
    if (options.frequencyPenalty !== undefined) {
      warnings.push({
        type: 'unsupported',
        feature: 'frequencyPenalty',
        details: 'Frequency penalty is not supported by the ChatGPT OAuth backend',
      });
    }
    if (options.seed !== undefined) {
      warnings.push({
        type: 'unsupported',
        feature: 'seed',
        details: 'Seeded generation is not supported by the ChatGPT OAuth backend',
      });
    }
    if (options.stopSequences !== undefined && options.stopSequences.length > 0) {
      warnings.push({
        type: 'unsupported',
        feature: 'stopSequences',
        details: 'Stop sequences are not supported by the ChatGPT OAuth backend',
      });
    }
    if (options.responseFormat?.type === 'json') {
      warnings.push({
        type: 'unsupported',
        feature: 'responseFormat',
        details: 'Structured response formats are not supported by the ChatGPT OAuth backend',
      });
    }

    return { args, warnings, toolMapping };
  }

  async doGenerate(options: LanguageModelV4CallOptions): Promise<LanguageModelV4GenerateResult> {
    const authHeaders = await this.getAuthHeaders();
    const { args, warnings, toolMapping } = await this.getArgs(options, authHeaders);

    // Debug logging
    if (process.env.DEBUG) {
      console.warn('Request URL:', `${this.config.baseURL}/codex/responses`);
      console.warn('Request Body:', JSON.stringify(args, null, 2));
      console.warn('Request Header Names:', Object.keys(authHeaders));
      console.warn('Tools:', JSON.stringify(args.tools, null, 2));
    }

    // ChatGPT backend always uses streaming, even for non-streaming calls
    // We collect the stream and return the complete response
    const response = await (this.config.fetch ?? globalThis.fetch)(
      `${this.config.baseURL}/codex/responses`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...this.config.headers,
          ...authHeaders,
          ...options.headers,
        },
        body: JSON.stringify(args),
        signal: options.abortSignal,
      }
    );

    // Don't consume the body if it's not ok and it's a stream
    if (!response.ok) {
      throw await createApiError(response);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new ChatGPTOAuthError('ChatGPT OAuth API returned no response body', 'EMPTY_RESPONSE');
    }

    const content: LanguageModelV4Content[] = [];
    let finishReason = mapChatGPTFinishReason(undefined);
    let usage = createUsage();

    let currentText = '';
    let currentReasoning = '';
    let hadToolCall = false;
    const activeToolCalls = new Map<string, { name: string; args: string }>();
    const decoder = new TextDecoder();
    let buffer = '';

    // Process all the streamed events
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              break;
            }

            const event = parseSseEvent(data);
            if (!event) {
              continue;
            }

            if (process.env.DEBUG) {
              console.warn('SSE Event (doGenerate):', JSON.stringify(event, null, 2));
            }

            // Handle ChatGPT backend event format
            switch (event.type) {
              case 'response.output_item.added':
                // Handle function call initialization
                if (event.item && event.item.type === 'function_call') {
                  const id = event.item.id || `call_${Date.now()}`;
                  activeToolCalls.set(id, {
                    name: 'pending',
                    args: '',
                  });
                }
                break;

              case 'response.output_item.done':
                // Handle completed function calls
                if (
                  event.item &&
                  event.item.type === 'function_call' &&
                  event.item.id &&
                  event.item.name
                ) {
                  const toolCallId = event.item.id;
                  if (activeToolCalls.has(toolCallId)) {
                    const toolCall = activeToolCalls.get(toolCallId)!;
                    toolCall.name = event.item.name;
                    toolCall.args = event.item.arguments || '';

                    // Keep the mapping for later processing
                    activeToolCalls.set(toolCallId, {
                      name: toolCall.name,
                      args: toolCall.args,
                    });
                    hadToolCall = true;
                  }
                }
                break;

              case 'response.output_text.delta':
                currentText += event.delta || '';
                break;

              case 'response.reasoning_summary_text.delta':
                currentReasoning += event.delta || '';
                break;

              case 'response.completed':
                finishReason = mapChatGPTFinishReason(
                  hadToolCall ? 'tool_calls' : (event.response?.status ?? event.status)
                );
                if (process.env.DEBUG_USAGE) {
                  console.warn('response.done event:', JSON.stringify(event, null, 2));
                }
                if (event.response?.usage) {
                  usage = mapUsage(event.response.usage);
                }
                break;

              case 'response.incomplete':
                finishReason = mapChatGPTFinishReason(
                  event.response?.incomplete_details?.reason === 'max_output_tokens'
                    ? 'max_tokens'
                    : event.response?.incomplete_details?.reason
                );
                if (event.response?.usage) {
                  usage = mapUsage(event.response.usage);
                }
                break;

              case 'response.failed':
                throw new ChatGPTOAuthError(
                  event.response?.error?.message ?? 'ChatGPT response failed',
                  'RESPONSE_FAILED'
                );
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (currentText) {
      content.push({ type: 'text', text: currentText });
    }
    if (currentReasoning) {
      content.unshift({ type: 'reasoning', text: currentReasoning });
    }

    for (const [id, toolCall] of activeToolCalls) {
      if (toolCall.name && toolCall.args) {
        // Map back to original tool names using toolMapping
        const originalName = toolMapping.get(toolCall.name) || toolCall.name;

        try {
          // Validate tool response against expected schema
          const args = validateToolResponse(toolCall.name, toolCall.args);
          content.push({
            type: 'tool-call',
            toolCallId: id,
            toolName: originalName,
            input: JSON.stringify(args),
          });
        } catch (error) {
          warnings.push({
            type: 'other',
            message: error instanceof Error ? error.message : 'Failed to parse tool arguments',
          });
          content.push({
            type: 'tool-call',
            toolCallId: id,
            toolName: originalName,
            input: toolCall.args,
          });
        }
      }
    }

    return {
      content,
      finishReason,
      usage,
      warnings,
      request: {
        body: args,
      },
      response: {
        headers: Object.fromEntries(response.headers.entries()),
      },
    };
  }

  async doStream(options: LanguageModelV4CallOptions): Promise<LanguageModelV4StreamResult> {
    const authHeaders = await this.getAuthHeaders();
    const { args, warnings, toolMapping } = await this.getArgs(options, authHeaders);

    const response = await (this.config.fetch ?? globalThis.fetch)(
      `${this.config.baseURL}/codex/responses`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...this.config.headers,
          ...authHeaders,
          ...options.headers,
        },
        body: JSON.stringify(args),
        signal: options.abortSignal,
      }
    );

    // Don't consume the body if it's not ok and it's a stream
    if (!response.ok) {
      throw await createApiError(response);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new ChatGPTOAuthError('ChatGPT OAuth API returned no response body', 'EMPTY_RESPONSE');
    }

    let usage = createUsage();

    const activeToolCalls = new Map<
      string,
      { name: string; args: string; streamStarted: boolean }
    >();

    const stream = new ReadableStream<LanguageModelV4StreamPart>({
      async start(controller) {
        const decoder = new TextDecoder();
        let buffer = '';
        const textId = `text-${randomUUID()}`;
        const reasoningId = `reasoning-${randomUUID()}`;
        let textStarted = false;
        let reasoningStarted = false;
        let hadToolCall = false;
        let streamErrored = false;

        try {
          controller.enqueue({
            type: 'stream-start',
            warnings,
          });

          readLoop: while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  break readLoop;
                }

                const event = parseSseEvent(data);
                if (!event) {
                  continue;
                }

                if (process.env.DEBUG) {
                  console.warn('SSE Event (doStream):', JSON.stringify(event, null, 2));
                }

                if (options.includeRawChunks) {
                  controller.enqueue({
                    type: 'raw',
                    rawValue: event,
                  });
                }

                // Handle ChatGPT backend event format
                switch (event.type) {
                  case 'response.output_item.added':
                    // Handle function call initialization
                    if (event.item && event.item.type === 'function_call') {
                      const id = event.item.id || `call_${Date.now()}`;
                      const name = event.item.name || 'pending';
                      const originalName = toolMapping.get(name) || name;
                      const streamStarted = name !== 'pending';
                      activeToolCalls.set(id, {
                        name,
                        args: '',
                        streamStarted,
                      });
                      if (streamStarted) {
                        controller.enqueue({
                          type: 'tool-input-start',
                          id,
                          toolName: originalName,
                        });
                      }
                    }
                    break;

                  case 'response.output_item.done':
                    // Handle completed function calls
                    if (
                      event.item &&
                      event.item.type === 'function_call' &&
                      event.item.id &&
                      event.item.name
                    ) {
                      const toolCallId = event.item.id;
                      if (activeToolCalls.has(toolCallId)) {
                        const toolCall = activeToolCalls.get(toolCallId)!;
                        toolCall.name = event.item.name;
                        toolCall.args = event.item.arguments || '';

                        // Map back to original tool names using toolMapping
                        const originalName = toolMapping.get(toolCall.name) || toolCall.name;

                        if (toolCall.streamStarted) {
                          controller.enqueue({
                            type: 'tool-input-end',
                            id: toolCallId,
                          });
                        }

                        try {
                          // Validate tool response against expected schema
                          const validatedArgs = validateToolResponse(toolCall.name, toolCall.args);
                          controller.enqueue({
                            type: 'tool-call',
                            toolCallId: toolCallId,
                            toolName: originalName,
                            input: JSON.stringify(validatedArgs),
                          });
                        } catch {
                          controller.enqueue({
                            type: 'tool-call',
                            toolCallId: toolCallId,
                            toolName: originalName,
                            input: toolCall.args,
                          });
                        }

                        hadToolCall = true;
                        activeToolCalls.delete(toolCallId);
                      }
                    }
                    break;

                  case 'response.output_text.delta':
                    if (event.delta) {
                      if (!textStarted) {
                        controller.enqueue({
                          type: 'text-start',
                          id: textId,
                        });
                        textStarted = true;
                      }
                      controller.enqueue({
                        type: 'text-delta',
                        id: textId,
                        delta: event.delta,
                      });
                    }
                    break;

                  case 'response.reasoning_summary_text.delta':
                    if (event.delta) {
                      if (!reasoningStarted) {
                        controller.enqueue({
                          type: 'reasoning-start',
                          id: reasoningId,
                        });
                        reasoningStarted = true;
                      }
                      controller.enqueue({
                        type: 'reasoning-delta',
                        id: reasoningId,
                        delta: event.delta,
                      });
                    }
                    break;

                  case 'response.function_call_arguments.delta':
                    // Handle incremental tool call arguments
                    if (event.item_id && event.delta) {
                      if (activeToolCalls.has(event.item_id)) {
                        const active = activeToolCalls.get(event.item_id)!;
                        active.args += event.delta;

                        if (active.streamStarted) {
                          controller.enqueue({
                            type: 'tool-input-delta',
                            id: event.item_id,
                            delta: event.delta,
                          });
                        }
                      }
                    }
                    break;

                  case 'response.completed':
                    if (event.response?.usage) {
                      usage = mapUsage(event.response.usage);
                    }
                    if (reasoningStarted) {
                      controller.enqueue({
                        type: 'reasoning-end',
                        id: reasoningId,
                      });
                      reasoningStarted = false;
                    }
                    if (textStarted) {
                      controller.enqueue({
                        type: 'text-end',
                        id: textId,
                      });
                      textStarted = false;
                    }
                    controller.enqueue({
                      type: 'finish',
                      finishReason: mapChatGPTFinishReason(
                        hadToolCall ? 'tool_calls' : (event.response?.status ?? event.status)
                      ),
                      usage,
                    });
                    break;

                  case 'response.incomplete':
                    if (event.response?.usage) {
                      usage = mapUsage(event.response.usage);
                    }
                    if (reasoningStarted) {
                      controller.enqueue({
                        type: 'reasoning-end',
                        id: reasoningId,
                      });
                      reasoningStarted = false;
                    }
                    if (textStarted) {
                      controller.enqueue({
                        type: 'text-end',
                        id: textId,
                      });
                      textStarted = false;
                    }
                    controller.enqueue({
                      type: 'finish',
                      finishReason: mapChatGPTFinishReason(
                        event.response?.incomplete_details?.reason === 'max_output_tokens'
                          ? 'max_tokens'
                          : event.response?.incomplete_details?.reason
                      ),
                      usage,
                    });
                    break;

                  case 'response.failed':
                    throw new ChatGPTOAuthError(
                      event.response?.error?.message ?? 'ChatGPT response failed',
                      'RESPONSE_FAILED'
                    );
                }
              }
            }
          }
        } catch (error) {
          streamErrored = true;
          controller.error(error);
        } finally {
          reader.releaseLock();
          if (!streamErrored) {
            controller.close();
          }
        }
      },
    });

    return {
      stream,
      request: {
        body: args,
      },
      response: {
        headers: Object.fromEntries(response.headers.entries()),
      },
    };
  }
}

function createUsage(): LanguageModelV4Usage {
  return {
    inputTokens: {
      total: 0,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: 0,
      text: undefined,
      reasoning: undefined,
    },
  };
}

function parseSseEvent(data: string): ChatGPTSseEvent | undefined {
  try {
    const event: unknown = JSON.parse(data);
    return event !== null && typeof event === 'object' ? (event as ChatGPTSseEvent) : undefined;
  } catch {
    return undefined;
  }
}

async function createApiError(response: Response): Promise<ChatGPTOAuthError> {
  let detail: string | undefined;

  try {
    const body = (await response.json()) as {
      detail?: string;
      error?: { message?: string };
    };
    detail = body.error?.message ?? body.detail;
  } catch {
    // The status and status text still provide a stable, non-sensitive error.
  }

  const suffix = detail ? `: ${detail}` : '';
  return new ChatGPTOAuthError(
    `ChatGPT OAuth API error: ${response.status} ${response.statusText}${suffix}`,
    'API_ERROR',
    response.status
  );
}

function mapUsage(usage: ChatGPTUsage): LanguageModelV4Usage {
  const inputTokens = usage.input_tokens ?? 0;
  const cachedTokens = usage.input_tokens_details?.cached_tokens;
  const outputTokens = usage.output_tokens ?? 0;
  const reasoningTokens = usage.output_tokens_details?.reasoning_tokens;

  return {
    inputTokens: {
      total: inputTokens,
      noCache: cachedTokens === undefined ? undefined : Math.max(0, inputTokens - cachedTokens),
      cacheRead: cachedTokens,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: outputTokens,
      text: reasoningTokens === undefined ? undefined : Math.max(0, outputTokens - reasoningTokens),
      reasoning: reasoningTokens,
    },
  };
}
