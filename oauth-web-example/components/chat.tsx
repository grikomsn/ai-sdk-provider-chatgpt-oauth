'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import {
  BotIcon,
  ChevronDownIcon,
  CornerDownLeftIcon,
  LogOutIcon,
  MessageSquareIcon,
  SquareIcon,
} from 'lucide-react';
import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorName,
  ModelSelectorTrigger,
} from '@/components/ai-elements/model-selector';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { isChatGPTModelsResponse, type ChatGPTModelsResponse } from '@/lib/chatgpt-models';

interface ChatProps {
  isSigningOut: boolean;
  onSignOut: () => void;
  signOutError: string | null;
}

export function Chat({ isSigningOut, onSignOut, signOutError }: ChatProps) {
  const [transport] = useState(() => new DefaultChatTransport({ api: '/api/chat' }));
  const { error, messages, sendMessage, status, stop } = useChat({ transport });
  const [input, setInput] = useState('');
  const [catalog, setCatalog] = useState<ChatGPTModelsResponse | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [reasoningEffort, setReasoningEffort] = useState<string | null>(null);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const isGenerating = status === 'submitted' || status === 'streaming';
  const selectedModel = catalog?.models.find(({ id }) => id === selectedModelId);
  const reasoningItems = selectedModel?.reasoningEfforts.map(({ id, label }) => ({
    label,
    value: id,
  }));
  const canChat = Boolean(
    selectedModel &&
    (selectedModel.reasoningEfforts.length === 0 ||
      selectedModel.reasoningEfforts.some(({ id }) => id === reasoningEffort))
  );

  useEffect(() => {
    const controller = new AbortController();

    const loadModels = async () => {
      try {
        const response = await fetch('/api/models', {
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            payload &&
            typeof payload === 'object' &&
            typeof (payload as { error?: unknown }).error === 'string'
              ? (payload as { error: string }).error
              : 'Unable to load the available ChatGPT models.';
          throw new Error(message);
        }
        if (!isChatGPTModelsResponse(payload)) {
          throw new Error('ChatGPT returned an invalid model catalog.');
        }

        const defaultModel = payload.models.find(({ id }) => id === payload.defaultModelId);
        if (!defaultModel) {
          throw new Error('ChatGPT returned an invalid default model.');
        }
        setCatalog(payload);
        setSelectedModelId(defaultModel.id);
        setReasoningEffort(defaultModel.defaultReasoningEffort);
      } catch (error) {
        if (!controller.signal.aborted) {
          setCatalogError(
            error instanceof Error ? error.message : 'Unable to load the available ChatGPT models.'
          );
        }
      }
    };

    void loadModels();
    return () => controller.abort();
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isGenerating || !canChat || !selectedModel) {
      return;
    }
    const message = input.trim();
    setInput('');
    if (!message) {
      return;
    }
    void sendMessage(
      { text: message },
      {
        body: {
          modelId: selectedModel.id,
          reasoningEffort,
        },
      }
    );
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const selectModel = (modelId: string) => {
    const model = catalog?.models.find(({ id }) => id === modelId);
    if (!model) {
      return;
    }
    setSelectedModelId(model.id);
    setReasoningEffort(model.defaultReasoningEffort);
    setModelSelectorOpen(false);
  };

  return (
    <main className="mx-auto flex h-dvh w-full max-w-3xl flex-col px-4">
      <header className="flex h-14 shrink-0 items-center justify-between border-b">
        <span className="font-medium">ChatGPT OAuth</span>
        <Button disabled={isSigningOut} onClick={onSignOut} size="sm" variant="ghost">
          <LogOutIcon />
          Sign out
        </Button>
      </header>

      <Conversation className="min-h-0">
        <ConversationContent className="mx-auto w-full max-w-2xl py-8">
          {messages.length === 0 ? (
            <ConversationEmptyState
              description="Send a message to verify OAuth-backed streaming inference."
              icon={<MessageSquareIcon className="size-5" />}
              title="Start a conversation"
            />
          ) : (
            messages.map((message) => (
              <Message from={message.role} key={message.id}>
                <MessageContent>
                  {message.parts.map((part, index) =>
                    part.type === 'text' ? (
                      <MessageResponse key={`${message.id}-${index}`}>{part.text}</MessageResponse>
                    ) : null
                  )}
                </MessageContent>
              </Message>
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="mx-auto w-full max-w-2xl shrink-0 space-y-3 border-t py-4">
        {(signOutError || catalogError || error) && (
          <Alert variant="destructive">
            <AlertDescription>{signOutError ?? catalogError ?? error?.message}</AlertDescription>
          </Alert>
        )}
        <form className="relative" onSubmit={submit}>
          <Textarea
            className="min-h-24 resize-none pr-12 pb-9"
            disabled={isGenerating || !canChat}
            onChange={(event) => setInput(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
            placeholder={catalog ? 'Message ChatGPT' : 'Loading available models…'}
            value={input}
          />
          <div className="absolute inset-x-2 bottom-2 flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-1.5">
              <ModelSelector open={modelSelectorOpen} onOpenChange={setModelSelectorOpen}>
                <ModelSelectorTrigger
                  render={
                    <Button
                      aria-label="Select ChatGPT model"
                      className="max-w-40"
                      disabled={!catalog || isGenerating}
                      size="xs"
                      variant="outline"
                    />
                  }
                >
                  <BotIcon />
                  <span className="truncate">{selectedModel?.name ?? 'Model'}</span>
                  <ChevronDownIcon />
                </ModelSelectorTrigger>
                <ModelSelectorContent className="sm:max-w-md" title="Select a ChatGPT model">
                  <ModelSelectorInput
                    aria-label="Search ChatGPT models"
                    placeholder="Search models…"
                  />
                  <ModelSelectorList>
                    <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                    <ModelSelectorGroup heading="Available to your ChatGPT account">
                      {catalog?.models.map((model) => (
                        <ModelSelectorItem
                          data-checked={model.id === selectedModelId}
                          key={model.id}
                          onSelect={() => selectModel(model.id)}
                          title={model.description}
                          value={`${model.name} ${model.id}`}
                        >
                          <ModelSelectorName>{model.name}</ModelSelectorName>
                        </ModelSelectorItem>
                      ))}
                    </ModelSelectorGroup>
                  </ModelSelectorList>
                </ModelSelectorContent>
              </ModelSelector>

              <Select
                disabled={
                  !selectedModel || selectedModel.reasoningEfforts.length === 0 || isGenerating
                }
                items={reasoningItems}
                onValueChange={(value) => {
                  if (typeof value === 'string') {
                    setReasoningEffort(value);
                  }
                }}
                value={reasoningEffort}
              >
                <SelectTrigger aria-label="Thinking effort" size="sm">
                  <SelectValue placeholder="Effort" />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectGroup>
                    <SelectLabel>Thinking effort</SelectLabel>
                    {selectedModel?.reasoningEfforts.map((effort) => (
                      <SelectItem key={effort.id} title={effort.description} value={effort.id}>
                        {effort.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            {isGenerating ? (
              <Button aria-label="Stop" onClick={() => void stop()} size="icon-sm" type="button">
                <SquareIcon />
              </Button>
            ) : (
              <Button
                aria-label="Send"
                disabled={!input.trim() || !canChat}
                size="icon-sm"
                type="submit"
              >
                <CornerDownLeftIcon />
              </Button>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}
