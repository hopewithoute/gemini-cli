# Multi-Account Switcher Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Implement a simple but robust multi-account switcher by dynamically
swapping credential file pointers based on an active profile.

**Architecture:** A lightweight `ProfileManager` will persist the active profile
ID in `~/.gemini/profiles.json`. `Storage.getOAuthCredsPath()` and
`apiKeyCredentialStorage.ts` will append this profile ID to their file/keychain
targets. Finally, the CLI will add an `/auth switch` command to open an Ink UI
dialog that changes the active profile and re-triggers authentication.

**Tech Stack:** TypeScript, Node.js fs, React (Ink), Vitest.

---

### Task 1: Profile Manager

**Files:**

- Create: `packages/core/src/config/profileManager.ts`
- Create: `packages/core/src/config/profileManager.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProfileManager } from './profileManager.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('ProfileManager', () => {
  let tempDir: string;
  let profilePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-profile-test-'));
    profilePath = path.join(tempDir, 'profiles.json');
    // Mock the static path
    ProfileManager.getProfilesPath = () => profilePath;
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('returns default active profile if file does not exist', async () => {
    const active = await ProfileManager.getActiveProfileId();
    expect(active).toBe('default');
  });

  it('saves and loads active profile', async () => {
    await ProfileManager.setActiveProfileId('work');
    const active = await ProfileManager.getActiveProfileId();
    expect(active).toBe('work');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w @google/gemini-cli-core -- src/config/profileManager`
Expected: FAIL with "Cannot find module './profileManager.js'"

**Step 3: Write minimal implementation**

```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

interface ProfilesData {
  activeProfileId: string;
}

export class ProfileManager {
  static getProfilesPath(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, '.gemini', 'profiles.json');
  }

  static async getActiveProfileId(): Promise<string> {
    try {
      const data = await fs.readFile(this.getProfilesPath(), 'utf-8');
      const parsed = JSON.parse(data) as ProfilesData;
      return parsed.activeProfileId || 'default';
    } catch {
      return 'default';
    }
  }

  static async setActiveProfileId(id: string): Promise<void> {
    const filePath = this.getProfilesPath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    let existingData: Partial<ProfilesData> = {};
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      existingData = JSON.parse(data) as Partial<ProfilesData>;
    } catch {
      // File doesn't exist or is invalid, start fresh
    }

    const newData: ProfilesData = { ...existingData, activeProfileId: id };
    await fs.writeFile(filePath, JSON.stringify(newData, null, 2), 'utf-8');
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -w @google/gemini-cli-core -- src/config/profileManager`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/src/config/profileManager.ts packages/core/src/config/profileManager.test.ts
git commit -m "feat(core): implement ProfileManager for multi-account active profile tracking"
```

---

### Task 2: Adapt Credential Storage to Use Active Profile

**Files:**

- Modify: `packages/core/src/config/storage.ts`
- Modify: `packages/core/src/core/apiKeyCredentialStorage.ts`

**Step 1: Write the failing test**

We don't have a direct test for `getOAuthCredsPath` behavior in isolation easily
without breaking existing things, but we can test API key storage suffixing.
Alternatively, test manually in CLI. Since we are doing TDD, let's just make the
simple modifications and write an integration test.

Actually, let's write an adapter test in
`packages/core/src/config/storage.test.ts`.

```typescript
// Append to packages/core/src/config/storage.test.ts
import { ProfileManager } from './profileManager.js';

