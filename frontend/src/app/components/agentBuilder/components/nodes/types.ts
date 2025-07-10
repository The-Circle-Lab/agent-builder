import { Edge } from "@xyflow/react";

// Base interfaces for polymorphism
import { BaseNodeData } from "./nodeTypes/baseNode";

export type NodeData = BaseNodeData;

// Property definition system for generic settings forms
export interface PropertyDefinition {
  key: string;
  label: string;
  // Extend supported types with a dynamic list of text inputs
  type: "text" | "textarea" | "number" | "checkbox" | "select" | "range" | "upload" | "dynamicTextList" | "testCases";
  // Allow arrays for dynamic text list and test cases default values
  defaultValue: string | number | boolean | string[] | TestCase[];
  placeholder?: string;
  options?: string[]; // For select type
  min?: number; // For number and range types
  max?: number; // For number and range types
  step?: number; // For range type
  rows?: number; // For textarea type
  /**
   * When `type` is `dynamicTextList`, the value of the property referenced by
   * `countKey` determines how many text boxes should be displayed.
   */
  countKey?: string; // For dynamicTextList and testCases: key of the numeric property controlling the count
}

// Component prop interfaces
export interface NodeContainerProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  selected?: boolean;
  onDelete?: () => void;
  onSettings?: () => void;
  shape?: "normal" | "left" | "right";
}

export interface PlusButtonProps {
  handleId: string;
  objectType: string;
  nodeId?: string;
  edges?: Edge[]; // Make optional to match actual usage
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void;
  position: {
    bottom?: string;
    left?: string;
    right?: string;
    transform?: string;
  };
}

export interface NodePropertyConfig {
  nodeType: string;
  displayName: string;
  properties: PropertyDefinition[];
}

// Test case representation for testing nodes
export interface TestCase {
  parameters: string[];
  expected: string;
}
