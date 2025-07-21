import React from "react";
import { NodeData } from "../../types";
import { SideMenuInfo } from "../baseNode";
import {
  LLMNode,
  LLMNodeProps,
  LLMNodeData,
  LLMRenderConfig,
} from "./baseLLMNode";
import { MetaNodeConfig, metaNodeConfig } from "../configs/metaNodeConfig";

export { metaNodeConfig };

export type MetaNodeData = LLMNodeData & {
  config?: MetaNodeConfig;
};

export interface MetaNodeProps extends LLMNodeProps {
  data?: MetaNodeData;
}

export class MetaNodeClass extends LLMNode<MetaNodeProps, MetaNodeData> {
  // Side menu information for this node type
  public static sideMenuInfo: SideMenuInfo = {
    category: "llm",
    name: "Meta Models",
    icon: "/meta.svg",
    description: "Add Meta language models",
  };

  public getNodeType(): string {
    return "meta";
  }

  protected getConfig() {
    return metaNodeConfig;
  }

  protected getLLMRenderConfig(): LLMRenderConfig {
    return {
      iconSrc: "/meta.svg",
      iconAlt: "Meta",
      title: "Meta Model",
      titleBottomOffset: "45px",
      applyIconFilter: true,
    };
  }
}

// Functional component wrapper
export function MetaNode(props: MetaNodeProps) {
  return <MetaNodeClass {...props} />;
}

// Node type factory for ReactFlow
export const createMetaNodeType = (
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void
) =>
  LLMNode.createLLMNodeType(MetaNode, {
    onDelete,
    onSettings,
  });
