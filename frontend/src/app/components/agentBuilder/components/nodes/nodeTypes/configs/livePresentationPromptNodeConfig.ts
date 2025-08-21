import { BaseNodeConfig } from "../baseNode";
import { PropertyDefinition } from "../../types";

export class LivePresentationPromptNodeConfig extends BaseNodeConfig {
  nodeType = "livePresentationPrompt";
  displayName = "Live Presentation Prompts";

  readonly properties = [
    ...this.createBaseProperties(),
    {
      key: "saved_prompts",
      label: "Saved Prompts for Live Presentation",
      type: "livePresentationPrompts",
      defaultValue: [],
      placeholder: "Configure prompts that can display random items from connected list variables alongside the prompt text",
    }
  ] as const satisfies readonly PropertyDefinition[];
}

// Export the configuration instance
export const livePresentationPromptNodeConfig = new LivePresentationPromptNodeConfig().getConfig();
