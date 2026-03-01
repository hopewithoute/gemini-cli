/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHookWithProviders } from '../../test-utils/render.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCustomStatusLine } from './useCustomStatusLine.js';
import { waitFor } from '../../test-utils/async.js';

import { createMockSettings } from '../../test-utils/settings.js';

// Mock the StatusLineService
vi.mock('../../services/StatusLineService.js', () => ({
  StatusLineService: vi.fn().mockImplementation(() => ({
    executeStatusLine: vi.fn().mockResolvedValue('mocked-status'),
  })),
}));

describe('useCustomStatusLine()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return null and isConfigured=false when no command is provided', () => {
    const { result } = renderHookWithProviders(() => useCustomStatusLine(), {
      settings: createMockSettings({
        ui: { statusLine: { command: undefined } },
      } as unknown as Record<string, unknown>),
    });

    expect(result.current.isConfigured).toBe(false);
    expect(result.current.output).toBe(null);
  });

  it('should execute command and set output when command is provided', async () => {
    const { result } = renderHookWithProviders(() => useCustomStatusLine(), {
      settings: createMockSettings({
        ui: { statusLine: { command: 'echo hello' } },
      } as unknown as Record<string, unknown>),
      uiState: {
        currentModel: 'gemini-1.5-pro',
        branchName: 'main',
        sessionStats: { lastPromptTokenCount: 123 },
      } as unknown as Record<string, unknown>,
    });

    expect(result.current.isConfigured).toBe(true);
    expect(result.current.output).toBe(null); // Initially null during debounce

    // Wait for the debounce and state update
    await waitFor(() => {
      expect(result.current.output).toBe('mocked-status');
    });
  });
});
