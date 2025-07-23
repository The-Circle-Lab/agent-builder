import React from "react";
import { Edge, Handle, Position } from "@xyflow/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPaperPlane } from "@fortawesome/free-solid-svg-icons";
import { NodePropertyConfig, NodeData } from "../../types";
import { BaseNode, BaseNodeProps, NodeDataFromConfig, HandleConfig, SideMenuInfo } from "../baseNode";
import { SubmissionNodeConfig, submissionNodeConfig } from "../configs/submissionNodeConfig";

export { submissionNodeConfig };

export type SubmissionNodeData = NodeDataFromConfig<SubmissionNodeConfig>;

export interface SubmissionNodeProps extends BaseNodeProps {
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void;
  edges?: Edge[]; 
  data?: SubmissionNodeData;
}

export class SubmissionNodeClass extends BaseNode<SubmissionNodeProps, SubmissionNodeData> {
  public static nodeType: "base" | "start" | "end" = "end";
  public static canAddNode = true; 

  // Handle configurations for this node type
  public static handleConfigs: Record<string, HandleConfig> = {
    "prompt-input": {
      maxConnections: 1,
      compatibleWith: ["prompt-output"],
    },
  };

  // Side menu information for this node type
  public static sideMenuInfo: SideMenuInfo = {
    category: "submission",
    name: "Submission",
    icon: "/submission.svg",
    description: "Add a submission node",
  };

  public getNodeType(): string {
    return "submission";
  }

  protected getConfig(): NodePropertyConfig {
    return submissionNodeConfig;
  }

  protected renderNodeContent(): React.ReactNode {
    return (
      <div>
        {this.renderBaseContainer(
          <div>
            <FontAwesomeIcon
              icon={faPaperPlane}
              size="2x"
              className="text-white mb-2"
            />
            <div className="text-white font-bold text-sm">Submissions</div>
          </div>,
          "flex flex-col items-center justify-center w-32 h-20",
          "right" // Use right shape - straight on left, rounded on right
        )}

        {/* Input Handle - Left */}
        <Handle
          type="target"
          position={Position.Left}
          id="prompt-input"
          style={{ top: "50%", left: "-1.25%", transform: "translateY(-50%)" }}
        />
      </div>
    );
  }
}

// Functional component wrapper
export function SubmissionNode(props: SubmissionNodeProps) {
  return <SubmissionNodeClass {...props} />;
}

// Node type factory for ReactFlow
export const createSubmissionNodeType = (
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void,
  edges: Edge[] = [],
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void
) =>
  BaseNode.createNodeType(SubmissionNode, {
    onAddNodeClick,
    edges,
    onDelete,
    onSettings,
  });
