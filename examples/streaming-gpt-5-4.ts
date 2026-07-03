import { streamText } from 'ai';
import { createChatGPTOAuth } from '../src/index';

async function main() {
  try {
    const provider = createChatGPTOAuth({
      autoRefresh: true,
    });

    const { textStream, usage, warnings } = await streamText({
      model: provider('gpt-5.4'),
      prompt: 'Outline a focused debugging plan for tracking flaky tests.',
    });

    console.log('Streaming response:');
    console.log('-------------------');

    for await (const chunk of textStream) {
      process.stdout.write(chunk);
    }

    console.log('\n-------------------');

    const resolvedWarnings = await warnings;
    if (resolvedWarnings && resolvedWarnings.length > 0) {
      console.log(
        'Warnings:',
        resolvedWarnings.map((warning) => JSON.stringify(warning))
      );
    }

    console.log('Usage:', await usage);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
