#!/usr/bin/env tsx

import { generateText } from 'ai';
import { createChatGPTOAuth } from '@grikomsn/ai-sdk-provider-chatgpt-oauth';
import { TokenManager } from '../src/token-manager.js';

async function testOAuthIntegration() {
  console.log('\n🧪 Testing OAuth Integration\n');
  console.log('━'.repeat(50));

  const tokenManager = new TokenManager();

  // Step 1: Check authentication
  console.log('\n1️⃣  Checking authentication status...');
  const status = tokenManager.getStatus();

  if (!status?.isAuthenticated) {
    console.log('   ❌ Not authenticated');
    console.log('\n   Please run "npm run login" first.\n');
    process.exit(1);
  }

  console.log('   ✅ Authenticated');
  console.log(`   Account: ${status.accountId}`);
  console.log(`   Token expires in: ${status.expiresIn}`);

  // Step 2: Get credentials
  console.log('\n2️⃣  Getting OAuth credentials...');
  const credentials = await tokenManager.getCredentials();

  if (!credentials) {
    console.log('   ❌ Failed to get credentials');
    process.exit(1);
  }

  console.log('   ✅ Credentials retrieved');
  console.log(`   Has refresh token: ${credentials.refreshToken ? 'Yes' : 'No'}`);

  // Step 3: Create provider
  console.log('\n3️⃣  Creating ChatGPT OAuth provider...');
  const provider = createChatGPTOAuth({
    credentials,
  });
  console.log('   ✅ Provider created');

  // Step 4: Test API call
  console.log('\n4️⃣  Testing API call to gpt-5.5...');
  try {
    const result = await generateText({
      model: provider('gpt-5.5'),
      prompt: 'Say "OAuth test successful!" if you can hear me.',
    });

    console.log('   ✅ API call successful');
    console.log(`   Response: ${result.text}`);
    console.log(`   Tokens used: ${result.usage?.totalTokens}`);
  } catch (error) {
    console.log('   ❌ API call failed');
    console.log(`   Error: ${error}`);
    process.exit(1);
  }

  // Step 5: Test a second current model.
  console.log('\n5️⃣  Testing API call to gpt-5.4...');
  try {
    const result = await generateText({
      model: provider('gpt-5.4'),
      prompt: 'Respond with "GPT-5.4 reachable."',
    });

    console.log('   ✅ API call successful');
    console.log(`   Response: ${result.text}`);
    console.log(`   Tokens used: ${result.usage?.totalTokens}`);
  } catch (error) {
    console.log('   ❌ API call failed');
    console.log(`   Error: ${error}`);
    process.exit(1);
  }

  // Step 6: Test token refresh simulation
  console.log('\n6️⃣  Testing token management...');
  const finalCreds = await tokenManager.getCredentials();
  if (finalCreds && finalCreds.accessToken !== credentials.accessToken) {
    console.log('   ✅ Token was refreshed during test');
  } else {
    console.log('   ✅ Token is still valid');
  }

  console.log('\n' + '━'.repeat(50));
  console.log('\n🎉 All tests passed!\n');
  console.log('The OAuth integration is working correctly.\n');
}

// Run tests
testOAuthIntegration().catch((error) => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});
