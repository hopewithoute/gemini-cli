/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { HybridTokenStorage } from '../mcp/token-storage/hybrid-token-storage.js';
import type { OAuthCredentials } from '../mcp/token-storage/types.js';
import { debugLogger } from '../utils/debugLogger.js';
import { ProfileManager } from '../config/profileManager.js';

const KEYCHAIN_SERVICE_NAME = 'gemini-cli-api-key';

function getApiKeyEntryName() {
  const profileId = ProfileManager.getActiveProfileIdSync();
  return profileId === 'default' ? 'default-api-key' : `api-key-${profileId}`;
}

const storage = new HybridTokenStorage(KEYCHAIN_SERVICE_NAME);

/**
 * Load cached API key
 */
export async function loadApiKey(): Promise<string | null> {
  const entryName = getApiKeyEntryName();
  try {
    const credentials = await storage.getCredentials(entryName);

    if (credentials?.token?.accessToken) {
      return credentials.token.accessToken;
    }

    return null;
  } catch (error: unknown) {
    // Log other errors but don't crash, just return null so user can re-enter key
    debugLogger.error('Failed to load API key from storage:', error);
    return null;
  }
}

/**
 * Save API key
 */
export async function saveApiKey(
  apiKey: string | null | undefined,
): Promise<void> {
  const entryName = getApiKeyEntryName();
  if (!apiKey || apiKey.trim() === '') {
    try {
      await storage.deleteCredentials(entryName);
    } catch (error: unknown) {
      // Ignore errors when deleting, as it might not exist
      debugLogger.warn('Failed to delete API key from storage:', error);
    }
    return;
  }

  // Wrap API key in OAuthCredentials format as required by HybridTokenStorage
  const credentials: OAuthCredentials = {
    serverName: entryName,
    token: {
      accessToken: apiKey,
      tokenType: 'ApiKey',
    },
    updatedAt: Date.now(),
  };

  await storage.setCredentials(credentials);
}

/**
 * Clear cached API key
 */
export async function clearApiKey(): Promise<void> {
  try {
    const entryName = getApiKeyEntryName();
    await storage.deleteCredentials(entryName);
  } catch (error: unknown) {
    debugLogger.error('Failed to clear API key from storage:', error);
  }
}