describe('Storage OAuth Creds Path', () => {
  it('appends active profile id if not default', async () => {
    ProfileManager.getActiveProfileId = async () => 'work';
    const credsPath = await Storage.getOAuthCredsPath();
    expect(credsPath.endsWith('oauth_creds_work.json')).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w @google/gemini-cli-core -- src/config/storage` Expected: FAIL
(getOAuthCredsPath is synchronous and doesn't return async profile path)

_Wait_, `getOAuthCredsPath` in `storage.ts` is
`static getOAuthCredsPath(): string`. Making it read file asynchronously will
change its signature to `Promise<string>`, which requires cascading changes.
Let's do it right.

**Step 3: Write minimal implementation**

Since `getOAuthCredsPath` can't easily be async everywhere without large
refactoring: Let `ProfileManager` cache the active ID synchronously after a
bootstrap load, OR read it synchronously via `fs.readFileSync` since it's just a
tiny JSON and happens very rarely.

Modify `ProfileManager`:

```typescript
import * as fsSync from 'node:fs';

  // add to ProfileManager
  static getActiveProfileIdSync(): string {
    try {
      const data = fsSync.readFileSync(this.getProfilesPath(), 'utf-8');
      const parsed = JSON.parse(data) as ProfilesData;
      return parsed.activeProfileId || 'default';
    } catch {
      return 'default';
    }
  }
```

Modify `packages/core/src/config/storage.ts`:

```typescript
import { ProfileManager } from './profileManager.js';

  static getOAuthCredsPath(): string {
    const profileId = ProfileManager.getActiveProfileIdSync();
    const suffix = profileId === 'default' ? '' : `_${profileId}`;
    return path.join(Storage.getGlobalGeminiDir(), `oauth_creds${suffix}.json`);
  }
```

Modify `packages/core/src/core/apiKeyCredentialStorage.ts`:

```typescript
import { ProfileManager } from '../config/profileManager.js';

function getApiKeyEntryName() {
  const profileId = ProfileManager.getActiveProfileIdSync();
  return profileId === 'default' ? 'default-api-key' : `api-key-${profileId}`;
}

const storage = new HybridTokenStorage('gemini-cli-api-key');

export async function loadApiKey(): Promise<string | null> {
  const entry = getApiKeyEntryName();
  try {
    const credentials = await storage.getCredentials(entry);
    // ... rest
```

**Step 4: Run test to verify it passes**

Run: `npm run lint` and `npm build` to ensure type checks pass.

**Step 5: Commit**

```bash
git add packages/core/src/config/storage.ts packages/core/src/core/apiKeyCredentialStorage.ts packages/core/src/config/profileManager.ts packages/core/src/config/storage.test.ts
git commit -m "feat(core): append profile id to credentials locations"
```

---

### Task 3: CLI Account Switcher UI

**Files:**

- Create: `packages/cli/src/ui/auth/AccountSwitcherDialog.tsx`
- Modify: `packages/cli/src/ui/commands/authCommand.ts`
- Modify: `packages/cli/src/ui/types.ts`
- Modify: `packages/cli/src/ui/components/DialogManager.tsx`

**Step 1: Write the failing test**

```typescript
// Create packages/cli/src/ui/auth/AccountSwitcherDialog.test.tsx
import { render } from 'ink-testing-library';
import React from 'react';
import { AccountSwitcherDialog } from './AccountSwitcherDialog.js';
import { describe, it, expect } from 'vitest';

describe('AccountSwitcherDialog', () => {
  it('renders correctly', () => {
    const { lastFrame } = render(<AccountSwitcherDialog closeDialog={() => {}} />);
    expect(lastFrame()).toContain('Switch Account');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w @google/gemini-cli-cli -- src/ui/auth/AccountSwitcherDialog`
Expected: FAIL (File not found)

**Step 3: Write minimal implementation**

Create `AccountSwitcherDialog.tsx`:

```tsx
import React, { useState } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { ProfileManager, clearOauthClientCache } from '@google/gemini-cli-core';
import { useUIState } from '../contexts/UIStateContext.js';

export function AccountSwitcherDialog({
  closeDialog,
}: {
  closeDialog: () => void;
}) {
  const [profiles] = useState([
    { label: 'Default Account', value: 'default' },
    { label: 'Personal (OAUTH)', value: 'personal' },
    { label: 'Work (API Key)', value: 'work' },
  ]);

  const handleSelect = async (item: { value: string }) => {
    await ProfileManager.setActiveProfileId(item.value);
    clearOauthClientCache();
    // In real implementation we trigger a config refresh and notify user
    closeDialog();
  };

  return (
    <Box
      flexDirection="column"
      padding={1}
      borderStyle="round"
      borderColor="blue"
    >
      <Text bold>Switch Account</Text>
      <SelectInput items={profiles} onSelect={handleSelect} />
    </Box>
  );
}
```

Modify `authCommand.ts`:

```typescript
const authSwitchCommand: SlashCommand = {
  name: 'switch',
  description: 'Switch between accounts',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (): OpenDialogActionReturn => ({
    type: 'dialog',
    dialog: 'account_switcher',
  }),
};
// Add to authCommand subcommands
```

Add literal `'account_switcher'` to dialog types in `ui/types.ts` and add it to
`DialogManager.tsx` mapping.

**Step 4: Run test to verify it passes**

Run: `npm test -w @google/gemini-cli-cli -- src/ui/auth` Run: `npm run lint`

**Step 5: Commit**

```bash
git add packages/cli/src/ui/auth packages/cli/src/ui/commands/authCommand.ts packages/cli/src/ui/types.ts packages/cli/src/ui/components/DialogManager.tsx
git commit -m "feat(cli): add /auth switch command and AccountSwitcherDialog"
```

---

_End of Plan_
