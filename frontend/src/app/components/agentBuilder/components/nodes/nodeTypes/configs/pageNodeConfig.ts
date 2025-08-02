import { NodePropertyConfig } from "../../types";

export const PAGE_NODE_CONFIG: NodePropertyConfig = {
  nodeType: "page",
  displayName: "Page",
  properties: [
    {
      key: "pageNumber",
      label: "Page Number",
      type: "number",
      defaultValue: 1,
      min: 1,
      max: 999,
    },
    {
      key: "label",
      label: "Page Label",
      type: "text",
      defaultValue: "",
      placeholder: "Custom page name (optional)...",
    },
    {
      key: "backgroundColor",
      label: "Background Color",
      type: "select",
      defaultValue: "#3B82F6",
      options: [
        "#3B82F6", // Blue
        "#10B981", // Green
        "#F59E0B", // Amber
        "#EF4444", // Red
        "#8B5CF6", // Purple
        "#06B6D4", // Cyan
        "#F97316", // Orange
        "#84CC16", // Lime
      ],
    },
    {
      key: "opacity",
      label: "Background Opacity",
      type: "range",
      defaultValue: 0.15,
      min: 0.05,
      max: 0.5,
      step: 0.05,
    },
    {
      key: "width",
      label: "Width",
      type: "number",
      defaultValue: 300,
      min: 200,
      max: 1000,
    },
    {
      key: "height",
      label: "Height",
      type: "number",
      defaultValue: 200,
      min: 150,
      max: 800,
    },
  ],
}; 
