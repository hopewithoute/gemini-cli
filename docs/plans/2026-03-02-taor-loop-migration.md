# TAORLoop Migration Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md`
> to execute this plan in single-flow mode.

**Goal:** Migrate the Gemini CLI agentic loop from recursive generator
delegation to a unified flat `TAORLoop` abstraction, enabling sub-agent spawning
with independent context windows.

**Architecture:** Extract loop logic from `LocalAgentExecutor` (already
TAOR-style `while(true)`), generalize it into a shared `TAORLoop` class that
yields `AsyncGenerator` events. Refactor `GeminiClient` to use `TAORLoop`
instead of recursive `sendMessageStream`/`processTurn`. Refactor
`LocalAgentExecutor` to delegate to `TAORLoop`. Simplify `useGeminiStream` by
removing the `handleCompletedTools → submitQuery(isContinuation)` feedback loop.

**Tech Stack:** TypeScript, Vitest, AsyncGenerators, `@google/genai` SDK

**Design Doc:**
[2026-03-02-taor-loop-migration-design.md](file:///var/www/gemini-cli/docs/plans/2026-03-02-taor-loop-migration-design.md)

---

### Task 1: Create `TAORLoop` Core Class with Types

**Files:**

- Create: `packages/core/src/core/taorLoop.ts`
- Create: `packages/core/src/core/taorLoop.test.ts`

**Step 1: Define the TAORLoop types and interface**

Create `packages/core/src/core/taorLoop.ts` with the core types and class
skeleton. Extract the turn result pattern from
`LocalAgentExecutor.executeTurn()` (L73-82 in `local-executor.ts`):

```typescript
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GeminiChat } from './geminiChat.js';
import type { Content, PartListUnion } from '@google/genai';
import type { ServerGeminiStreamEvent } from './turn.js';
import { Turn } from './turn.js';
import type { Config } from '../config/config.js';
import type { ChatCompressionService } from '../services/chatCompressionService.js';
import type { LoopDetectionService } from '../services/loopDetectionService.js';

export interface TAORLoopConfig {
  maxTurns: number;
  maxTimeMinutes?: number;
  loopDetection: 'full' | 'basic' | 'off';
}

export type TAORTurnResult =
  | { status: 'continue'; toolResults: Content }
  | { status: 'stop'; reason: string; finalContent?: string };

export interface TAORResult {
  turnCount: number;
  stopReason: string;
  finalContent?: string;
}

export type TAORActivityEvent = {
  type:
    | 'THOUGHT_CHUNK'
    | 'TOOL_CALL_START'
    | 'TOOL_CALL_END'
    | 'ERROR'
    | 'TURN_COMPLETE'
    | 'CONTENT_CHUNK';
  agentName: string;
  data: Record<string, unknown>;
};

export type TAORActivityCallback = (event: TAORActivityEvent) => void;

export class TAORLoop {
  constructor(
    private readonly chat: GeminiChat,
    private readonly config: Config,
    private readonly loopConfig: TAORLoopConfig,
    private readonly onActivity?: TAORActivityCallback,
  ) {}

  async *run(
    query: PartListUnion,
    signal: AbortSignal,
    promptId: string,
  ): AsyncGenerator<ServerGeminiStreamEvent, TAORResult> {
    // TODO: implement in Task 2
    return { turnCount: 0, stopReason: 'not_implemented' };
  }

  async runToCompletion(
    query: PartListUnion,
    signal: AbortSignal,
    promptId: string,
  ): Promise<TAORResult> {
    const gen = this.run(query, signal, promptId);
    let result = await gen.next();
    while (!result.done) {
      result = await gen.next();
    }
    return result.value;
  }
}
```

**Step 2: Write the basic test**

Create `packages/core/src/core/taorLoop.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { TAORLoop, type TAORLoopConfig } from './taorLoop.js';

describe('TAORLoop', () => {
  it('should be constructable with required config', () => {
    const mockChat = {} as any;
    const mockConfig = {} as any;
    const loopConfig: TAORLoopConfig = {
      maxTurns: 10,
      loopDetection: 'off',
    };
    const loop = new TAORLoop(mockChat, mockConfig, loopConfig);
    expect(loop).toBeDefined();
  });

  it('runToCompletion should consume the generator', async () => {
    const mockChat = {} as any;
    const mockConfig = {} as any;
    const loopConfig: TAORLoopConfig = { maxTurns: 10, loopDetection: 'off' };
    const loop = new TAORLoop(mockChat, mockConfig, loopConfig);
    const result = await loop.runToCompletion(
      [{ text: 'test' }],
      new AbortController().signal,
      'test-prompt',
    );
    expect(result.stopReason).toBe('not_implemented');
  });
});
```

**Step 3: Run test to verify it passes**

Run: `npm test -w @google/gemini-cli-core -- src/core/taorLoop.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/core/src/core/taorLoop.ts packages/core/src/core/taorLoop.test.ts
git commit -m "feat(core): add TAORLoop class skeleton with types"
```

---

### Task 2: Implement TAORLoop THINK-ACT-OBSERVE-REPEAT Core

**Files:**

- Modify: `packages/core/src/core/taorLoop.ts`
- Modify: `packages/core/src/core/taorLoop.test.ts`

**Step 1: Write failing test for the TAOR loop with tool calls**

Add to `taorLoop.test.ts` a test that verifies:

- Loop calls `Turn.run()` (THINK)
- When Turn yields `ToolCallRequest`, loop executes tools (ACT)
- Tool results are appended to chat (OBSERVE)
- Loop continues (REPEAT) until no more tool calls

Mock `Turn.run()` to yield one `ToolCallRequest` then `Finished`.

**Step 2: Run test to verify it fails**

Run: `npm test -w @google/gemini-cli-core -- src/core/taorLoop.test.ts`
Expected: FAIL (run method returns stub)

**Step 3: Implement the TAOR loop**

Replace the `run()` stub with the actual `while` loop. Model the implementation
after `LocalAgentExecutor.run()` (L492-541 in `local-executor.ts`), but yield
`ServerGeminiStreamEvent` events for UI consumption:

```typescript
async *run(query, signal, promptId) {
  let turn = 0;
  let currentRequest = query;

  while (turn < this.loopConfig.maxTurns) {
    if (signal.aborted) break;

    // THINK: call the model
    const turnInstance = new Turn(this.chat, this.config, ...);
    const toolCallRequests = [];

    for await (const event of turnInstance.run(currentRequest, signal, promptId)) {
      yield event; // Forward to UI
      if (event.type === GeminiEventType.ToolCallRequest) {
        toolCallRequests.push(event.value);
      }
    }

    // DECIDE: if no tool calls, stop
    if (toolCallRequests.length === 0) {
      return { turnCount: turn, stopReason: 'model_stop' };
    }

    // ACT: execute tools
    const toolResults = await this.executeTools(toolCallRequests, signal);

    // OBSERVE: append results to chat history
    this.chat.addHistory(toolResults);
    currentRequest = []; // Next turn uses history only

    turn++;
    this.onActivity?.({ type: 'TURN_COMPLETE', agentName: 'main', data: { turn, maxTurns: this.loopConfig.maxTurns } });
  }

  return { turnCount: turn, stopReason: 'max_turns' };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -w @google/gemini-cli-core -- src/core/taorLoop.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/src/core/taorLoop.ts packages/core/src/core/taorLoop.test.ts
git commit -m "feat(core): implement TAORLoop THINK-ACT-OBSERVE-REPEAT core"
```

---

### Task 3: Add Compression, Loop Detection, and Hooks to TAORLoop

**Files:**

- Modify: `packages/core/src/core/taorLoop.ts`
- Modify: `packages/core/src/core/taorLoop.test.ts`

**Step 1: Write failing tests for compression and hook integration**

Test that:

- `beforeAgent` hook fires before first turn
- `afterAgent` hook fires after last turn
- Chat compression triggers when token count is high
- Loop detection fires after configured threshold

**Step 2: Run tests to verify they fail**

Run: `npm test -w @google/gemini-cli-core -- src/core/taorLoop.test.ts`
Expected: FAIL

**Step 3: Implement compression and hooks**

Port compression logic from `GeminiClient.processTurn()` (L577-588 in
`client.ts`) and hook firing from `GeminiClient.sendMessageStream()` (L830-860
in `client.ts`) into `TAORLoop.run()`.

**Step 4: Run tests to verify they pass**

Run: `npm test -w @google/gemini-cli-core -- src/core/taorLoop.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/src/core/taorLoop.ts packages/core/src/core/taorLoop.test.ts
git commit -m "feat(core): add compression, loop detection, and hooks to TAORLoop"
```

---

### Task 4: Refactor GeminiClient to Delegate to TAORLoop

**Files:**

- Modify: `packages/core/src/core/client.ts`
- Modify: `packages/core/src/core/client.test.ts`

**Step 1: Run existing tests as baseline**

Run: `npm test -w @google/gemini-cli-core -- src/core/client.test.ts` Expected:
PASS (all 3279 lines of existing tests)

**Step 2: Refactor `sendMessageStream` to use TAORLoop**

Replace recursive `sendMessageStream` (L789-925) and `processTurn` (L550-787)
with:

```typescript
async *sendMessageStream(request, signal, prompt_id, turns = MAX_TURNS) {
  const loop = new TAORLoop(this.getChat(), this.config, {
    maxTurns: turns,
    loopDetection: 'full',
  });
  yield* loop.run(request, signal, prompt_id);
}
```

Keep `GeminiClient` as the public API — it manages chat creation, system prompt,
IDE context, and tool registration. `TAORLoop` handles only the loop.

**Step 3: Run existing tests to verify backward compatibility**

Run: `npm test -w @google/gemini-cli-core -- src/core/client.test.ts` Expected:
PASS (all existing tests must still pass)

**Step 4: Commit**

```bash
git add packages/core/src/core/client.ts
git commit -m "refactor(core): delegate GeminiClient.sendMessageStream to TAORLoop"
```

---

### Task 5: Refactor LocalAgentExecutor to Use TAORLoop

**Files:**

- Modify: `packages/core/src/agents/local-executor.ts`
- Modify: `packages/core/src/agents/local-executor.test.ts`

**Step 1: Run existing tests as baseline**

Run: `npm test -w @google/gemini-cli-core -- src/agents/local-executor.test.ts`
Expected: PASS (all 2454 lines of existing tests)

**Step 2: Replace internal while loop with TAORLoop**

Replace `LocalAgentExecutor.run()` (L492-541) internal `while(true)` and
`executeTurn()`, `callModel()` methods with `TAORLoop.runToCompletion()`.

**Step 3: Run existing tests to verify backward compatibility**

Run: `npm test -w @google/gemini-cli-core -- src/agents/local-executor.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/core/src/agents/local-executor.ts
git commit -m "refactor(agents): delegate LocalAgentExecutor to TAORLoop"
```

---

### Task 6: Simplify useGeminiStream CLI Consumer

**Files:**

- Modify: `packages/cli/src/ui/hooks/useGeminiStream.ts`

**Step 1: Run existing tests as baseline**

Run: `npm test -w @google/gemini-cli` Expected: PASS

**Step 2: Remove the `handleCompletedTools → submitQuery(isContinuation)` flow**

Since tool execution now happens inside `TAORLoop`, the CLI only needs to:

1. Start the stream: `geminiClient.sendMessageStream(query)`
2. Render events as they arrive
3. No restart/continuation logic needed

Remove or simplify:

- `handleCompletedTools()` callback restart logic
- `isContinuation` parameter in `submitQuery()`
- `CoreToolScheduler` callbacks that trigger continuation

**Step 3: Run tests to verify**

Run: `npm test -w @google/gemini-cli` Expected: PASS

**Step 4: Commit**

```bash
git add packages/cli/src/ui/hooks/useGeminiStream.ts
git commit -m "refactor(cli): simplify useGeminiStream by removing tool feedback loop"
```

---

### Task 7: Add Extended Activity Events (TURN_COMPLETE, CONTENT_CHUNK)

**Files:**

- Modify: `packages/core/src/agents/types.ts`
- Modify: `packages/core/src/core/taorLoop.ts`
- Create: `packages/core/src/core/taorLoop.integration.test.ts`

**Step 1: Write failing test for new event types**

Test that `TAORLoop` emits `TURN_COMPLETE` after each turn and `CONTENT_CHUNK`
for streaming text.

**Step 2: Run test to verify it fails**

Run:
`npm test -w @google/gemini-cli-core -- src/core/taorLoop.integration.test.ts`
Expected: FAIL

**Step 3: Extend SubagentActivityEvent type and implement emissions**

Add `'TURN_COMPLETE' | 'CONTENT_CHUNK'` to the `SubagentActivityEvent.type`
union in `types.ts`.

**Step 4: Run test to verify it passes**

Run:
`npm test -w @google/gemini-cli-core -- src/core/taorLoop.integration.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/src/agents/types.ts packages/core/src/core/taorLoop.ts packages/core/src/core/taorLoop.integration.test.ts
git commit -m "feat(core): add TURN_COMPLETE and CONTENT_CHUNK activity events"
```

---

### Task 8: Export TAORLoop from Package and Final Verification

**Files:**

- Modify: `packages/core/src/index.ts` (add TAORLoop export)

**Step 1: Add export**

```typescript
export {
  TAORLoop,
  type TAORLoopConfig,
  type TAORResult,
} from './core/taorLoop.js';
```

**Step 2: Run full test suite**

Run: `npm run test` Expected: ALL PASS

**Step 3: Run typecheck**

Run: `npm run typecheck` Expected: PASS

**Step 4: Run lint**

Run: `npm run lint` Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): export TAORLoop from package"
```

---

### Task 9: Preflight Verification

**Step 1: Run full preflight**

Run: `npm run preflight` Expected: PASS (clean, install, build, lint, typecheck,
tests)

**Step 2: Verify LOC reduction**

Run:
`wc -l packages/core/src/core/client.ts packages/cli/src/ui/hooks/useGeminiStream.ts`
Expected: `client.ts` < 800 LOC (was 1121), `useGeminiStream.ts` < 1000 LOC
(was 1903)
