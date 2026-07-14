# ChatGPT OAuth web example

A minimal Next.js 16 and AI SDK 7 chat that authenticates a ChatGPT account with Codex device-code OAuth, then streams responses through `@grikomsn/ai-sdk-provider-chatgpt-oauth`.

This is a demonstration app for a community provider that targets ChatGPT's Codex backend, not the public OpenAI API. Review the provider's [limitations](../docs/limitations.md) before adapting it for production or multi-user use.

## Run locally

Use Node.js 22 or newer.

```bash
npm install
cp .env.example .env.local
```

Replace `SESSION_SECRET` with a random value of at least 32 characters. For example:

```bash
openssl rand -hex 32
```

Then start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), select **Continue with ChatGPT**, and complete the device-code flow.

The access and refresh tokens are encrypted with AES-256-GCM and stored in `HttpOnly`, `SameSite=Lax` cookies. They are never exposed to client-side JavaScript.

## Verify

```bash
npm run check
```

## Deploy to Vercel

Create a Vercel project with `oauth-web-example` as its Root Directory, add a production/preview/development `SESSION_SECRET`, and connect the project to this GitHub repository. Vercel will create preview deployments for branches and production deployments from `main`.

The browser-based Codex OAuth client uses a localhost callback, so this hosted example intentionally uses OpenAI's device-code flow instead of an unsupported Vercel callback URL.
