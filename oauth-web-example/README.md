# ChatGPT OAuth web example

A minimal Next.js 16 and AI SDK 7 chat that authenticates a ChatGPT account with Codex device-code OAuth, then streams responses through `@grikomsn/ai-sdk-provider-chatgpt-oauth`.

After sign-in, the app loads every model currently listed for the account, defaults to GPT-5.6 Luna when available, and offers only the direct reasoning-effort levels supported by the selected model.

This is a demonstration app for a community provider that targets ChatGPT's Codex backend, not the public OpenAI API. Review the provider's [limitations](../docs/limitations.md) before adapting it for production or multi-user use.

## Run locally

Use Node.js 22 or newer.

```bash
npm install
cp .env.example .env.local
```

Set `SESSION_SECRET` to at least 32 random bytes encoded as hexadecimal or base64. Passphrases are
rejected. For example:

```bash
openssl rand -hex 32
```

Then start the app:

```bash
npm run dev
```

Cookies stay secure by default. For local HTTP development only, uncomment
`ALLOW_INSECURE_COOKIES=true` in `.env.local`. Never enable it on a deployed HTTPS environment.

Open [http://localhost:3000](http://localhost:3000), select **Continue with ChatGPT**, and complete the device-code flow.

The access and refresh tokens are encrypted with AES-256-GCM using a scrypt-derived key and stored
in `HttpOnly`, `SameSite=Lax` cookies. They are never exposed to client-side JavaScript. Invalid
session-secret configuration is rejected when the Node.js runtime starts.

## Verify

```bash
npm run check
```

## Deploy to Vercel

Create a Vercel project with `oauth-web-example` as its Root Directory, add a production/preview/development `SESSION_SECRET`, and connect the project to this GitHub repository. Vercel will create preview deployments for branches and production deployments from `main`.

The browser-based Codex OAuth client uses a localhost callback, so this hosted example intentionally uses OpenAI's device-code flow instead of an unsupported Vercel callback URL.

This repository is intentionally a demo, not a production multi-user auth service. It applies
per-client throttling to device and chat requests and coalesces concurrent token refreshes within
one server instance. Vercel can run multiple function instances, so a production adaptation must
replace these process-local guards with a durable shared rate limiter and shared session/token
store.

The chat route sets a 60-second maximum duration, which fits Vercel's current one-minute free-plan
Fluid Compute limit. Keep streaming enabled and adjust the duration to match the deployment plan if
you adapt the example.

### Deployment assumptions

Vercel overwrites the forwarded host, protocol, and client-IP headers before invoking a Function,
so the app trusts them automatically when `VERCEL=1`. For another reverse proxy, only set
`TRUST_PROXY=true` when that proxy sanitizes and overwrites `X-Forwarded-Host`,
`X-Forwarded-Proto`, `X-Forwarded-For`, and `X-Real-IP`. Without that opt-in, forwarded headers are
ignored for CSRF and rate-limit decisions. The standard Web `Request` API does not expose the
direct socket address, so an unconfigured self-hosted deployment deliberately puts all clients in
one fail-closed rate-limit bucket. Self-hosted deployments behind a sanitizing proxy must enable
`TRUST_PROXY=true` to get per-client buckets.

Set `APP_ORIGIN` to a canonical origin such as `https://chat.example.com` when a self-hosted setup
has a fixed public URL. This takes precedence over request and forwarded headers. Cookies are
`Secure` by default; `ALLOW_INSECURE_COOKIES=true` is only for local HTTP development.

OpenAI Codex treats HTTP 403 and 404 responses from the device-token endpoint as pending while the
15-minute device window remains active; other non-success responses terminate the flow.
