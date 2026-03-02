/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AccountSwitcherDialog } from './AccountSwitcherDialog.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders } from '../../test-utils/render.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    clearOauthClientCache: vi.fn(),
    UserAccountManager: vi.fn().mockImplementation(() => ({
      getCachedGoogleAccount: () => 'user@gmail.com',
      getAllAccounts: () => ['user@gmail.com', 'old@gmail.com'],
      cacheGoogleAccount: vi.fn(),
      removeAccount: vi.fn(),
    })),
  };
});

describe('AccountSwitcherDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with email accounts and remove options', async () => {
    const renderResult = renderWithProviders(
      <AccountSwitcherDialog closeDialog={() => {}} />,
    );

    await renderResult.waitUntilReady();
    const frame = renderResult.lastFrame();

    expect(frame).toContain('Switch Account');
    expect(frame).toContain('user@gmail.com');
    expect(frame).toContain('(active)');
    expect(frame).toContain('old@gmail.com');
    expect(frame).toContain('Remove');
  });
});
