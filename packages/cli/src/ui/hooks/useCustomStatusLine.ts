/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { StatusLineService } from '../../services/StatusLineService.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { getContextUsagePercentage } from '../utils/contextUsage.js';

const statusLineService = new StatusLineService();

export function useCustomStatusLine() {
  const { merged: settings } = useSettings();
  const uiState = useUIState();
  const command = (
    settings.ui as { statusLine?: { command?: string } } | undefined
  )?.statusLine?.command;
  const [output, setOutput] = useState<string | null>(null);

  useEffect(() => {
    if (!command) {
      setOutput(null);
      return;
    }

    const currentModel = uiState.currentModel;
    const lastPromptTokenCount =
      uiState.sessionStats?.lastPromptTokenCount || 0;
    const contextUsagePercent = getContextUsagePercentage(
      lastPromptTokenCount,
      currentModel,
    );
    const contextLeftPercent = Math.max(
      0,
      100 - contextUsagePercent * 100,
    ).toFixed(0);

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalLatencyMs = 0;

    const models = uiState.sessionStats?.metrics?.models;
    if (models) {
      for (const metrics of Object.values(models)) {
        totalInputTokens += metrics.tokens.input || 0;
        totalOutputTokens += metrics.tokens.candidates || 0;
        totalLatencyMs += metrics.api.totalLatencyMs || 0;
      }
    }

    const totalTokens = totalInputTokens + totalOutputTokens;
    const outputTokensPerSecond =
      totalLatencyMs > 0
        ? ((totalOutputTokens / totalLatencyMs) * 1000).toFixed(1)
        : '0.0';

    const quotaRemainingPercent =
      uiState.quota.stats?.limit && uiState.quota.stats.limit > 0
        ? (uiState.quota.stats.remaining / uiState.quota.stats.limit) * 100
        : 100;

    const statePayload = {
      model: { id: currentModel, display_name: currentModel },
      workspace: { current_dir: process.cwd() },
      git: { branch: uiState.branchName },
      usage: {
        prompt_tokens: lastPromptTokenCount,
        context_left_percent: Number(contextLeftPercent),
        total_input_tokens: totalInputTokens,
        total_output_tokens: totalOutputTokens,
        total_tokens: totalTokens,
        output_tokens_per_second: Number(outputTokensPerSecond),
        quota_remaining_percent: Number(quotaRemainingPercent.toFixed(0)),
      },
    };

    const controller = new AbortController();

    const timeout = setTimeout(async () => {
      const result = await statusLineService.executeStatusLine(
        command,
        statePayload,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setOutput(result);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [
    command,
    uiState.currentModel,
    uiState.branchName,
    uiState.sessionStats?.lastPromptTokenCount,
    uiState.sessionStats?.metrics,
    uiState.quota.stats?.limit,
    uiState.quota.stats?.remaining,
  ]);

  return { output, isConfigured: !!command };
}
