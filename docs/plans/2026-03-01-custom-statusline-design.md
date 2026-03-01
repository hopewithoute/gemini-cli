# Custom Status Line Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Menambahkan fitur `Custom Status Line` pada Gemini CLI yang
memungkinkan pengguna mendefinisikan _script shell_ khusus untuk menggantikan
`Footer` bawaan, di mana data _session_ (JSON) di-pipe melalui `stdin` dan
hasilnya (termasuk _ANSI escape codes_) dirender di UI terminal.

**Architecture:**

1. **Configuration:** Menambahkan properti `ui.statusLine.command` pada skema
   `settings.schema.json` dan antarmuka `Settings` di `@google/gemini-cli-core`.
2. **Core Service:** Membuat `StatusLineService` di `packages/cli` (atau core)
   yang akan membaca state saat ini (model, token, branch, dll.), memformatnya
   menjadi JSON, dan menjalankan perintah shell secara asynchronous (debounced
   300ms) dengan `stdin` yang telah di-pipe.
3. **UI Integration:** Memodifikasi komponen `Footer.tsx` di
   `packages/cli/src/ui/components` untuk merender string hasil (menggunakan
   `<Text>` yang mendukung ANSI dari Ink) apabila `ui.statusLine.command`
   dikonfigurasi. Jika tidak, tetap merender komponen Footer bawaan.

**Tech Stack:** TypeScript, React (Ink), Node.js `child_process` (exec/spawn),
Zod (untuk validasi schema).

---

### Task 1: Update Settings Schema and Types

**Files:**

- Modify: `schemas/settings.schema.json`
- Modify: `packages/core/src/config/settings.ts`

**Step 1: Write the failing test for Settings Schema**

Buat test atau perbarui test yang memvalidasi struktur default settings.

**Step 2: Update Schema and Types**

Tambahkan konfigurasi `statusLine` di `schemas/settings.schema.json`:

```json
"ui": {
  "type": "object",
  "properties": {
    "statusLine": {
      "type": "object",
      "properties": {
        "command": {
          "type": "string",
          "description": "Shell command to execute for custom status line. Receives session state via stdin JSON."
        }
      }
    },
    // ... existing properties
  }
}
```

Perbarui tipe `Settings` di `packages/core/src/config/settings.ts`:

```typescript
export interface Settings {
  // ...
  ui: {
    statusLine?: {
      command?: string;
    };
    // ...
  };
}
```

**Step 3: Commit**

```bash
git add schemas/settings.schema.json packages/core/src/config/settings.ts
git commit -m "feat(config): add ui.statusLine.command to settings schema"
```

---

### Task 2: Create StatusLineService

**Files:**

- Create: `packages/cli/src/services/StatusLineService.ts`
- Create: `packages/cli/src/services/StatusLineService.test.ts`

**Step 1: Write the failing test**

```typescript
import { StatusLineService } from './StatusLineService.js';
import { vi, describe, it, expect } from 'vitest';

describe('StatusLineService', () => {
  it('should execute command and return output', async () => {
    const service = new StatusLineService();
    // Use a simple mock command like 'jq .model.id' or node script
    const output = await service.executeStatusLine('jq -r .model.id', {
      model: { id: 'test-model' },
    });
    expect(output.trim()).toBe('test-model');
  });
});
```

**Step 2: Implement StatusLineService**

Buat service yang menggunakan `exec` dari `node:child_process` untuk menjalankan
perintah, dan berikan JSON state via stdin. Harus debounced dan menangani error.

```typescript
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export class StatusLineService {
  private currentProcess: AbortController | null = null;

  async executeStatusLine(command: string, state: any): Promise<string> {
    if (this.currentProcess) {
      this.currentProcess.abort();
    }
    this.currentProcess = new AbortController();

    try {
      const child = exec(command, { signal: this.currentProcess.signal });
      let output = '';

      if (child.stdout) {
        child.stdout.on('data', (data) => (output += data.toString()));
      }

      if (child.stdin) {
        child.stdin.write(JSON.stringify(state));
        child.stdin.end();
      }

      await new Promise((resolve, reject) => {
        child.on('close', resolve);
        child.on('error', reject);
      });

      return output.trim();
    } catch (error: any) {
      if (error.name === 'AbortError') return '';
      console.error('StatusLine Command Error:', error);
      return `Error executing status line: ${error.message}`;
    } finally {
      this.currentProcess = null;
    }
  }
}
```

