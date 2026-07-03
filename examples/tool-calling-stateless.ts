import { generateText } from 'ai';
import { createChatGPTOAuth } from '../src';
import type { ModelMessage } from 'ai';

/**
 * Stateless Backend Example
 *
 * IMPORTANT: The ChatGPT OAuth backend is stateless - it doesn't remember previous messages.
 * You must send the FULL conversation history with each request.
 */

async function main() {
  console.log('Stateless Backend Example\n');
  console.log('='.repeat(50));
  console.log('\nKey Concept: Backend is STATELESS');
  console.log('Each request needs the full conversation history\n');
  console.log('='.repeat(50));

  const provider = createChatGPTOAuth();
  const conversationHistory: ModelMessage[] = [];

  // First message
  console.log('\nMessage 1: Asking about TypeScript');
  conversationHistory.push({
    role: 'user',
    content: 'I work with TypeScript files. Remember this.',
  });

  const response1 = await generateText({
    model: provider('gpt-5.5'),
    messages: conversationHistory,
  });

  console.log(`Assistant: "${response1.text}"`);
  conversationHistory.push({
    role: 'assistant',
    content: response1.text,
  });

  // Second message - WITHOUT history would fail
  console.log('\nMessage 2: Follow-up question');
  console.log("WITHOUT history: Model won't know about TypeScript");
  console.log('WITH history: Model remembers the context');

  conversationHistory.push({
    role: 'user',
    content: 'What file extension do I work with?',
  });

  const response2 = await generateText({
    model: provider('gpt-5.5'),
    messages: conversationHistory, // Must include ALL previous messages!
  });

  console.log(`Assistant: "${response2.text}"`);

  console.log('\nWhat was sent in the second request:');
  console.log(`- Message count: ${conversationHistory.length}`);
  conversationHistory.forEach((msg, i) => {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    const preview = content.substring(0, 40) + (content.length > 40 ? '...' : '');
    console.log(`- [${i + 1}] ${msg.role}: "${preview}"`);
  });

  console.log('\nKey Takeaway:');
  console.log("Unlike regular chat APIs, this backend doesn't maintain state.");
  console.log('Your app must manage the conversation history.');

  console.log('\n' + '='.repeat(50));
}

main().catch(console.error);
