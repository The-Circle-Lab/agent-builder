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
  DeepSeekNodeConfig,
  deepSeekNodeConfig,
} from "../configs/deepSeekNodeConfig";

export { deepSeekNodeConfig };

export type DeepSeekNodeData = LLMNodeData & {
  config?: DeepSeekNodeConfig;
};

export interface DeepSeekNodeProps extends LLMNodeProps {
  data?: DeepSeekNodeData;
}

export class DeepSeekNodeClass extends LLMNode<
  DeepSeekNodeProps,
  DeepSeekNodeData
> {
  // Side menu information for this node type
  public static sideMenuInfo: SideMenuInfo = {
    category: "llm",
    name: "DeepSeek Models",
    icon: "/deepseek.svg",
    description: "Add DeepSeek language models",
  };

  public getNodeType(): string {
    return "deepSeek";
  }

  protected getConfig() {
    return deepSeekNodeConfig;
  }

  protected getLLMRenderConfig(): LLMRenderConfig {
    return {
      iconSrc: "/deepseek.svg",
      iconAlt: "DeepSeek",
      title: "DeepSeek Model",
      titleBottomOffset: "25px",
      applyIconFilter: true,
    };
  }
}

// Functional component wrapper
export function DeepSeekNode(props: DeepSeekNodeProps) {
  return <DeepSeekNodeClass {...props} />;
}

// Node type factory for ReactFlow
export const createDeepSeekNodeType = (
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void
) =>
  LLMNode.createLLMNodeType(DeepSeekNode, {
    onDelete,
    onSettings,
  });
