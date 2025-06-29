import { BaseNodeConfig } from "../baseNode";
import { PropertyDefinition } from "../../types";

export class DeepSeekNodeConfig extends BaseNodeConfig {
  nodeType = "deepSeek";
  displayName = "DeepSeek Model";

  readonly properties = [
    ...this.createBaseProperties(),
    {
      key: "model",
      label: "Model",
      type: "select",
      defaultValue: "deepseek-ai/deepseek-r1-0528-maas",
      options: [
        "deepseek-ai/deepseek-r1-0528-maas"
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
export const deepSeekNodeConfig = new DeepSeekNodeConfig().getConfig();
