import { BaseNodeConfig } from "../baseNode";
import { PropertyDefinition } from "../../types";

export class McpNodeConfig extends BaseNodeConfig {
  nodeType = "mcp";
  displayName = "MCP Sources";

  readonly properties = [
    ...this.createBaseProperties(),
    {
      key: "files",
      label: "Files",
      type: "upload",
      defaultValue: "",
      placeholder: "Select files to ingest",
    },
  ] as const satisfies readonly PropertyDefinition[];
}

// Export the configuration instance
export const mcpNodeConfig = new McpNodeConfig().getConfig(); 
