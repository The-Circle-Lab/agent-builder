import { Node, Edge } from "@xyflow/react";
import { NodeClasses } from "../components/nodes/nodeTypes";
import {
  findStartingNode,
  getNodeConfig,
  getNodeAttachments,
} from "./nodeHelpers";

// Creates a JSON representation of the workflow for export to backend
export function createWorkflowJSON(nodes: Node[], edges: Edge[]) {
  // Check if the workflow is valid for deployment
  if (!checkWorkflowValidity(nodes, edges)) {
    throw new Error(
      "Invalid workflow: Make sure your workflow has a chat node connected to other nodes and ends with an output node."
    );
  }

  const workflow: Record<
    number,
    {
      type: string;
      config: Record<string, unknown>;
      attachments?: Record<string, unknown>;
    }
  > = {};

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

    workflow[nodeIndex] = workflowEntry;
    nodeIndex++;

    // Get the next node in the workflow
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeClass: any =
      NodeClasses[currentNode.type as keyof typeof NodeClasses];
    if (nodeClass) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tempInstance: any = new nodeClass({ id: currentNode.id, edges });
      currentNode = tempInstance.getNextNode(nodes);
    } else {
      break;
    }
  }

  return JSON.stringify(workflow, null, 2);
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