**Step 3: Run tests**

```bash
npm run test -w @google/gemini-cli -- src/services/StatusLineService.test.ts
```

**Step 4: Commit**

```bash
git add packages/cli/src/services/StatusLineService.ts packages/cli/src/services/StatusLineService.test.ts
git commit -m "feat(cli): create StatusLineService for custom status execution"
```

---

### Task 3: Integrate Status Line execution into UI State (React Hook)

**Files:**

- Create: `packages/cli/src/ui/hooks/useCustomStatusLine.ts`
- Create: `packages/cli/src/ui/hooks/useCustomStatusLine.test.ts`

**Step 1: Write the Hook** Hook ini akan merangkum state saat ini dari
`UIStateContext`, `ConfigContext`, dsb., memanggil `StatusLineService`, dan
menyimpan hasil string.

```typescript
import { useState, useEffect } from 'react';
import { StatusLineService } from '../../services/StatusLineService.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
// ... import other contexts as needed to build the JSON state ...

const statusLineService = new StatusLineService();

export function useCustomStatusLine() {
  const settings = useSettings();
  const uiState = useUIState();
  const command = settings.merged.ui?.statusLine?.command;
  const [output, setOutput] = useState<string | null>(null);

  useEffect(() => {
    if (!command) {
      setOutput(null);
      return;
    }

    // Build the JSON state matching Claude Code's schema as close as possible
    const statePayload = {
      model: { id: uiState.currentModel, display_name: uiState.currentModel },
      workspace: { current_dir: process.cwd() },
      usage: { prompt_tokens: uiState.sessionStats.lastPromptTokenCount },
      // ... add more relevant fields
    };

    let isMounted = true;

    // Simple debounce
    const timeout = setTimeout(async () => {
      const result = await statusLineService.executeStatusLine(
        command,
        statePayload,
      );
      if (isMounted) setOutput(result);
    }, 300); // 300ms debounce

    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [
    command,
    uiState.currentModel,
    uiState.sessionStats.lastPromptTokenCount,
  ]); // Add all dependencies

  return { output, isConfigured: !!command };
}
```

**Step 2: Commit**

```bash
git add packages/cli/src/ui/hooks/useCustomStatusLine.ts packages/cli/src/ui/hooks/useCustomStatusLine.test.ts
git commit -m "feat(cli): add useCustomStatusLine hook for UI integration"
```

---

### Task 4: Modify Footer Component

**Files:**

- Modify: `packages/cli/src/ui/components/Footer.tsx`
- Modify: `packages/cli/src/ui/components/Footer.test.tsx` (or related snapshot
  tests)

**Step 1: Write test for Footer with custom status** Update test Footer untuk
merender teks kustom jika statusLine hook mengembalikan output.

**Step 2: Modify Footer.tsx**

Gunakan hook yang baru dibuat. Jika `isConfigured` true, render output. Jika
false, render logika Footer bawaan yang sudah ada.

```tsx
import { useCustomStatusLine } from '../hooks/useCustomStatusLine.js';
// ... existing imports

export const Footer: React.FC = () => {
  const { output, isConfigured } = useCustomStatusLine();

  if (isConfigured) {
    return (
      <Box width="100%" paddingX={1}>
        <Text>{output || 'Loading status...'}</Text>
      </Box>
    );
  }

  // ... existing Footer implementation below
  const uiState = useUIState();
  // ...
```

**Step 3: Run Tests** Penting: Perbarui SVG snapshots jika diperlukan karena
layout berubah.

```bash
npm run test -w @google/gemini-cli -- src/ui/components/Footer.test.tsx -u
```

**Step 4: Commit**

```bash
git add packages/cli/src/ui/components/Footer.tsx packages/cli/src/ui/components/Footer.test.tsx
git commit -m "feat(cli): render custom status line in Footer when configured"
```

---

### Task 5: Documentation Updates

**Files:**

- Create/Modify: `docs/cli/custom-statusline.md`
- Modify: `docs/cli/index.md` (to link to new page)

**Step 1: Write Documentation** Gunakan skill `docs-writer`. Buat panduan
singkat tentang cara mengonfigurasi `ui.statusLine.command` di `settings.json`,
format JSON `stdin` yang dikirim, dan contoh _shell script_ menggunakan `jq`.

**Step 2: Commit**

```bash
git add docs/
git commit -m "docs: add documentation for Custom Status Line feature"
```
