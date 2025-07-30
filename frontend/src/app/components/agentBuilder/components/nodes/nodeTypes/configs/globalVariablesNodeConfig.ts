import { NodePropertyConfig } from "../../types";

export const GLOBAL_VARIABLES_NODE_CONFIG: NodePropertyConfig = {
  nodeType: "globalVariables",
  displayName: "Global Variables",
  properties: [
    {
      key: "label",
      label: "Container Label",
      type: "text",
      defaultValue: "Global Variables",
      placeholder: "Enter container label"
    },
    {
      key: "variables",
      label: "Variables",
      type: "variablesList",
      defaultValue: []
    },
    {
      key: "backgroundColor",
      label: "Background Color",
      type: "text",
      defaultValue: "#10B981",
      placeholder: "#10B981"
    },
    {
      key: "opacity",
      label: "Background Opacity",
      type: "range",
      defaultValue: 0.15,
      min: 0,
      max: 1,
      step: 0.05
    }
  ],
}; 
