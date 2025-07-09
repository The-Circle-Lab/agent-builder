import { BaseNodeConfig } from "../baseNode";
import { PropertyDefinition } from "../../types";

export class CodeNodeConfig extends BaseNodeConfig {
  nodeType = "code";
  displayName = "Code";

  readonly properties = [
    ...this.createBaseProperties(),
    {
      key: "saveMessages",
      label: "Save Messages",
      type: "checkbox",
      defaultValue: true,
    },
  ] as const satisfies readonly PropertyDefinition[];
}

// Export the configuration instance
export const codeNodeConfig = new CodeNodeConfig().getConfig();
