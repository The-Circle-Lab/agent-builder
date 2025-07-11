import { BaseNodeConfig } from "../baseNode";
import { PropertyDefinition } from "../../types";

export class OpenAINodeConfig extends BaseNodeConfig {
  nodeType = "openAI";
  displayName = "OpenAI Model";

  readonly properties = [
    ...this.createBaseProperties(),
    {
      key: "model",
      label: "Model",
      type: "select",
      defaultValue: "gpt-4o-2024-08-06",
      options: [
        "o3-2025-04-16",
        "gpt-4o-2024-08-06",
        "o4-mini-2025-04-16",
        "gpt-4.1-mini-2025-04-14",
      ],
    },
    {
      key: "maximumOutputTokens",
      label: "Maximum Output Tokens",
      type: "number",
      defaultValue: 1200,
      min: 1,
      max: 2000,
    },
    {
      key: "topP",
      label: "Top P",
      type: "range",
      defaultValue: 0.5,
      min: 0,
      max: 1,
      step: 0.1,
    },
    {
      key: "temperature",
      label: "Temperature",
      type: "range",
      defaultValue: 0.6,
      min: 0,
      max: 2,
      step: 0.1,
    },
  ] as const satisfies readonly PropertyDefinition[];
}

// Export the configuration instance
export const openAINodeConfig = new OpenAINodeConfig().getConfig();
