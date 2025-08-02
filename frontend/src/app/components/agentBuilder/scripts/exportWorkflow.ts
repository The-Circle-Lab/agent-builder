import { Node, Edge } from "@xyflow/react";
import { NodeClasses } from "../components/nodes/nodeTypes";
import {
  findStartingNode,
  getNodeConfig,
  getNodeAttachments,
} from "./nodeHelpers";

// Creates a JSON representation of the workflow for export to backend
export function createWorkflowJSON(nodes: Node[], edges: Edge[], pageRelationships?: Record<string, string[]>) {
  // Check if the workflow is valid for deployment
  if (!checkWorkflowValidity(nodes, edges)) {
    throw new Error(
      "Invalid workflow: Make sure your workflow has a chat node connected to other nodes and ends with an output node."
    );
  }

  // Check if pages exist in the workflow
  const pagesExist = nodes.some(node => node.type === 'page');

  if (pagesExist && pageRelationships) {
    // Organize workflow by pages
    const workflow: {
      pagesExist: boolean;
      pages: Record<number, Record<number, {
        type: string;
        config: Record<string, unknown>;
        attachments?: Record<string, unknown>;
      }>>;
    } = {
      pagesExist,
      pages: {},
    };

    // Get all page nodes and sort by page number
    const pageNodes = nodes
      .filter(node => node.type === 'page')
      .sort((a, b) => {
        const aPageNumber = (a.data as { pageNumber?: number })?.pageNumber || 1;
        const bPageNumber = (b.data as { pageNumber?: number })?.pageNumber || 1;
        return aPageNumber - bPageNumber;
      });

    // Process each page
    pageNodes.forEach((pageNode) => {
      const pageNumber = (pageNode.data as { pageNumber?: number })?.pageNumber || 1;
      const nodesInPage = pageRelationships[pageNode.id] || [];
      
      workflow.pages[pageNumber] = {};
      
      // Process nodes in this page
      let nodeIndex = 1;
      nodesInPage.forEach((nodeId) => {
        const node = nodes.find(n => n.id === nodeId);
        if (node && node.type !== 'page') {
          // Get node configuration
          const config = getNodeConfig(node);
          
          // Get attachments for specific node types
          const attachments = getNodeAttachments(node, edges, nodes);
          
          // Create the workflow entry
          const workflowEntry: {
            type: string;
            config: Record<string, unknown>;
            attachments?: Record<string, unknown>;
          } = {
            type: node.type || "unknown",
            config,
          };
          
          if (attachments) {
            workflowEntry.attachments = attachments;
          }
          
          workflow.pages[pageNumber][nodeIndex] = workflowEntry;
          nodeIndex++;
        }
      });
    });

    return JSON.stringify(workflow, null, 2);
  } else {
    // Original workflow structure when no pages exist
    const workflow: {
      pagesExist: boolean;
      nodes: Record<
        number,
        {
          type: string;
          config: Record<string, unknown>;
          attachments?: Record<string, unknown>;
        }
      >;
    } = {
      pagesExist,
      nodes: {},
    };

    // Start from the starting node and traverse the workflow
    let currentNode = findStartingNode(nodes);
    let nodeIndex = 1;
    const visitedNodes = new Set<string>();

    while (currentNode && !visitedNodes.has(currentNode.id)) {
      visitedNodes.add(currentNode.id);

      // Get node configuration
      const config = getNodeConfig(currentNode);

      // Get attachments for specific node types
      const attachments = getNodeAttachments(currentNode, edges, nodes);

      // Create the workflow entry
      const workflowEntry: {
        type: string;
        config: Record<string, unknown>;
        attachments?: Record<string, unknown>;
      } = {
        type: currentNode.type || "unknown",
        config,
      };

      if (attachments) {
        workflowEntry.attachments = attachments;
      }

      workflow.nodes[nodeIndex] = workflowEntry;
      nodeIndex++;

      // Get the next node in the workflow
      const nodeClass = NodeClasses[currentNode.type as keyof typeof NodeClasses];
      if (nodeClass) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tempInstance: any = new nodeClass({ id: currentNode.id, edges } as any);
        currentNode = tempInstance.getNextNode ? tempInstance.getNextNode(nodes) : null;
      } else {
        break;
      }
    }

    return JSON.stringify(workflow, null, 2);
  }
}

// Checks if the workflow is valid (all nodes are connected with their required edges)
export function checkWorkflowValidity(nodes: Node[], edges: Edge[]): boolean {
  // Handle empty workflows (not yet built)
  if (nodes.length === 0) {
    return false;
  }

  // Handle single chat node (initial state - still being built)
  if (nodes.length === 1 && nodes[0].type === "chat") {
    return false;
  }

  let currentNode = findStartingNode(nodes);

  if (!currentNode) return false;

  const visitedNodes = new Set<string>();

  while (currentNode && !visitedNodes.has(currentNode.id)) {
    visitedNodes.add(currentNode.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeClass: any =
      NodeClasses[currentNode.type as keyof typeof NodeClasses];
    if (!nodeClass) return false;

    if (nodeClass.nodeType === "end" || nodeClass.nodeType === "start") {
      return true;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tempInstance: any = new nodeClass({ id: currentNode.id, edges });
    if (!tempInstance.checkNodeValidity()) return false;

    currentNode = tempInstance.getNextNode(nodes);
  }

  return false;
}
