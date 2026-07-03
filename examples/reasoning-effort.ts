import { generateText } from 'ai';
import { createChatGPTOAuth } from '../src/index';

/**
 * This example demonstrates how to use the reasoning effort parameter
 * to control the depth of thinking for supported models.
 *
 * The reasoning effort parameter works similarly to Codex CLI's
 * -c model_reasoning_effort="high" option.
 */

async function testReasoningEffort() {
  console.log('='.repeat(60));
  console.log('ChatGPT OAuth Reasoning Effort Demo');
  console.log('='.repeat(60));
  console.log('\n');

  // Create provider with default reasoning settings
  const provider = createChatGPTOAuth({
    autoRefresh: true,
    reasoningEffort: 'medium', // Default effort level
    reasoningSummary: 'auto', // Default summary mode
  });

  // Test different reasoning effort levels
  const testCases = [
    { effort: 'low', prompt: 'What is 2+2?' },
    { effort: 'medium', prompt: 'Explain why 0.999... equals 1' },
    { effort: 'high', prompt: 'Prove that the square root of 2 is irrational' },
  ] as const;

  for (const { effort, prompt } of testCases) {
    console.log(`\nReasoning Effort: ${effort.toUpperCase()}`);
    console.log('-'.repeat(50));
    console.log(`Prompt: ${prompt}`);
    console.log('');

    try {
      const result = await generateText({
        model: provider('gpt-5.5'),
        reasoning: effort,
        prompt,
      });

      console.log('Response:', result.text);

      if (result.usage) {
        console.log(`\nToken usage:`);
        console.log(`Input: ${result.usage.inputTokens}`);
        console.log(`Output: ${result.usage.outputTokens}`);
        console.log(`Total: ${result.usage.totalTokens}`);

        // Note: reasoning tokens are included in the output tokens
        // The backend may provide separate reasoning token counts in future
      }
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Alternative Usage: Global Settings');
  console.log('='.repeat(60));
  console.log('\n');

  // You can also set reasoning globally for all models
  const highReasoningProvider = createChatGPTOAuth({
    autoRefresh: true,
    reasoningEffort: 'high',
    reasoningSummary: 'detailed',
  });

  console.log('Using provider with global high reasoning effort...\n');

  const result = await generateText({
    model: highReasoningProvider('gpt-5.5'),
    prompt: 'Analyze the computational complexity of quicksort',
  });

  console.log('Response:', result.text);
  console.log(`\nTokens used: ${result.usage?.totalTokens || 0}`);

  console.log('\n' + '='.repeat(60));
  console.log('Notes:');
  console.log('- Current catalog advertises low, medium, high, and xhigh');
  console.log('- AI SDK 7 call-level reasoning overrides provider defaults');
  console.log('- Higher effort levels may increase response time and token usage');
  console.log('- Similar to: codex -m gpt-5.5 -c model_reasoning_effort="high"');
  console.log('='.repeat(60));
}

testReasoningEffort().catch(console.error);
