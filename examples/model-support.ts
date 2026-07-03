import { generateText } from 'ai';
import { ChatGPTOAuthError, createChatGPTOAuth, type ChatGPTOAuthProvider } from '../src/index';

/**
 * This example demonstrates which models work with the ChatGPT OAuth API
 * and what happens when you try to use an unsupported model.
 */

async function testModel(provider: ChatGPTOAuthProvider, modelId: string, description: string) {
  console.log(`\n${modelId} - ${description}`);
  console.log('-'.repeat(50));

  try {
    const result = await generateText({
      model: provider(modelId),
      prompt: 'Respond with a single sentence about your capabilities.',
    });

    console.log('SUCCESS');
    console.log(`Response: ${result.text}`);
    console.log(`Tokens used: ${result.usage.totalTokens}`);
    console.log(`Finish reason: ${result.finishReason}`);
  } catch (error) {
    console.log('ERROR');
    console.log(`Error message: ${error instanceof Error ? error.message : String(error)}`);

    if (error instanceof ChatGPTOAuthError && error.code === 'MODEL_NOT_AVAILABLE') {
      console.log('This model is not in the authenticated workspace catalog.');
    }
  }
}

async function main() {
  const provider = createChatGPTOAuth({
    autoRefresh: true,
  });

  console.log('='.repeat(60));
  console.log('ChatGPT OAuth Model Support Demonstration');
  console.log('='.repeat(60));
  console.log('\nThis example shows which models work with the ChatGPT OAuth API');
  console.log('and demonstrates the error when using unsupported models.\n');

  // Test working models
  console.log('\nWORKING MODELS:');
  await testModel(provider, 'gpt-5.5', 'Current GPT-5 model (372k context)');

  await testModel(provider, 'gpt-5.4', 'GPT-5 model (272k context)');

  await testModel(provider, 'gpt-5.4-mini', 'Smaller GPT-5 model (272k context)');

  // Test an unsupported model to show the error
  console.log('\n\nUNSUPPORTED MODEL EXAMPLE:');
  await testModel(provider, 'o3', 'Advanced reasoning model (requires API key access, not OAuth)');

  console.log('\n' + '='.repeat(60));
  console.log('Summary:');
  console.log('- Availability comes from the authenticated workspace catalog');
  console.log('- The catalog can change independently of this package');
  console.log('='.repeat(60));
}

main().catch(console.error);
