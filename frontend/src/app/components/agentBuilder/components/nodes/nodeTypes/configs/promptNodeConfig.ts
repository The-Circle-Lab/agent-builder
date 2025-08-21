import { BaseNodeConfig } from "../baseNode";
import { PropertyDefinition } from "../../types";

export class PromptNodeConfig extends BaseNodeConfig {
  nodeType = "prompt";
  displayName = "Prompt";

  readonly properties = [
    ...this.createBaseProperties(),
    {
      key: "question",
      label: "Prompt for students",
      type: "textarea",
      rows: 3,
      defaultValue: "",
    }
  ] as const satisfies readonly PropertyDefinition[];
}

// Export the configuration instance
export const promptNodeConfig = new PromptNodeConfig().getConfig();
