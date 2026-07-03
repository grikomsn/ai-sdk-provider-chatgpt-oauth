# Tool Calling

The provider exposes two Codex backend tools through AI SDK 7:

- `shell` executes a command array.
- `update_plan` updates a list of steps and statuses.

User tool names are mapped by convention:

| User tool name                                                 | Backend tool  |
| -------------------------------------------------------------- | ------------- |
| `bash`, `shell`, or a name containing `execute`/`command`      | `shell`       |
| `TodoWrite`, `update_plan`, or a name containing `plan`/`todo` | `update_plan` |

Other tools are omitted and reported as `unsupported` warnings.

## Shell

```typescript
import { spawn } from 'node:child_process';
import { generateText, tool } from 'ai';
import { z } from 'zod';

const result = await generateText({
  model: chatgpt('gpt-5.5'),
  prompt: 'List TypeScript files.',
  tools: {
    shell: tool({
      description: 'Run a sandboxed command',
      inputSchema: z.object({
        command: z.array(z.string()),
        workdir: z.string().optional(),
        timeout: z.number().optional(),
      }),
      execute: async ({ command, workdir, timeout }) =>
        runSandboxed(spawn, command, { workdir, timeout }),
    }),
  },
});
```

The schema must match the backend's command shape. Never pass these commands
directly to a host shell in production. Enforce an executable allowlist, path
restrictions, timeouts, output limits, and OS-level isolation.

## Planning

```typescript
const result = await generateText({
  model: chatgpt('gpt-5.5'),
  prompt: 'Plan a small migration.',
  tools: {
    update_plan: tool({
      description: 'Update the task plan',
      inputSchema: z.object({
        explanation: z.string().optional(),
        plan: z.array(
          z.object({
            step: z.string(),
            status: z.enum(['pending', 'in_progress', 'completed']),
          })
        ),
      }),
      execute: async ({ explanation, plan }) => {
        await savePlan({ explanation, plan });
        return 'Plan saved';
      },
    }),
  },
});
```

## Multi-Step Calls

AI SDK executes mapped tools on the client. Configure an AI SDK stop condition
when more than one model step is required:

```typescript
import { generateText, isStepCount } from 'ai';

const result = await generateText({
  model: chatgpt('gpt-5.5'),
  prompt: 'Inspect the project and summarize it.',
  tools,
  stopWhen: isStepCount(5),
});
```

The provider marks tool-call responses with the V4 `tool-calls` finish reason so
AI SDK can continue the loop. Conversation history is sent on each backend call;
the backend itself does not retain state.

See the [tool examples](../examples/) and [limitations](./limitations.md).
