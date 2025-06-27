import { BaseNodeConfig } from "../baseNode";
import { PropertyDefinition } from "../../types";

export class GoogleCloudNodeConfig extends BaseNodeConfig {
  nodeType = "googleCloud";
  displayName = "Google Cloud Model";

  readonly properties = [
    ...this.createBaseProperties(),
    {
      key: "model",
      label: "Model",
      type: "select",
      defaultValue: "gemini-2.5-flash",
      options: [
        "gemini-2.5-flash",
        "gemini-2.5-pro",
        "gemini-2.0-flash-001",
        "gemini-2.0-flash-lite-001",
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
export const googleCloudNodeConfig = new GoogleCloudNodeConfig().getConfig();
