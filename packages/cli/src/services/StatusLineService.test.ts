/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { StatusLineService } from './StatusLineService.js';
import { describe, it, expect } from 'vitest';

describe('StatusLineService', () => {
  it('should execute command and return output', async () => {
    const service = new StatusLineService();
    // Using a node script as a reliable cross-platform command
    const command = 'echo test-model-id';
    const state = { model: { id: 'test-model-id' } };

    const output = await service.executeStatusLine(command, state);
    expect(output).toBe('test-model-id');
  });

  it('should abort previous command if called again quickly', async () => {
    const service = new StatusLineService();
    // Sleep for 100ms then return
    const command = 'sleep 0.1 && echo done';

    const promise1 = service.executeStatusLine(command, {});
    const promise2 = service.executeStatusLine(command, {});

    const [out1, out2] = await Promise.all([promise1, promise2]);
    expect(out1).toBe(''); // Aborted should return empty string
    expect(out2).toBe('done'); // Only the second one finishes
  });
});
