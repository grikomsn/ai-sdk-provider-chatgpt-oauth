import { generateText } from 'ai';
import { createChatGPTOAuth } from '../src/index';

async function main() {
  try {
    const provider = createChatGPTOAuth({
      autoRefresh: true,
    });

    const result = await generateText({
      model: provider('gpt-5.4'),
      instructions: 'You are a terse assistant. Always answer in exactly three words.',
      prompt: 'Summarize what this OAuth provider does.',
    });

    console.log('Model reply:', result.text);

    if (result.warnings && result.warnings.length > 0) {
      console.log('\nWarnings:');
      for (const warning of result.warnings) {
        console.log('-', JSON.stringify(warning));
      }
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
