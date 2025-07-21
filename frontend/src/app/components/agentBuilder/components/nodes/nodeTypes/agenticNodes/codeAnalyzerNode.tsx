import React from "react";
import { Handle, Position, Edge } from "@xyflow/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChartSimple } from "@fortawesome/free-solid-svg-icons";
import { PlusButton } from "../../components/plusButton";
import { NodePropertyConfig, NodeData } from "../../types";
import { BaseNode, BaseNodeProps, NodeDataFromConfig, HandleConfig, SideMenuInfo } from "../baseNode";
import {
  codeAnalyzerNodeConfig,
  CodeAnalyzerNodeConfig,
} from "../configs/codeAnalyzerNodeConfig";

export { codeAnalyzerNodeConfig };

export type CodeAnalyzerNodeData = NodeDataFromConfig<CodeAnalyzerNodeConfig>;

export interface CodeAnalyzerNodeProps extends BaseNodeProps {
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void;
  edges?: Edge[];
  data?: CodeAnalyzerNodeData;
}

export class CodeAnalyzerNodeClass extends BaseNode<
  CodeAnalyzerNodeProps,
  CodeAnalyzerNodeData
> {
  // Handle configurations for this node type
  public static handleConfigs: Record<string, HandleConfig> = {
    "analyzer-input": {
      maxConnections: -1,
      compatibleWith: ["analyzer-output"],
    },
    "llm-model": {
      maxConnections: 1,
      compatibleWith: ["llm-input"],
    },
  };

  // Side menu information for this node type
  public static sideMenuInfo: SideMenuInfo = {
    category: "analysis",
    name: "Code Analyzer",
    icon: "/codeAnalyzer.svg",
    description: "Add a code analyzer node",
  };

  public getNodeType(): string {
    return "codeAnalyzer";
  }

  protected getConfig(): NodePropertyConfig {
    return codeAnalyzerNodeConfig;
  }

  protected renderNodeContent(): React.ReactNode {
    const { onAddNodeClick, id, edges = [] } = this.props;

    return (
      <div>
        {this.renderBaseContainer(
          <div className="flex flex-col items-center justify-center w-32 h-20">
            <FontAwesomeIcon
              icon={faChartSimple}
              size="2x"
              className="text-white mb-2"
            />
            <div className="text-white font-bold text-sm">Code Analyzer</div>
          </div>,
        )}

        {/* Input Handle - Bottom */}
        <Handle
          type="target"
          position={Position.Bottom}
          id="analyzer-input"
          style={{ top: "101.25%", left: "50%", transform: "translateX(-50%)" }}
        />

        {/* LLM Model Handle - Top */}
        <Handle
          type="source"
          position={Position.Top}
          id="llm-model"
          style={{ top: "-1.25%", left: "50%", transform: "translateX(-50%)" }}
        />
        <div className="absolute top-[-15%] left-1/2 transform -translate-x-1/2 text-xs text-white font-medium">
          LLM Model
        </div>

        {/* Plus Button above LLM Model */}
        <PlusButton
          handleId="llm-model"
          objectType="LLM"
          nodeId={id}
          edges={edges}
          onAddNodeClick={onAddNodeClick}
          position={{
            bottom: "125%",
            left: "50%",
            transform: "translateX(-50%)",
          }}
        />
      </div>
    );
  }

  public checkNodeValidity(): boolean {
    const { edges = [], id } = this.props;

    // Check if LLM handle and tests handle are connected
    const llmConnected = edges.some(
      (edge) => edge.source === id && edge.sourceHandle === "llm-model"
    );

    return llmConnected;
  }
}



// Functional component wrapper
export function CodeAnalyzerNode(props: CodeAnalyzerNodeProps) {
  return <CodeAnalyzerNodeClass {...props} />;
}

// Node type factory for ReactFlow
export const createCodeAnalyzerNodeType = (
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void,
  edges: Edge[] = [],
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void
) =>
  BaseNode.createNodeType(CodeAnalyzerNode, {
    onAddNodeClick,
    edges,
    onDelete,
    onSettings,
  });
