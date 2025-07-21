import React from "react";
import { NodeData } from "../../types";
import { SideMenuInfo } from "../baseNode";
import {
  LLMNode,
  LLMNodeProps,
  LLMNodeData,
  LLMRenderConfig,
} from "./baseLLMNode";
import {
  GoogleCloudNodeConfig,
  googleCloudNodeConfig,
} from "../configs/googleCloudNodeConfig";

export { googleCloudNodeConfig };

export type GoogleCloudNodeData = LLMNodeData & {
  config?: GoogleCloudNodeConfig;
};

export interface GoogleCloudNodeProps extends LLMNodeProps {
  data?: GoogleCloudNodeData;
}

export class GoogleCloudNodeClass extends LLMNode<
  GoogleCloudNodeProps,
  GoogleCloudNodeData
> {
  // Side menu information for this node type
  public static sideMenuInfo: SideMenuInfo = {
    category: "llm",
    name: "Google AI Models",
    icon: "/google.svg",
    description: "Add Google AI language models",
  };

  public getNodeType(): string {
    return "googleCloud";
  }

  protected getConfig() {
    return googleCloudNodeConfig;
  }

  protected getLLMRenderConfig(): LLMRenderConfig {
    return {
      iconSrc: "/google.svg",
      iconAlt: "Google Cloud",
      title: "Google AI Model",
      titleBottomOffset: "45px",
      applyIconFilter: false,
    };
  }
}

// Functional component wrapper
export function GoogleCloudNode(props: GoogleCloudNodeProps) {
  return <GoogleCloudNodeClass {...props} />;
}

// Node type factory for ReactFlow
export const createGoogleCloudNodeType = (
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void
) =>
  LLMNode.createLLMNodeType(GoogleCloudNode, {
    onDelete,
    onSettings,
  });
