import React from "react";
import { Edge, Handle, Position } from "@xyflow/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faQuestion } from "@fortawesome/free-solid-svg-icons";
import { NodePropertyConfig, NodeData } from "../../types";
import { BaseNode, BaseNodeProps, NodeDataFromConfig, HandleConfig, SideMenuInfo } from "../baseNode";
import { QuestionsNodeConfig, questionsNodeConfig } from "../configs/questionsNodeConfig";

export { questionsNodeConfig };

export type QuestionsNodeData = NodeDataFromConfig<QuestionsNodeConfig>;

export interface QuestionsNodeProps extends BaseNodeProps {
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void;
  edges?: Edge[]; 
  data?: QuestionsNodeData;
}

export class QuestionsNodeClass extends BaseNode<QuestionsNodeProps, QuestionsNodeData> {
  public static nodeType: "base" | "start" | "end" = "end";
  public static canAddNode = true; // Enable proper handler mapping

  // Handle configurations for this node type
  public static handleConfigs: Record<string, HandleConfig> = {
    "mcq-input": {
      maxConnections: 1,
      compatibleWith: ["mcq-output"],
    },
  };

  // Side menu information for this node type
  public static sideMenuInfo: SideMenuInfo = {
    category: "questions",
    name: "Questions",
    icon: "/questions.svg",
    description: "Add a questions node",
  };

  public getNodeType(): string {
    return "questions";
  }

  protected getConfig(): NodePropertyConfig {
    return questionsNodeConfig;
  }

  protected renderNodeContent(): React.ReactNode {
    return (
      <div>
        {this.renderBaseContainer(
          <div>
            <FontAwesomeIcon
              icon={faQuestion}
              size="2x"
              className="text-white mb-2"
            />
            <div className="text-white font-bold text-sm">Questions</div>
          </div>,
          "flex flex-col items-center justify-center w-32 h-20",
          "right" // Use right shape - straight on left, rounded on right
        )}

        {/* Input Handle - Left */}
        <Handle
          type="target"
          position={Position.Left}
          id="mcq-input"
          style={{ top: "50%", left: "-1.25%", transform: "translateY(-50%)" }}
        />
      </div>
    );
  }
}

// Functional component wrapper
export function QuestionsNode(props: QuestionsNodeProps) {
  return <QuestionsNodeClass {...props} />;
}

// Node type factory for ReactFlow
export const createQuestionsNodeType = (
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void,
  edges: Edge[] = [],
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void
) =>
  BaseNode.createNodeType(QuestionsNode, {
    onAddNodeClick,
    edges,
    onDelete,
    onSettings,
  });
