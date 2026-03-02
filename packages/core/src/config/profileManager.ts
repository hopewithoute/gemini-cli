/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { z } from 'zod';

const ProfilesDataSchema = z.object({
  activeProfileId: z.string().optional().default('default'),
});

type ProfilesData = z.infer<typeof ProfilesDataSchema>;

export class ProfileManager {
  static getProfilesPath(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, '.gemini', 'profiles.json');
  }

  static async getActiveProfileId(): Promise<string> {
    try {
      const data = await fs.readFile(this.getProfilesPath(), 'utf-8');
      const parsed = ProfilesDataSchema.parse(JSON.parse(data));
      return parsed.activeProfileId;
    } catch {
      return 'default';
    }
  }

  static getActiveProfileIdSync(): string {
    try {
      const data = fsSync.readFileSync(this.getProfilesPath(), 'utf-8');
      const parsed = ProfilesDataSchema.parse(JSON.parse(data));
      return parsed.activeProfileId;
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
      existingData = ProfilesDataSchema.partial().parse(JSON.parse(data));
    } catch {
      // File doesn't exist or is invalid, start fresh
    }

    const newData: ProfilesData = { ...existingData, activeProfileId: id };
    await fs.writeFile(filePath, JSON.stringify(newData, null, 2), 'utf-8');
  }
}
