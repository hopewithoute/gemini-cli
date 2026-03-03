# Meta-Tools (Search & Execute) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Implement a Gated Meta-Registry that exposes only `search_tools` and
`execute_tool` to the main LLM, using an isolated sub-session for semantic tool
discovery.

**Architecture:** A wrapper-based approach where `MetaToolRegistry` delegates
actual tool execution to the original `ToolRegistry` while providing a new
`SemanticSearchService` for tool discovery.

**Tech Stack:** TypeScript, Gemini API (via `@google/genai`), Vitest for
testing.

---

### Task 1: Create SemanticSearchService

**Files:**

- Create: `packages/core/src/tools/semantic-search-service.ts`
- Test: `packages/core/src/tools/semantic-search-service.test.ts`

**Step 1: Write the failing test** Create a test that mocks Gemini API and
verifies `search_tools` returns relevant tool schemas from a mock registry.

**Step 2: Run test to verify it fails** Run:
`npm test -w @google/gemini-cli-core -- packages/core/src/tools/semantic-search-service.test.ts`
Expected: FAIL (File does not exist)

**Step 3: Implement SemanticSearchService** Implement the service using a
separate Gemini session and a specific prompt for tool selection.

**Step 4: Run test to verify it passes** Run:
`npm test -w @google/gemini-cli-core -- packages/core/src/tools/semantic-search-service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/src/tools/semantic-search-service.ts packages/core/src/tools/semantic-search-service.test.ts
git commit -m "feat(core): add SemanticSearchService for meta-tools"
```

---

### Task 2: Implement MetaToolRegistry Wrapper

**Files:**

- Create: `packages/core/src/tools/meta-tool-registry.ts`
- Test: `packages/core/src/tools/meta-tool-registry.test.ts`

**Step 1: Write the failing test** Verify that
`MetaToolRegistry.getFunctionDeclarations()` only returns `search_tools` and
`execute_tool`.

**Step 2: Run test to verify it fails** Run:
`npm test -w @google/gemini-cli-core -- packages/core/src/tools/meta-tool-registry.test.ts`
Expected: FAIL

**Step 3: Implement MetaToolRegistry** Create the class wrapping the existing
`ToolRegistry`. Implement `search_tools` using `SemanticSearchService` and
`execute_tool` using the wrapped registry.

**Step 4: Run test to verify it passes** Run:
`npm test -w @google/gemini-cli-core -- packages/core/src/tools/meta-tool-registry.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/src/tools/meta-tool-registry.ts packages/core/src/tools/meta-tool-registry.test.ts
git commit -m "feat(core): add MetaToolRegistry wrapper"
```

---

### Task 3: Integrate MetaToolRegistry into Client

**Files:**

- Modify: `packages/core/src/core/client.ts`

**Step 1: Update Client to use MetaToolRegistry** Locate the initialization of
`ToolRegistry` in `client.ts` and wrap it with `MetaToolRegistry` if the
meta-tools feature is enabled (or by default if requested).

**Step 2: Verify integration with an integration test** Run existing tool tests
to ensure `execute_tool` correctly proxies calls to the real tools.

**Step 3: Commit**

```bash
git add packages/core/src/core/client.ts
git commit -m "feat(core): integrate MetaToolRegistry into client"
```

---

### Task 4: Final Validation

**Step 1: Run all tests** Run: `npm run test` Expected: All tests PASS,
including new meta-tool tests.

**Step 2: Manual Verification** Run the CLI and verify the model calls
`search_tools` when asked to perform a task.
