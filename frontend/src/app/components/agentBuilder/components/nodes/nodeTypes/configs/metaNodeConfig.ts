import { BaseNodeConfig } from "../baseNode";
import { PropertyDefinition } from "../../types";

export class MetaNodeConfig extends BaseNodeConfig {
  nodeType = "meta";
  displayName = "Meta Model";

  readonly properties = [
    ...this.createBaseProperties(),
    {
      key: "model",
      label: "Model",
      type: "select",
      defaultValue: "meta/llama-4-scout-17b-16e-instruct-maas",
      options: [
        "meta/llama-4-scout-17b-16e-instruct-maas",
        "meta/llama-4-maverick-17b-128e-instruct-maas",
        "meta/llama-3.3-70b-instruct-maas"
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
export const metaNodeConfig = new MetaNodeConfig().getConfig();
