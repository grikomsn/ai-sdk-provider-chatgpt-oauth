import assert from 'node:assert/strict';
import { generateText, streamText } from 'ai';
import { createChatGPTOAuth } from '@grikomsn/ai-sdk-provider-chatgpt-oauth';
import { TokenManager } from '../src/token-manager.js';

async function testOAuthIntegration(): Promise<void> {
  const tokenManager = new TokenManager();
  const status = tokenManager.getStatus();

  assert(status?.isAuthenticated, 'Not authenticated. Run "npm run login" first.');

  const credentials = await tokenManager.getCredentials();
  assert(credentials, 'Unable to load OAuth credentials.');

  const chatgpt = createChatGPTOAuth({ credentials });

  const latest = await generateText({
    model: chatgpt('gpt-5.5'),
    prompt: 'Reply with exactly: OAuth test successful!',
  });
  assert.equal(latest.text.trim(), 'OAuth test successful!');

  const previous = await generateText({
    model: chatgpt('gpt-5.4'),
    prompt: 'Reply with exactly: GPT-5.4 reachable.',
  });
  assert.equal(previous.text.trim(), 'GPT-5.4 reachable.');

  const streaming = streamText({
    model: chatgpt('gpt-5.5'),
    prompt: 'Reply with exactly: OAuth stream successful!',
  });
  let streamedText = '';
  for await (const chunk of streaming.textStream) {
    streamedText += chunk;
  }
  assert.equal(streamedText.trim(), 'OAuth stream successful!');

  const finalCredentials = await tokenManager.getCredentials();
  assert(finalCredentials, 'Credentials became unavailable after live requests.');

  console.log('Live OAuth integration passed for generation and streaming.');
}

testOAuthIntegration().catch((error: unknown) => {
  console.error('Live OAuth integration failed:', error);
  process.exitCode = 1;
});
