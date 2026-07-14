'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { CornerDownLeftIcon, LogOutIcon, MessageSquareIcon, SquareIcon } from 'lucide-react';
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const transport = new DefaultChatTransport({ api: '/api/chat' });

interface ChatProps {
  onSignOut: () => void;
}

export function Chat({ onSignOut }: ChatProps) {
  const { error, messages, sendMessage, status, stop } = useChat({ transport });
  const [input, setInput] = useState('');
  const isGenerating = status === 'submitted' || status === 'streaming';

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || isGenerating) {
      return;
    }
    setInput('');
    void sendMessage({ text: message });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <main className="mx-auto flex h-dvh w-full max-w-3xl flex-col px-4">
      <header className="flex h-14 shrink-0 items-center justify-between border-b">
        <div className="flex items-center gap-2">
          <span className="font-medium">ChatGPT OAuth</span>
          <Badge variant="secondary">gpt-5.5</Badge>
        </div>
        <Button onClick={onSignOut} size="sm" variant="ghost">
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
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
        <form className="relative" onSubmit={submit}>
          <Textarea
            className="min-h-24 resize-none pr-12 pb-9"
            disabled={isGenerating}
            onChange={(event) => setInput(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message ChatGPT"
            value={input}
          />
          <div className="absolute inset-x-2 bottom-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">ChatGPT subscription via OAuth</span>
            {isGenerating ? (
              <Button aria-label="Stop" onClick={() => void stop()} size="icon-sm" type="button">
                <SquareIcon />
              </Button>
            ) : (
              <Button aria-label="Send" disabled={!input.trim()} size="icon-sm" type="submit">
                <CornerDownLeftIcon />
              </Button>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}
