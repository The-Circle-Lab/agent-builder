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
  AnthropicNodeConfig,
  anthropicNodeConfig,
} from "../configs/anthropicNodeConfig";

export { anthropicNodeConfig };

export type AnthropicNodeData = LLMNodeData & {
  config?: AnthropicNodeConfig;
};

export interface AnthropicNodeProps extends LLMNodeProps {
  data?: AnthropicNodeData;
}

export class AnthropicNodeClass extends LLMNode<
  AnthropicNodeProps,
  AnthropicNodeData
> {
  // Side menu information for this node type
  public static sideMenuInfo: SideMenuInfo = {
    category: "llm",
    name: "Anthropic Models",
    icon: "/anthropic.svg",
    description: "Add Anthropic language models",
  };

  public getNodeType(): string {
    return "anthropic";
  }

  protected getConfig() {
    return anthropicNodeConfig;
  }

  protected getLLMRenderConfig(): LLMRenderConfig {
    return {
      iconSrc: "/anthropic.svg",
      iconAlt: "Anthropic",
      title: "Anthropic Model",
      titleBottomOffset: "45px",
      applyIconFilter: true,
    };
  }
}

// Functional component wrapper
export function AnthropicNode(props: AnthropicNodeProps) {
  return <AnthropicNodeClass {...props} />;
}

// Node type factory for ReactFlow
export const createAnthropicNodeType = (
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void
) =>
  LLMNode.createLLMNodeType(AnthropicNode, {
    onDelete,
    onSettings,
  });
