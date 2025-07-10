import { BaseNodeConfig } from "../baseNode";
import { PropertyDefinition } from "../../types";

export class CodeAnalyzerNodeConfig extends BaseNodeConfig {
  nodeType = "chat";
  displayName = "Chat";

  readonly properties = [
    ...this.createBaseProperties(),
    {
      key: "analyzeGoodSubmissions",
      label: "Analyze correct submissions too?",
      type: "checkbox",
      defaultValue: true,
    },
  ] as const satisfies readonly PropertyDefinition[];
}

// Export the configuration instance
export const codeAnalyzerNodeConfig = new CodeAnalyzerNodeConfig().getConfig();
