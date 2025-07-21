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
  OpenAINodeConfig,
  openAINodeConfig,
} from "../configs/openAINodeConfig";

export { openAINodeConfig };

export type OpenAINodeData = LLMNodeData & {
  config?: OpenAINodeConfig;
};

export interface OpenAINodeProps extends LLMNodeProps {
  data?: OpenAINodeData;
}

export class OpenAINodeClass extends LLMNode<OpenAINodeProps, OpenAINodeData> {
  // Side menu information for this node type
  public static sideMenuInfo: SideMenuInfo = {
    category: "llm",
    name: "OpenAI Models",
    icon: "/openai.svg",
    description: "Add OpenAI language models",
  };

  public getNodeType(): string {
    return "openAI";
  }

  protected getConfig() {
    return openAINodeConfig;
  }

  protected getLLMRenderConfig(): LLMRenderConfig {
    return {
      iconSrc: "/openai.svg",
      iconAlt: "OpenAI",
      title: "OpenAI Model",
      titleBottomOffset: "45px",
      applyIconFilter: true,
    };
  }
}

// Functional component wrapper
export function OpenAINode(props: OpenAINodeProps) {
  return <OpenAINodeClass {...props} />;
}

// Node type factory for ReactFlow
export const createOpenAINodeType = (
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void
) =>
  LLMNode.createLLMNodeType(OpenAINode, {
    onDelete,
    onSettings,
  });
