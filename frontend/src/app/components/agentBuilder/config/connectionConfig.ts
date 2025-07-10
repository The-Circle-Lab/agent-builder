export interface HandleConfig {
  maxConnections: number; // -1 for unlimited
  compatibleWith: string[]; // Array of handle IDs this handle can connect to
}

export interface ConnectionConfig {
  [handleId: string]: HandleConfig;
}

export const connectionConfig: ConnectionConfig = {
  // Agent Node Handles
  "llm-model": {
    maxConnections: 1, // Can only connect to one LLM model
    compatibleWith: ["llm-input"], // Can connect to GoogleCloud input
  },
  "tools": {
    maxConnections: -1, // Unlimited connections to tools
    compatibleWith: ["mcp-input"], // Can connect to various tool inputs
  },
  "agent-input": {
    maxConnections: -1, // Can only connect to one agent input
    compatibleWith: ["output", "chat-output"], // Can connect to agent output
  },
  "chat-output": {
    maxConnections: 1, // Can only connect to one chat input
    compatibleWith: ["agent-input"], // Can connect to chat output
  },
  "input": {
    maxConnections: 1, // Can only receive one input
    compatibleWith: ["output", "llm-model", "tools"], // Can receive from various sources
  },
  "output": {
    maxConnections: -1, // Can output to multiple targets
    compatibleWith: ["input", "agent-input"], // Can connect to inputs
  },
  "llm-input": {
    maxConnections: 1, // Can only receive one LLM model connection
    compatibleWith: ["llm-model"], // Can receive from llm-model handle
  },
  "mcp-input": {
    maxConnections: 1, // Can only receive one MCP input
    compatibleWith: ["tools"], // Can receive from tools handle
  },
  "tests-output": {
    maxConnections: -1, // Can only connect to one test input
    compatibleWith: ["tests-input"], // Can connect to test output
  },
  "tests-input": {
    maxConnections: -1, // Can only connect to one test input
    compatibleWith: ["tests-output"], // Can connect to test output
  },
  "analyzer-output": {
    maxConnections: -1, // Can only connect to one test input
    compatibleWith: ["analyzer-input"], // Can connect to test output
  },
  "analyzer-input": {
    maxConnections: -1, // Can only connect to one test input
    compatibleWith: ["analyzer-output"], // Can connect to test output
  },
};

import { Edge } from "@xyflow/react";

export function canConnect(
  sourceHandle: string,
  targetHandle: string,
  currentEdges: Edge[],
  sourceNodeId: string,
  targetNodeId: string
): boolean {
  const sourceConfig = connectionConfig[sourceHandle];
  const targetConfig = connectionConfig[targetHandle];
  // Check if handles exist in config
  if (!sourceConfig || !targetConfig) {
    console.warn(
      `Handle configuration missing for ${sourceHandle} or ${targetHandle}`
    );
    return false;
  }

  // Check compatibility
  if (!sourceConfig.compatibleWith.includes(targetHandle)) {
    return false;
  }

  // Check source handle connection limits
  if (sourceConfig.maxConnections !== -1) {
    const sourceConnections = currentEdges.filter(
      (edge) =>
        edge.source === sourceNodeId && edge.sourceHandle === sourceHandle
    ).length;

    if (sourceConnections >= sourceConfig.maxConnections) {
      return false;
    }
  }

  // Check target handle connection limits
  if (targetConfig.maxConnections !== -1) {
    const targetConnections = currentEdges.filter(
      (edge) =>
        edge.target === targetNodeId && edge.targetHandle === targetHandle
    ).length;

    if (targetConnections >= targetConfig.maxConnections) {
      return false;
    }
  }

  return true;
}
