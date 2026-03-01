/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import SelectInput from 'ink-select-input';
import {
  clearOauthClientCache,
  UserAccountManager,
} from '@google/gemini-cli-core';
import { useState } from 'react';
import { Box, Text } from 'ink';
import { useUIActions } from '../contexts/UIActionsContext.js';
import { theme } from '../semantic-colors.js';

interface AccountItem {
  label: string;
  value: string;
}

export function AccountSwitcherDialog({
  closeDialog,
}: {
  closeDialog: () => void;
}) {
  const { handleRestart } = useUIActions();
  const [manager] = useState(() => new UserAccountManager());
  const [refreshKey, setRefreshKey] = useState(0);

  const items = (() => {
    // Re-read on refreshKey change
    void refreshKey;
    const active = manager.getCachedGoogleAccount();
    const allEmails = manager.getAllAccounts();

    if (allEmails.length === 0) {
      return [
        { label: 'No accounts found. Use /auth login first.', value: '' },
      ];
    }

    const result: AccountItem[] = [];

    // Switch section
    for (const email of allEmails) {
      result.push({
        label: email === active ? `  ${email} (active)` : `  ${email}`,
        value: `switch:${email}`,
      });
    }

    // Remove section - only non-active accounts
    const removable = allEmails.filter((e) => e !== active);
    if (removable.length > 0) {
      result.push({ label: '──────────────────────────', value: '' });
      for (const email of removable) {
        result.push({
          label: `  ✕ Remove ${email}`,
          value: `remove:${email}`,
        });
      }
    }

    return result;
  })();

  const handleSelect = async (item: AccountItem) => {
    if (!item.value) {
      return; // separator, ignore
    }

    const parts = item.value.split(':');
    const action = parts[0];
    const email = parts[1];

    if (!action || !email) {
      return;
    }

    if (action === 'remove') {
      await manager.removeAccount(email);
      // Refresh the list
      setRefreshKey((k) => k + 1);
      return;
    }

    // action === 'switch'
    const active = manager.getCachedGoogleAccount();
    if (email === active) {
      closeDialog();
      return;
    }

    await manager.cacheGoogleAccount(email);
    clearOauthClientCache();
    closeDialog();
    handleRestart();
  };

  return (
    <Box
      flexDirection="column"
      padding={1}
      borderStyle="round"
      borderColor="blue"
    >
      <Box marginBottom={1}>
        <Text bold>Switch Account</Text>
      </Box>
      <Box marginBottom={1}>
        <Text color={theme.text.secondary}>
          Select an account to switch to, or remove a stored credential.
        </Text>
      </Box>
      <SelectInput items={items} onSelect={handleSelect} />
    </Box>
  );
}
