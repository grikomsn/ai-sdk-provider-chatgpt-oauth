'use client';

import { useCallback, useState } from 'react';
import { AuthPanel } from '@/components/auth-panel';
import { Chat } from '@/components/chat';

interface ChatAppProps {
  initialAuthenticated: boolean;
}

export function ChatApp({ initialAuthenticated }: ChatAppProps) {
  const [authenticated, setAuthenticated] = useState(initialAuthenticated);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const onAuthenticated = useCallback(() => setAuthenticated(true), []);

  const signOut = async () => {
    setIsSigningOut(true);
    setSignOutError(null);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) {
        throw new Error('Unable to sign out. Try again.');
      }
      setAuthenticated(false);
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : 'Unable to sign out. Try again.');
    } finally {
      setIsSigningOut(false);
    }
  };

  if (authenticated) {
    return (
      <Chat
        isSigningOut={isSigningOut}
        onSignOut={() => void signOut()}
        signOutError={signOutError}
      />
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <AuthPanel onAuthenticated={onAuthenticated} />
    </main>
  );
}
