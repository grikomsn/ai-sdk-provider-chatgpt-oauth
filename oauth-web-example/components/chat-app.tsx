'use client';

import { useCallback, useState } from 'react';
import { AuthPanel } from '@/components/auth-panel';
import { Chat } from '@/components/chat';

interface ChatAppProps {
  initialAuthenticated: boolean;
}

export function ChatApp({ initialAuthenticated }: ChatAppProps) {
  const [authenticated, setAuthenticated] = useState(initialAuthenticated);
  const onAuthenticated = useCallback(() => setAuthenticated(true), []);

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAuthenticated(false);
  };

  if (authenticated) {
    return <Chat onSignOut={() => void signOut()} />;
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <AuthPanel onAuthenticated={onAuthenticated} />
    </main>
  );
}
