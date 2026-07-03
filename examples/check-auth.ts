import { createChatGPTOAuth, DefaultAuthProvider } from '../src/index';

async function main() {
  console.log('Checking ChatGPT OAuth authentication...\n');

  try {
    const authProvider = new DefaultAuthProvider();
    const credentials = await authProvider.getCredentials();
    const provider = createChatGPTOAuth({ authProvider });

    console.log('✅ Credentials loaded');
    console.log(`✅ Refresh token available: ${credentials.refreshToken ? 'yes' : 'no'}`);

    const model = provider('gpt-5.5');
    console.log('✅ Model instantiated:', model.modelId);

    console.log('\n✅ Authentication check complete!');
    console.log('\nYou can now use the provider with the AI SDK.');
  } catch (error) {
    console.error(
      '❌ Authentication failed:',
      error instanceof Error ? error.message : String(error)
    );
    console.error('\nTo fix this:');
    console.error('1. Install and authenticate with Codex CLI:');
    console.error('   npm install -g @openai/codex');
    console.error('   codex login');
    console.error('\n2. Or set environment variables:');
    console.error('   export CHATGPT_OAUTH_ACCESS_TOKEN="your-token"');
    console.error('   export CHATGPT_OAUTH_ACCOUNT_ID="your-account-id"');
    console.error('   export CHATGPT_OAUTH_REFRESH_TOKEN="your-refresh-token" (optional)');
    process.exit(1);
  }
}

main();
