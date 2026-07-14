import { ChatApp } from '@/components/chat-app';
import { readAuthSession } from '@/lib/auth/session';

export default async function Home() {
  const initialAuthenticated = (await readAuthSession()) !== null;
  return <ChatApp initialAuthenticated={initialAuthenticated} />;
}
