/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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

  it('loads synchronous active profile', () => {
    const active = ProfileManager.getActiveProfileIdSync();
    expect(active).toBe('default');
  });
});
