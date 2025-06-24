import { BaseNodeConfig } from "../baseNode";
import { PropertyDefinition } from "../../types";

export class OutputNodeConfig extends BaseNodeConfig {
  nodeType = "result";
  displayName = "Output";

  readonly properties = [
    ...this.createBaseProperties(),
    {
      key: "format",
      label: "Output Format",
      type: "select",
      defaultValue: "text",
      options: ["text", "json", "markdown"],
    },
    {
      key: "saveOutput",
      label: "Save Output",
      type: "checkbox",
      defaultValue: true,
    },
  ] as const satisfies readonly PropertyDefinition[];
}

// Export the configuration instance
export const outputNodeConfig = new OutputNodeConfig().getConfig();
