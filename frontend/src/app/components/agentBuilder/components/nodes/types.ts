import { Edge } from "@xyflow/react";

// Base interfaces for polymorphism
import { BaseNodeData } from "./nodeTypes/baseNode";

export type NodeData = BaseNodeData;

// Property definition system for generic settings forms
export interface PropertyDefinition {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "checkbox" | "select" | "range" | "upload" | "dynamicTextList" | "testCases" | "multipleChoiceQuestions";
  defaultValue: string | number | boolean | string[] | TestCase[] | MultipleChoiceQuestion[];
  placeholder?: string;
  options?: string[]; // For select type
  min?: number; // For number and range types
  max?: number; // For number and range types
  step?: number; // For range type
  rows?: number; // For textarea type
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
  edges?: Edge[]; 
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

// Multiple choice question representation for quiz nodes
export interface MultipleChoiceQuestion {
  text: string;
  answers: string[];
  correctAnswer: number; 
}
