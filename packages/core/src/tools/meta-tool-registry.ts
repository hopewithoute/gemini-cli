/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FunctionDeclaration } from '@google/genai';
import { ToolRegistry } from './tool-registry.js';
import type { SemanticSearchService } from './semantic-search-service.js';
import type {
  ToolResult,
  AnyDeclarativeTool,
  ToolInvocation,
} from './tools.js';
import { Kind, BaseDeclarativeTool, BaseToolInvocation } from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

class SearchToolsInvocation extends BaseToolInvocation<
  { query: string },
  ToolResult
> {
  constructor(
    private readonly registry: MetaToolRegistry,
    params: { query: string },
    messageBus: MessageBus,
    toolName: string,
  ) {
    super(params, messageBus, toolName);
  }

  getDescription(): string {
    return `Searching for tools with query: "${this.params.query}"`;
  }

  async execute(): Promise<ToolResult> {
    const results = await this.registry.search_tools(this.params.query);
    return {
      llmContent: JSON.stringify(results),
      returnDisplay: `Found ${results.length} relevant tools.`,
    };
  }
}

class SearchToolsTool extends BaseDeclarativeTool<
  { query: string },
  ToolResult
> {
  constructor(
    private readonly registry: MetaToolRegistry,
    messageBus: MessageBus,
  ) {
    super(
      'search_tools',
      'Search Tools',
      'Searches for relevant tools based on a natural language query.',
      Kind.Search,
      {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'The search query describing the task you want to perform.',
          },
        },
        required: ['query'],
      },
      messageBus,
      false,
    );
  }

  protected createInvocation(
    params: { query: string },
    messageBus: MessageBus,
    _toolName?: string,
  ): ToolInvocation<{ query: string }, ToolResult> {
    return new SearchToolsInvocation(
      this.registry,
      params,
      messageBus,
      this.name,
    );
  }
}

class ExecuteToolInvocation extends BaseToolInvocation<
  { tool_name: string; parameters: object },
  ToolResult
> {
  constructor(
    private readonly registry: MetaToolRegistry,
    params: { tool_name: string; parameters: object },
    messageBus: MessageBus,
    toolName: string,
  ) {
    super(params, messageBus, toolName);
  }

  getDescription(): string {
    return `Executing tool: ${this.params.tool_name}`;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    return this.registry.execute_tool(
      this.params.tool_name,
      this.params.parameters,
      signal,
    );
  }
}

class ExecuteToolTool extends BaseDeclarativeTool<
  { tool_name: string; parameters: object },
  ToolResult
> {
  constructor(
    private readonly registry: MetaToolRegistry,
    messageBus: MessageBus,
  ) {
    super(
      'execute_tool',
      'Execute Tool',
      'Executes a specific tool with the provided parameters.',
      Kind.Other,
      {
        type: 'object',
        properties: {
          tool_name: {
            type: 'string',
            description: 'The name of the tool to execute.',
          },
          parameters: {
            type: 'object',
            description: 'The parameters to pass to the tool.',
          },
        },
        required: ['tool_name', 'parameters'],
      },
      messageBus,
      false,
    );
  }

  protected createInvocation(
    params: { tool_name: string; parameters: object },
    messageBus: MessageBus,
    _toolName?: string,
  ): ToolInvocation<{ tool_name: string; parameters: object }, ToolResult> {
    return new ExecuteToolInvocation(
      this.registry,
      params,
      messageBus,
      this.name,
    );
  }
}

/**
 * MetaToolRegistry wraps a ToolRegistry and exposes only two tools:
 * search_tools and execute_tool. This is used to implement a meta-tooling
 * pattern where the LLM first searches for tools and then executes them.
 */
export class MetaToolRegistry extends ToolRegistry {
  private readonly searchToolsTool: SearchToolsTool;
  private readonly executeToolTool: ExecuteToolTool;

  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly semanticSearchService: SemanticSearchService,
  ) {
    super(toolRegistry.getConfig(), toolRegistry.getMessageBus());
    this.searchToolsTool = new SearchToolsTool(this, this.messageBus);
    this.executeToolTool = new ExecuteToolTool(this, this.messageBus);
  }

  /**
   * Returns the function declarations for the meta-tools.
   * @param modelId Optional model identifier to get model-specific schemas.
   * @returns An array containing search_tools and execute_tool declarations.
   */
  override getFunctionDeclarations(modelId?: string): FunctionDeclaration[] {
    return [
      this.searchToolsTool.getSchema(modelId),
      this.executeToolTool.getSchema(modelId),
    ];
  }

  /**
   * Get the definition of a specific tool.
   * Only returns search_tools and execute_tool.
   */
  override getTool(name: string): AnyDeclarativeTool | undefined {
    if (name === 'search_tools') {
      return this.searchToolsTool;
    }
    if (name === 'execute_tool') {
      return this.executeToolTool;
    }
    return undefined;
  }

  /**
   * Searches for the most relevant tools based on a user query.
   *
   * @param query - The user query string.
   * @returns A promise that resolves to an array of up to 3 most relevant FunctionDeclarations.
   */
  async search_tools(query: string): Promise<FunctionDeclaration[]> {
    const allTools = this.toolRegistry.getFunctionDeclarations();
    return this.semanticSearchService.search(query, allTools);
  }

  /**
   * Executes a specific tool from the wrapped registry.
   *
   * @param tool_name - The name of the tool to execute.
   * @param parameters - The parameters to pass to the tool.
   * @param signal - AbortSignal for tool cancellation.
   * @returns A promise that resolves to the result of the tool execution.
   * @throws Error if the tool is not found.
   */
  async execute_tool(
    tool_name: string,
    parameters: object,
    signal?: AbortSignal,
  ): Promise<ToolResult> {
    const tool = this.toolRegistry.getTool(tool_name);
    if (!tool) {
      throw new Error(`Tool "${tool_name}" not found`);
    }

    const effectiveSignal = signal ?? new AbortController().signal;
    return tool.build(parameters).execute(effectiveSignal);
  }

  // Delegated methods to match ToolRegistry interface
  override getMessageBus(): MessageBus {
    return this.toolRegistry.getMessageBus();
  }

  override registerTool(tool: AnyDeclarativeTool): void {
    this.toolRegistry.registerTool(tool);
  }

  override unregisterTool(name: string): void {
    this.toolRegistry.unregisterTool(name);
  }

  override sortTools(): void {
    this.toolRegistry.sortTools();
  }

  override removeMcpToolsByServer(serverName: string): void {
    this.toolRegistry.removeMcpToolsByServer(serverName);
  }

  override async discoverAllTools(): Promise<void> {
    await this.toolRegistry.discoverAllTools();
  }

  override getFunctionDeclarationsFiltered(
    toolNames: string[],
    modelId?: string,
  ): FunctionDeclaration[] {
    const declarations: FunctionDeclaration[] = [];
    for (const name of toolNames) {
      const tool = this.getTool(name);
      if (tool) {
        declarations.push(tool.getSchema(modelId));
      }
    }
    return declarations;
  }

  override getAllToolNames(): string[] {
    return ['search_tools', 'execute_tool'];
  }

  override getAllTools(): AnyDeclarativeTool[] {
    return [this.searchToolsTool, this.executeToolTool];
  }

  override getToolsByServer(_serverName: string): AnyDeclarativeTool[] {
    // Meta tools don't belong to any MCP server
    return [];
  }
}
