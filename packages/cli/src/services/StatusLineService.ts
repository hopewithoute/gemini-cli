/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'node:child_process';
import * as os from 'node:os';

export class StatusLineService {
  private currentProcess: AbortController | null = null;

  async executeStatusLine(
    command: string,
    state: unknown,
    externalSignal?: AbortSignal,
  ): Promise<string> {
    if (this.currentProcess) {
      this.currentProcess.abort();
    }
    this.currentProcess = new AbortController();

    const signals = [this.currentProcess.signal];
    if (externalSignal) {
      signals.push(externalSignal);
    }

    const signal = AbortSignal.any(signals);

    try {
      const expandedCommand = command.replace(/^~(?=$|\/|\\)/, os.homedir());
      const child = exec(expandedCommand, { signal });
      let output = '';
      let errorOutput = '';

      if (child.stdout) {
        child.stdout.on('data', (data: string | Buffer) => {
          output += data.toString();
        });
      }

      if (child.stderr) {
        child.stderr.on('data', (data: string | Buffer) => {
          errorOutput += data.toString();
        });
      }

      if (child.stdin) {
        child.stdin.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code !== 'EPIPE') {
            // eslint-disable-next-line no-console
            console.error('StatusLine stdin error:', err);
          }
        });
        child.stdin.write(JSON.stringify(state));
        child.stdin.end();
      }

      await new Promise<void>((resolve, reject) => {
        child.on('close', (code) => {
          if (code !== 0 && code !== null) {
            reject(new Error(`Exit ${code}: ${errorOutput.trim()}`));
            return;
          }
          resolve();
        });
        child.on('error', reject);
      });

      return output.trim();
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'name' in error &&
        error.name === 'AbortError'
      ) {
        return '';
      }
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ABORT_ERR'
      ) {
        return '';
      }
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
