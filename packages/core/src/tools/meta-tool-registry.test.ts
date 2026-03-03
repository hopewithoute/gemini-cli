/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FunctionDeclaration } from '@google/genai';
import { ToolRegistry } from './tool-registry.js';
import { MetaToolRegistry } from './meta-tool-registry.js';
import { SemanticSearchService } from './semantic-search-service.js';
import { Config } from '../config/config.js';
import { MessageBus } from '../confirmation-bus/message-bus.js';
import type { AnyDeclarativeTool } from './tools.js';

describe('MetaToolRegistry', () => {
  let mockToolRegistry: ToolRegistry;
  let mockSemanticSearchService: SemanticSearchService;
  let metaToolRegistry: MetaToolRegistry;
  let mockConfig: Config;
  let mockMessageBus: MessageBus;

  beforeEach(() => {
    mockConfig = {
      getApprovalMode: vi.fn(),
      getExcludeTools: vi.fn().mockReturnValue(new Set()),
      getToolCallCommand: vi.fn(),
      getToolDiscoveryCommand: vi.fn(),
      storage: {
        getPlansDir: vi.fn().mockReturnValue('/mock/plans'),
      },
      getContentGenerator: vi.fn(),
      getModel: vi.fn(),
    } as unknown as Config;
    mockMessageBus = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as MessageBus;
    mockToolRegistry = new ToolRegistry(mockConfig, mockMessageBus);
    mockSemanticSearchService = new SemanticSearchService(mockConfig);
    metaToolRegistry = new MetaToolRegistry(
      mockToolRegistry,
      mockSemanticSearchService,
    );
  });

  it('should expose only two tools: search_tools and execute_tool', () => {
    const declarations = metaToolRegistry.getFunctionDeclarations();
    expect(declarations).toHaveLength(2);
    expect(declarations.map((d) => d.name)).toContain('search_tools');
    expect(declarations.map((d) => d.name)).toContain('execute_tool');
  });

  it('should return search_tools and execute_tool from getTool', () => {
    const searchTool = metaToolRegistry.getTool('search_tools');
    const executeTool = metaToolRegistry.getTool('execute_tool');

    expect(searchTool).toBeDefined();
    expect(searchTool?.name).toBe('search_tools');
    expect(executeTool).toBeDefined();
    expect(executeTool?.name).toBe('execute_tool');
  });

  it('should return undefined for other tools from getTool', () => {
    expect(metaToolRegistry.getTool('grep_search')).toBeUndefined();
  });

  it('should call semanticSearchService.search when search_tools is invoked', async () => {
    const mockTools: FunctionDeclaration[] = [
      { name: 'tool1', description: 'desc1' },
      { name: 'tool2', description: 'desc2' },
    ];
    vi.spyOn(mockToolRegistry, 'getFunctionDeclarations').mockReturnValue(
      mockTools,
    );
    const searchSpy = vi
      .spyOn(mockSemanticSearchService, 'search')
      .mockResolvedValue([mockTools[0]]);

    const result = await metaToolRegistry.search_tools('query');

    expect(searchSpy).toHaveBeenCalledWith('query', mockTools);
    expect(result).toEqual([mockTools[0]]);
  });

  it('should execute the tool from the wrapped registry when execute_tool is invoked', async () => {
    const mockTool = {
      name: 'test_tool',
      build: vi.fn().mockReturnValue({
        execute: vi.fn().mockResolvedValue({ llmContent: 'success' }),
      }),
    } as unknown as AnyDeclarativeTool;
    vi.spyOn(mockToolRegistry, 'getTool').mockReturnValue(mockTool);

    const result = await metaToolRegistry.execute_tool('test_tool', {
      param1: 'val1',
    });

    expect(mockToolRegistry.getTool).toHaveBeenCalledWith('test_tool');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any
    expect((mockTool as any).build).toHaveBeenCalledWith({ param1: 'val1' });
    expect(result).toEqual({ llmContent: 'success' });
  });

  it('should throw an error if the tool to execute is not found', async () => {
    vi.spyOn(mockToolRegistry, 'getTool').mockReturnValue(undefined);

    await expect(
      metaToolRegistry.execute_tool('non_existent', {}),
    ).rejects.toThrow('Tool "non_existent" not found');
  });

  it('should allow executing search_tools via getTool().build().execute()', async () => {
    const searchTool = metaToolRegistry.getTool('search_tools')!;
    const mockTools: FunctionDeclaration[] = [
      { name: 'tool1', description: 'desc1' },
    ];
    vi.spyOn(mockSemanticSearchService, 'search').mockResolvedValue(mockTools);

    const invocation = searchTool.build({ query: 'test' });
    const result = await invocation.execute(new AbortController().signal);

    expect(result.llmContent).toBe(JSON.stringify(mockTools));
    expect(result.returnDisplay).toBe('Found 1 relevant tools.');
  });

  it('should be an instance of ToolRegistry', () => {
    expect(metaToolRegistry).toBeInstanceOf(ToolRegistry);
  });

  it('should pass modelId to getSchema in getFunctionDeclarations', () => {
    const modelId = 'test-model';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const searchTool = (metaToolRegistry as any).searchToolsTool;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const executeTool = (metaToolRegistry as any).executeToolTool;
    const searchSpy = vi.spyOn(searchTool, 'getSchema');
    const executeSpy = vi.spyOn(executeTool, 'getSchema');

    metaToolRegistry.getFunctionDeclarations(modelId);

    expect(searchSpy).toHaveBeenCalledWith(modelId);
    expect(executeSpy).toHaveBeenCalledWith(modelId);
  });

  it('should return only meta-tool names from getAllToolNames', () => {
    expect(metaToolRegistry.getAllToolNames()).toEqual([
      'search_tools',
      'execute_tool',
    ]);
  });

  it('should delegate registerTool to the wrapped toolRegistry', () => {
    const mockTool = { name: 'new_tool' } as AnyDeclarativeTool;
    const registerSpy = vi.spyOn(mockToolRegistry, 'registerTool');

    metaToolRegistry.registerTool(mockTool);

    expect(registerSpy).toHaveBeenCalledWith(mockTool);
  });

  it('should delegate unregisterTool to the wrapped toolRegistry', () => {
    const unregisterSpy = vi.spyOn(mockToolRegistry, 'unregisterTool');

    metaToolRegistry.unregisterTool('some_tool');

    expect(unregisterSpy).toHaveBeenCalledWith('some_tool');
  });
});
