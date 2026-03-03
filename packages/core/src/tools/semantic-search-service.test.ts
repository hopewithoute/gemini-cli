/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SemanticSearchService } from './semantic-search-service.js';
import type { FunctionDeclaration } from '@google/genai';
import type { Config } from '../config/config.js';

describe('SemanticSearchService', () => {
  let config: Config;
  let service: SemanticSearchService;
  const mockContentGenerator = {
    generateContent: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    config = {
      getContentGenerator: () => mockContentGenerator,
      getModel: () => 'gemini-2.0-flash',
    } as unknown as Config;
    service = new SemanticSearchService(config);
  });

  it('should return relevant tools based on query', async () => {
    const tools: FunctionDeclaration[] = [
      { name: 'tool1', description: 'Search for files' },
      { name: 'tool2', description: 'Read a file' },
      { name: 'tool3', description: 'List directories' },
    ];
    const query = 'I want to search for some files';

    mockContentGenerator.generateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify(['tool1']) }],
          },
        },
      ],
    });

    const result = await service.search(query, tools);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('tool1');
    expect(mockContentGenerator.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: expect.arrayContaining([
          expect.objectContaining({
            parts: expect.arrayContaining([
              expect.objectContaining({
                text: expect.stringContaining(query),
              }),
            ]),
          }),
        ]),
        config: expect.objectContaining({
          responseMimeType: 'application/json',
        }),
      }),
      expect.any(String),
      expect.any(String),
    );
  });

  it('should return max 3 tools even if more are suggested', async () => {
    const tools: FunctionDeclaration[] = [
      { name: 'tool1', description: 'd1' },
      { name: 'tool2', description: 'd2' },
      { name: 'tool3', description: 'd3' },
      { name: 'tool4', description: 'd4' },
    ];
    const query = 'help me';

    mockContentGenerator.generateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify(['tool1', 'tool2', 'tool3', 'tool4']) }],
          },
        },
      ],
    });

    const result = await service.search(query, tools);

    expect(result).toHaveLength(3);
  });

  it('should handle empty or invalid response from LLM', async () => {
    const tools: FunctionDeclaration[] = [
      { name: 'tool1', description: 'd1' },
    ];
    const query = 'help me';

    mockContentGenerator.generateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: 'not json' }],
          },
        },
      ],
    });

    const result = await service.search(query, tools);
    expect(result).toEqual([]);
  });
});
