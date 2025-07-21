import React from "react";
import { Edge, Handle, Position } from "@xyflow/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faVial } from "@fortawesome/free-solid-svg-icons";
import { NodePropertyConfig, NodeData } from "../../types";
import { BaseNode, BaseNodeProps, NodeDataFromConfig, HandleConfig, SideMenuInfo } from "../baseNode";
import { TestsNodeConfig, testsNodeConfig } from "../configs/testsNodeConfig";
import { PlusButton } from "../../components/plusButton";

export { testsNodeConfig };

export type TestsNodeData = NodeDataFromConfig<TestsNodeConfig>;

export interface TestsNodeProps extends BaseNodeProps {
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void;
  edges?: Edge[]; 
  data?: TestsNodeData;
}

export class TestsNodeClass extends BaseNode<TestsNodeProps, TestsNodeData> {
  public static nodeType: "base" | "start" | "end" = "end";
  public static canAddNode = true; // Enable plus button functionality

  // Handle configurations for this node type
  public static handleConfigs: Record<string, HandleConfig> = {
    "tests-output": {
      maxConnections: -1,
      compatibleWith: ["tests-input"],
    },
    "analyzer-output": {
      maxConnections: -1,
      compatibleWith: ["analyzer-input"],
    },
  };

  // Side menu information for this node type
  public static sideMenuInfo: SideMenuInfo = {
    category: "tests",
    name: "Tests",
    icon: "/tests.svg",
    description: "Add a tests node",
  };

  public getNodeType(): string {
    return "tests";
  }

  protected getConfig(): NodePropertyConfig {
    return testsNodeConfig;
  }

  protected renderNodeContent(): React.ReactNode {
    const { id, edges = [], onAddNodeClick } = this.props;

    return (
      <div>
        {this.renderBaseContainer(
          <div>
            <FontAwesomeIcon
              icon={faVial}
              size="2x"
              className="text-white mb-2"
            />
            <div className="text-white font-bold text-sm">Tests</div>
          </div>,
          "flex flex-col items-center justify-center w-32 h-20",
          "right" // Use right shape - straight on left, rounded on right
        )}

        {/* Input Handle - Left */}
        <Handle
          type="target"
          position={Position.Left}
          id="tests-output"
          style={{ top: "50%", left: "-1.25%", transform: "translateY(-50%)" }}
        />

        {/* Output to Code Analyzer - Source Handle */}
        <Handle
          type="source"
          position={Position.Top}
          id="analyzer-output"
          style={{ top: "-1.25%", left: "50%", transform: "translateX(-50%)" }}
        />

        <PlusButton
          handleId="analyzer-output" // Changed to use the source handle
          objectType="codeAnalyzer"
          nodeId={id}
          edges={edges}
          onAddNodeClick={onAddNodeClick}
          position={{
            bottom: "111.25%",
            left: "50%", // Align with the analyzer-output handle
            transform: "translateX(-50%)",
          }}
        />
      </div>
    );
  }
}

// Functional component wrapper
export function TestsNode(props: TestsNodeProps) {
  return <TestsNodeClass {...props} />;
}

// Node type factory for ReactFlow
export const createTestsNodeType = (
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void,
  edges: Edge[] = [],
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void
) =>
  BaseNode.createNodeType(TestsNode, {
    onAddNodeClick,
    edges,
    onDelete,
    onSettings,
  });
