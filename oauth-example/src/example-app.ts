import { generateText, streamText } from 'ai';
import { createChatGPTOAuth } from '@grikomsn/ai-sdk-provider-chatgpt-oauth';
import { TokenManager } from './token-manager.js';
import { config } from 'dotenv';

// Load environment variables
config();

async function main() {
  console.log('\nChatGPT OAuth Example App\n');
  console.log('-'.repeat(50));

  // Initialize token manager
  const tokenManager = new TokenManager();

  // Check authentication
  const status = tokenManager.getStatus();
  if (!status?.isAuthenticated) {
    console.log('Not authenticated!\n');
    console.log('Please run "npm run login" first to authenticate.\n');
    process.exit(1);
  }

  console.log('Authenticated');
  console.log(`Account: ${status.accountId}`);
  console.log(`Expires in: ${status.expiresIn}\n`);

  try {
    // Get fresh credentials (will auto-refresh if needed)
    const credentials = await tokenManager.getCredentials();
    if (!credentials) {
      throw new Error('Failed to get valid credentials');
    }

    // Create provider with OAuth credentials
    const provider = createChatGPTOAuth({
      credentials,
    });

    console.log('-'.repeat(50));
    console.log('\nExample 1: Basic Text Generation\n');

    const result1 = await generateText({
      model: provider('gpt-5.5'),
      prompt: 'What are the main benefits of TypeScript over JavaScript? Be concise.',
    });

    console.log('Response:', result1.text);
    console.log(`\nUsage: ${result1.usage?.totalTokens} tokens`);

    console.log('\n' + '-'.repeat(50));
    console.log('\nExample 2: Streaming Response\n');

    const stream = await streamText({
      model: provider('gpt-5.5'),
      prompt: 'Write a haiku about OAuth authentication.',
    });

    process.stdout.write('Response: ');
    for await (const chunk of stream.textStream) {
      process.stdout.write(chunk);
    }
    console.log('\n');

    console.log('-'.repeat(50));
    console.log('\nExample 3: Using Reasoning (if supported)\n');

    const result3 = await generateText({
      model: provider('gpt-5.5', {
        reasoningEffort: 'high',
      }),
      prompt: 'Explain how OAuth 2.0 PKCE flow prevents authorization code interception attacks.',
    });

    console.log('Response:', result3.text);
    console.log(`\nUsage: ${result3.usage?.totalTokens} tokens`);

    console.log('\n' + '-'.repeat(50));
    console.log('\nExample 4: Multi-turn Conversation\n');

    const result4 = await generateText({
      model: provider('gpt-5.5'),
      instructions: 'You are a helpful OAuth expert.',
      messages: [
        { role: 'user', content: 'What is PKCE?' },
        {
          role: 'assistant',
          content:
            'PKCE (Proof Key for Code Exchange) is a security extension to OAuth 2.0 that prevents authorization code interception attacks.',
        },
        { role: 'user', content: 'How does it work exactly?' },
      ],
    });

    console.log('Response:', result4.text);
    console.log(`\nUsage: ${result4.usage?.totalTokens} tokens`);

    console.log('\n' + '-'.repeat(50));
    console.log('\nAll examples completed successfully!\n');

    // Update credentials if they were refreshed
    const updatedCreds = await tokenManager.getCredentials();
    if (updatedCreds && updatedCreds.accessToken !== credentials.accessToken) {
      console.log('Note: Token was automatically refreshed during execution.\n');
    }
  } catch (error) {
    console.error('\nError:', error);

    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        console.log('\nTip: Your token may have expired. Try running "npm run login" again.\n');
      } else if (error.message.includes('Model not supported')) {
        console.log(
          '\nTip: The model may not be available. Try "gpt-5.5", "gpt-5.4", or "gpt-5.4-mini".\n'
        );
      }
    }

    process.exit(1);
  }
}

// Run the example
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
