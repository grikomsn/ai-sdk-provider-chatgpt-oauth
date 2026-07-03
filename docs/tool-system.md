# Tool System Architecture

AI SDK sends V4 function-tool definitions to the provider. The Codex backend does
not accept arbitrary schemas at this endpoint, so the provider maps compatible
names to one of two fixed backend definitions:

```text
AI SDK tool
    |
    +-- command-like name --> Codex shell schema
    |
    +-- planning-like name -> Codex update_plan schema
    |
    +-- anything else ------> omitted + unsupported warning
```

The reverse mapping is retained for the response. When the backend calls `shell`,
for example, the provider emits the original user tool name and stringified input
in the V4 tool-call part.

Streaming follows the AI SDK V4 sequence:

```text
stream-start
tool-input-start
tool-input-delta*
tool-input-end
tool-call
finish (tool-calls)
```

For non-streaming calls, the provider collects the backend SSE response and
returns the same tool call as generated content.

This design deliberately does not pretend that arbitrary tools are supported.
Callers receive warnings for omitted tools and can decide whether to continue.
See [tool calling](./tool-calling.md) for supported schemas and security guidance.
