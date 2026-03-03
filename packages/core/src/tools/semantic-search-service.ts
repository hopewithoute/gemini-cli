/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FunctionDeclaration, Content } from '@google/genai';
import type { Config } from '../config/config.js';
import { debugLogger } from '../utils/debugLogger.js';
import { LlmRole } from '../telemetry/llmRole.js';

/**
 * Service to perform semantic search over available tools using a Gemini session.
 */
export class SemanticSearchService {
  private static readonly SYSTEM_PROMPT = `You are a tool selection assistant. Given a user query and a list of available tools (names and descriptions), select the most relevant tools (max 3) that can help the user.
Return ONLY a JSON array of strings containing the tool names.
If no tools are relevant, return an empty array [].`;

  constructor(private readonly config: Config) {}

  /**
   * Searches for the most relevant tools based on a user query.
   *
   * @param query - The user query string.
   * @param tools - An array of available tool schemas (FunctionDeclarations).
   * @returns A promise that resolves to an array of up to 3 most relevant FunctionDeclarations.
   */
  async search(
    query: string,
    tools: FunctionDeclaration[],
  ): Promise<FunctionDeclaration[]> {
    if (tools.length === 0) {
      return [];
    }

    const toolsMetadata = tools
      .map(
        (t) => `- ${t.name}: ${t.description || 'No description available.'}`,
      )
      .join('\n');

    const userPrompt = `Available tools:\n${toolsMetadata}\n\nUser query: "${query}"`;

    try {
      const contents: Content[] = [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ];

      const result = await this.config.getContentGenerator().generateContent(
        {
          model: this.config.getModel(),
          contents,
          config: {
            systemInstruction: {
              parts: [{ text: SemanticSearchService.SYSTEM_PROMPT }],
            },
            responseMimeType: 'application/json',
            temperature: 0,
          },
        },
        'semantic-search',
        LlmRole.UTILITY_TOOL,
      );

      const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!responseText) {
        debugLogger.warn('SemanticSearchService: No response text from Gemini');
        return [];
      }

      let selectedToolNames: string[];
      try {
        const parsed = JSON.parse(responseText) as unknown;
        if (
          !Array.isArray(parsed) ||
          !parsed.every((item) => typeof item === 'string')
        ) {
          debugLogger.warn(
            'SemanticSearchService: Response is not an array of strings',
            responseText,
          );
          return [];
        }
        selectedToolNames = parsed;
      } catch (e) {
        debugLogger.warn(
          'SemanticSearchService: Failed to parse response as JSON',
          responseText,
          e,
        );
        return [];
      }

      // Max 3
      const topNames = selectedToolNames.slice(0, 3);

      return tools.filter(
        (t): t is FunctionDeclaration & { name: string } =>
          t.name !== undefined && topNames.includes(t.name),
      );
    } catch (error) {
      debugLogger.error('SemanticSearchService: search failed:', error);
      return [];
    }
  }
}
