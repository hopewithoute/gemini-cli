# Design Doc: Meta-Tools System (Search & Execute)

**Status:** Approved **Date:** 2026-03-03 **Authors:** Gemini CLI

## Overview

The Meta-Tools system is designed to replace the current approach of exposing
all available tools to the LLM's context. Instead, it exposes only two primary
tools: `search_tools` and `execute_tool`. This significantly reduces context
usage while maintaining (or improving) tool discovery accuracy through semantic
search.

## Problem Statement

Exposing a large number of tools (built-in, MCP, discovered) consumes a
significant portion of the LLM's context window. This leads to:

- Higher token costs.
- Reduced "thinking" space for the model.
- Potential confusion or "hallucinations" when choosing between many similar
  tools.

## Proposed Architecture

We will implement a **Gated Meta-Registry** that acts as a wrapper around the
existing `ToolRegistry`.

### 1. Components

- **`MetaToolRegistry`**: A wrapper class that implements the `ToolRegistry`
  interface but filters the output of `getFunctionDeclarations()` to only
  include `search_tools` and `execute_tool`.
- **`SemanticSearchService`**: An internal service that performs semantic
  mapping between a user's natural language query and the actual tool registry.
- **`IsolatedSearchSession`**: A separate Gemini session used by
  `SemanticSearchService` to perform tool discovery without leaking the main
  conversation history.

### 2. Meta-Tools Specification

#### `search_tools(query: string)`

- **Purpose:** Finds relevant tools for a given task.
- **Internal Logic:** Sends a list of all tool names and descriptions to an
  isolated Gemini session.
- **Returns:** An array of `FunctionDeclaration` objects (Name, Description, and
  Parameter Schema) for the most relevant tools.

#### `execute_tool(tool_name: string, parameters: object)`

- **Purpose:** Executes a specific tool from the underlying `ToolRegistry`.
- **Internal Logic:** Resolves `tool_name` against the real registry and
  executes it with the provided `parameters`.
- **Returns:** The raw output of the executed tool.

## Data Flow

1. **Main LLM** needs to perform an action (e.g., "Find all TODOs in the src
   folder").
2. **Main LLM** calls `search_tools(query="search for text in files")`.
3. **`SemanticSearchService`** starts a new sub-session, provides it with the
   full tool list, and asks for relevant tools.
4. **Sub-session** identifies `grep_search` and returns its schema.
5. **Main LLM** receives the `grep_search` schema and parameters.
6. **Main LLM** calls
   `execute_tool(tool_name="grep_search", parameters={"pattern": "TODO", "dir_path": "src"})`.
7. **`MetaToolRegistry`** executes the real `grep_search` and returns the
   results to the **Main LLM**.

## Efficiency Gains

- **Current:** 50+ tools in context (~10k-20k tokens).
- **New:** 2 tools in context (<500 tokens) + transient tool schemas during
  specific tasks.

## Security & Privacy

- **Sub-sessions** are stateless and do not have access to the main conversation
  history.
- **Execution** is still governed by the existing `ApprovalPolicy` and security
  hooks.

## Implementation Phases

1. **Phase 1:** Implement `SemanticSearchService` with isolated sessions.
2. **Phase 2:** Implement `MetaToolRegistry` wrapper.
3. **Phase 3:** Update `Client` to use `MetaToolRegistry`.
4. **Phase 4:** Add comprehensive unit and integration tests.
