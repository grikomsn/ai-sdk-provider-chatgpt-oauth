import { generateText } from 'ai';
import { createChatGPTOAuth } from '../src/index';

async function main() {
  try {
    const provider = createChatGPTOAuth({
      autoRefresh: true,
    });

    const result = await generateText({
      model: provider('gpt-5.4'),
      prompt: 'Reply with a single sentence describing your CLI workflow.',
    });

    console.log('Generated text:', result.text);
    console.log('Usage:', result.usage);

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
