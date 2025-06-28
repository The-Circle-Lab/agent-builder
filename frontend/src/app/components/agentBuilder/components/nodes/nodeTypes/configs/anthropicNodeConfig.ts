import { BaseNodeConfig } from "../baseNode";
import { PropertyDefinition } from "../../types";

export class AnthropicNodeConfig extends BaseNodeConfig {
  nodeType = "anthropic";
  displayName = "Anthropic Model";

  readonly properties = [
    ...this.createBaseProperties(),
    {
      key: "model",
      label: "Model",
      type: "select",
      defaultValue: "claude-3-5-haiku@20241022",
      options: [
        "claude-3-7-sonnet@20250219",
        "claude-3-5-haiku@20241022",
        "claude-sonnet-4@20250514",
        "claude-opus-4@20250514"
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
export const anthropicNodeConfig = new AnthropicNodeConfig().getConfig();
