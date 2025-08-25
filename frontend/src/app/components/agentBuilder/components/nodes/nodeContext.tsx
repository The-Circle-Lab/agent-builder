import React, { createContext, useContext, ReactNode, useRef, useEffect } from 'react';

interface NodeContextValue {
  pageRelationships: Record<string, string[]>;
  nodes: { id: string; type: string }[];
  fullNodes: Array<Record<string, unknown>>; // Full node objects with data
  getCurrentPageRelationships: () => Record<string, string[]>;
  getCurrentNodes: () => { id: string; type: string }[];
  getCurrentFullNodes: () => Array<Record<string, unknown>>;
}

const NodeContext = createContext<NodeContextValue | null>(null);

interface NodeContextProviderProps {
  children: ReactNode;
  pageRelationships: Record<string, string[]>;
  nodes: { id: string; type: string }[];
  fullNodes: Array<Record<string, unknown>>;
}

export function NodeContextProvider({ children, pageRelationships, nodes, fullNodes }: NodeContextProviderProps) {
  const pageRelationshipsRef = useRef(pageRelationships);
  const nodesRef = useRef(nodes);
  const fullNodesRef = useRef(fullNodes);

  // Update refs when props change
  useEffect(() => {
    pageRelationshipsRef.current = pageRelationships;
  }, [pageRelationships]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    fullNodesRef.current = fullNodes;
  }, [fullNodes]);

  const value: NodeContextValue = {
    pageRelationships,
    nodes,
    fullNodes,
    getCurrentPageRelationships: () => pageRelationshipsRef.current,
    getCurrentNodes: () => nodesRef.current,
    getCurrentFullNodes: () => fullNodesRef.current,
  };

  return (
    <NodeContext.Provider value={value}>
      {children}
    </NodeContext.Provider>
  );
}

export function useNodeContext(): NodeContextValue {
  const context = useContext(NodeContext);
  if (!context) {
    return { 
      pageRelationships: {}, 
      nodes: [],
      fullNodes: [],
      getCurrentPageRelationships: () => ({}),
      getCurrentNodes: () => ([]),
      getCurrentFullNodes: () => ([])
    };
  }
  return context;
}

// Global context reference that can be accessed from anywhere
let globalNodeContext: NodeContextValue | null = null;

export function setGlobalNodeContext(context: NodeContextValue) {
  globalNodeContext = context;
}

export function getGlobalNodeContext(): NodeContextValue {
  return globalNodeContext || { 
    pageRelationships: {}, 
    nodes: [],
    fullNodes: [],
    getCurrentPageRelationships: () => ({}),
    getCurrentNodes: () => ([]),
    getCurrentFullNodes: () => ([])
  };
}
