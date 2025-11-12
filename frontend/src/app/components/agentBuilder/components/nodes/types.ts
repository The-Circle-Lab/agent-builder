import { Edge } from "@xyflow/react";

// Base interfaces for polymorphism
import { BaseNodeData } from "./nodeTypes/baseNode";

export type NodeData = BaseNodeData;

export interface Var {
  name: string;
  origin_type: "student" | "behaviour";
  origin: "prompt" | "group" | "theme" | "live_presentation" | "global"
  type: "text" | "pdf" | "group" | "list";
  page: number;
  index: number;
}

// Variable interface for Global Variables node
export interface Variable {
  id: string;
  name: string;
  type: 'text' | 'group' | 'list';
  items?: string[]; // For list type variables
}

// Property definition system for generic settings forms
export interface VideoAsset {
  id: number | string;
  filename: string;
  fileSize?: number;
  fileType?: string;
  url?: string | null;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
  uploadedAt?: string;
  status?: "pending" | "processing" | "ready" | "failed";
}

export interface PropertyDefinition {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "checkbox" | "select" | "range" | "upload" | "dynamicTextList" | "testCases" | "multipleChoiceQuestions" | "submissionPrompts" | "livePresentationPrompts" | "variablesList" | "submissionPromptSelector" | "listVariableSelector" | "radio" | "videoUpload" | "hidden";
  defaultValue: string | number | boolean | string[] | TestCase[] | MultipleChoiceQuestion[] | SubmissionPrompt[] | LivePresentationPrompt[] | Variable[] | VideoAsset[] | null;
  placeholder?: string;
  options?: string[]; // For select and radio types
  min?: number; // For number and range types
  max?: number; // For number and range types
  step?: number; // For range type
  rows?: number; // For textarea type
  countKey?: string; // For dynamicTextList and testCases: key of the numeric property controlling the count
  selectionKey?: string; // For videoUpload: key of hidden property storing selected video id
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
  answerFeedbackMessages?: (string | null)[];
}

// Submission prompt representation for submission nodes
export interface SubmissionPrompt {
  prompt: string;
  mediaType: "textarea" | "hyperlink" | "pdf" | "list" | "dynamic_list" | "websiteInfo";
  items?: number | null; // For list type: number of items required
  max?: number | null; // For websiteInfo type: maximum number of website entries allowed
}

// Live presentation prompt representation for live presentation nodes
export interface LivePresentationPrompt {
  id: string;
  statement: string;
  hasInput: boolean;
  inputType?: "textarea" | "text";
  inputPlaceholder?: string;
  useRandomListItem?: boolean;
  listVariableId?: string;
}
