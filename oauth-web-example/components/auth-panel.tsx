'use client';

import { useEffect, useState } from 'react';
import { CheckIcon, CopyIcon, ExternalLinkIcon, LoaderCircleIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface DeviceFlow {
  userCode: string;
  verificationUrl: string;
  interval: number;
}

interface AuthPanelProps {
  onAuthenticated: () => void;
}

async function responseError(response: Response): Promise<string> {
  const data = (await response.json().catch(() => null)) as { error?: unknown } | null;
  return typeof data?.error === 'string' ? data.error : 'The request failed. Try again.';
}

export function AuthPanel({ onAuthenticated }: AuthPanelProps) {
  const [flow, setFlow] = useState<DeviceFlow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!flow) {
      return;
    }

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    const poll = async () => {
      try {
        const response = await fetch('/api/auth/device/poll', {
          method: 'POST',
          signal: controller.signal,
        });
        if (cancelled) {
          return;
        }
        if (response.status === 202) {
          timeout = setTimeout(poll, flow.interval * 1000);
          return;
        }
        if (!response.ok) {
          throw new Error(await responseError(response));
        }
        onAuthenticated();
      } catch (pollError) {
        if (!cancelled) {
          setError(pollError instanceof Error ? pollError.message : 'Authorization failed.');
          setFlow(null);
        }
      }
    };

    timeout = setTimeout(poll, flow.interval * 1000);
    return () => {
      cancelled = true;
      controller.abort();
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [flow, onAuthenticated]);

  const startAuthorization = async () => {
    setIsStarting(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/device/start', { method: 'POST' });
      if (!response.ok) {
        throw new Error(await responseError(response));
      }
      setFlow((await response.json()) as DeviceFlow);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Authorization failed.');
    } finally {
      setIsStarting(false);
    }
  };

  const copyCode = async () => {
    if (!flow) {
      return;
    }
    try {
      await navigator.clipboard.writeText(flow.userCode);
      setError(null);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
      setError('Unable to copy the code. Select it and copy it manually.');
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Connect ChatGPT</CardTitle>
        <CardDescription>
          Sign in with the account whose Codex access you want to use for this chat.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!flow ? (
          <Button className="w-full" disabled={isStarting} onClick={startAuthorization}>
            {isStarting && <LoaderCircleIcon className="animate-spin" />}
            Continue with ChatGPT
          </Button>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">One-time code</span>
              <Badge variant="outline">
                <LoaderCircleIcon className="animate-spin" /> Waiting
              </Badge>
            </div>
            <button
              className="flex w-full items-center justify-between rounded-lg border bg-muted/40 px-4 py-3 text-left font-mono text-lg font-medium tracking-widest hover:bg-muted"
              onClick={copyCode}
              type="button"
            >
              {flow.userCode}
              {copied ? <CheckIcon /> : <CopyIcon />}
            </button>
            <a
              className={cn(buttonVariants(), 'w-full')}
              href={flow.verificationUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              Open ChatGPT sign-in
              <ExternalLinkIcon />
            </a>
            <p className="text-xs text-muted-foreground">
              Continue only if you started this request here. The code expires in 15 minutes.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
