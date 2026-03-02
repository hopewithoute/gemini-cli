# Design: Migrasi Agentic Loop ke TAORLoop Abstraction

## Ringkasan

Refaktor agentic loop Gemini CLI dari **recursive generator delegation**
(`yield*` di `sendMessageStream`/`processTurn`) menjadi **flat iterative TAOR
loop** (Think-Act-Observe-Repeat). Satu class `TAORLoop` menjadi satu-satunya
tempat loop berjalan — digunakan oleh main agent DAN sub-agents.

**Motivasi:**

- Current loop tersebar di 2 layer (Core + CLI), rekursif, dan sulit di-debug
- `LocalAgentExecutor` sudah menggunakan TAOR-style `while(true)` loop —
  membuktikan pattern ini bekerja
- Arsitektur baru memungkinkan **sub-agent spawning** dengan context window
  independen

---

## 1. Architecture

### Before (Current)

```
User Input → useGeminiStream (1903 LOC)
  → submitQuery()
  → GeminiClient.sendMessageStream()  ← recursive yield*
    → processTurn()                    ← recursive yield*
      → Turn.run() → API
  ← yield events to CLI
  → CoreToolScheduler.execute()
  → handleCompletedTools()
  → submitQuery(results, isContinuation)  ← restart from UI
```

Loop tersebar di 2 layer, rekursif, 2500+ LOC gabungan.

### After (Target)

```
User Input → useGeminiStream (thin renderer, ~500 LOC)
  → consumes TAORLoop stream events

TAORLoop.run(query, signal)
  while (turn < maxTurns):
    Turn.run()           → THINK
    if no tools → break  → DECIDE
    executeTools()       → ACT
    append results       → OBSERVE
    turn++               → REPEAT

Sub-agent: new TAORLoop(new GeminiChat(), scopedTools, config)
```

### Component Changes

| Before                                               | After                    | Perubahan                   |
| ---------------------------------------------------- | ------------------------ | --------------------------- |
| `GeminiClient.sendMessageStream()`                   | `TAORLoop.run()`         | Rekursi → iterasi           |
| `GeminiClient.processTurn()`                         | `TAORLoop.executeTurn()` | Inline ke loop              |
| `Turn.run()`                                         | `Turn.run()`             | **Tidak berubah**           |
| `CoreToolScheduler`                                  | Dikelola oleh loop       | State machine tetap         |
| `handleCompletedTools() → submitQuery(continuation)` | **Dihapus**              | Tools selesai di dalam loop |
| Next-speaker LLM check                               | **Dihapus**              | `finishReason` cukup        |
| `LocalAgentExecutor.run()` while loop                | Uses `TAORLoop`          | Unifikasi, hapus duplikasi  |

---

## 2. TAORLoop Interface

```typescript
interface TAORLoopConfig {
  maxTurns: number;
  maxTimeMinutes?: number;
  compressionEnabled: boolean;
  loopDetection: 'full' | 'basic' | 'off';
}

class TAORLoop {
  constructor(
    chat: GeminiChat,
    toolScheduler: ToolScheduler,
    config: TAORLoopConfig,
    onEvent?: ActivityCallback,
  );

  async *run(
    query: PartListUnion,
    signal: AbortSignal,
  ): AsyncGenerator<TAORStreamEvent, TAORResult>;

  async runToCompletion(
    query: PartListUnion,
    signal: AbortSignal,
  ): Promise<TAORResult>;
}
```

`run()` yields stream events (untuk UI rendering), `runToCompletion()`
menjalankan loop sampai selesai (untuk sub-agents).

---

## 3. Data Flow Per Turn

```
TAORLoop.run()
  │
  ├── THINK ─── Turn.run(query) → API stream
  │              yield Content/Thought events → UI
  │
  ├── DECIDE ── Has tool calls? No → break
  │
  ├── ACT ───── toolScheduler.execute(calls) (parallel OK)
  │
  ├── OBSERVE ─ chat.addHistory(toolResults)
  │
  └── REPEAT ── turn++
```

---

## 4. Context Handoff & Streaming Progress

### Context Handoff (Summary Return Pattern)

Sub-agent mengembalikan **summary string only** ke parent via `complete_task`
tool. Parent menerima ini sebagai `functionResponse`. Tidak ada transfer context
window.

### Streaming Progress

Existing `SubagentActivityEvent` diperluas:

| Event Type        | Status      | Fungsi                |
| ----------------- | ----------- | --------------------- |
| `THOUGHT_CHUNK`   | ✅ Existing | Model sedang berpikir |
| `TOOL_CALL_START` | ✅ Existing | Tool mulai dieksekusi |
| `TOOL_CALL_END`   | ✅ Existing | Tool selesai          |
| `ERROR`           | ✅ Existing | Error terjadi         |
| `TURN_COMPLETE`   | 🆕 New      | Progress: turn N of M |
| `CONTENT_CHUNK`   | 🆕 New      | Text output streaming |

Events di-bubble dari sub-agent ke parent via `ActivityCallback` chain.

### Sub-agent Spawning

```typescript
if (isSubagentTool(toolCall)) {
  const subLoop = new TAORLoop(
    new GeminiChat(subAgentConfig),
    subAgentToolRegistry,
    { maxTurns: 15, maxTimeMinutes: 5 },
    (event) => this.onEvent?.(event), // bubble to parent
  );
  const result = await subLoop.runToCompletion(query, signal);
  // → injected as functionResponse into parent chat
}
```

---

## 5. Migration Strategy

### Phase 1: Create `TAORLoop` class

- Extract loop logic dari `LocalAgentExecutor.run()` (sudah TAOR)
- Generalize untuk support `AsyncGenerator` yields (stream events)
- File baru: `packages/core/src/core/taorLoop.ts`

### Phase 2: Migrate `GeminiClient`

- Refaktor `sendMessageStream` + `processTurn` → delegate ke `TAORLoop`
- Hapus recursive `yield*`
- Hapus next-speaker LLM check
- `GeminiClient` menjadi factory + chat management

### Phase 3: Migrate `LocalAgentExecutor`

- Ganti internal while loop dengan `TAORLoop.runToCompletion()`
- Hapus duplikasi `executeTurn`, `callModel`, compression logic

### Phase 4: Simplify CLI consumer

- Hapus `handleCompletedTools` → `submitQuery(isContinuation)` flow
- `useGeminiStream` hanya konsumsi + render stream events

### Phase 5: Testing & Verification

- Port existing tests dari `client.test.ts` dan `local-executor.test.ts`
- Buat integration tests untuk sub-agent spawning
- Verify streaming progress rendering

---

## 6. Risk & Mitigation

| Risk                             | Mitigation                                                        |
| -------------------------------- | ----------------------------------------------------------------- |
| Breaking existing hook system    | `TAORLoop` tetap fire `beforeAgent`/`afterAgent` hooks            |
| Streaming performance regression | `TAORLoop.run()` tetap AsyncGenerator, UI rendering tidak berubah |
| Sub-agent tool detection         | Reuse existing `SubagentToolWrapper` + `AgentRegistry`            |
| Loop detection degradation       | Configurable: `full` / `basic` / `off` per config                 |

---

## 7. Success Criteria

- [ ] `client.ts` LOC berkurang >30%
- [ ] `useGeminiStream.ts` LOC berkurang >50%
- [ ] `LocalAgentExecutor` loop logic dihapus (uses `TAORLoop`)
- [ ] Sub-agent spawning bekerja dengan context window independen
- [ ] Streaming progress events tampil di UI
- [ ] Semua existing tests tetap pass
- [ ] Non-interactive mode tetap bekerja
