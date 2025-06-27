import { BaseNodeConfig } from "../baseNode";
import { PropertyDefinition } from "../../types";

export class AgentNodeConfig extends BaseNodeConfig {
  nodeType = "agent";
  displayName = "AI Agent";

  readonly properties = [
    ...this.createBaseProperties(),
    {
      key: "prompt",
      label: "Prompt",
      type: "textarea",
      defaultValue: "{input}",
      placeholder: "Enter agent prompt",
      rows: 4,
    },
    {
      key: "systemPrompt",
      label: "System Prompt",
      type: "textarea",
      defaultValue: "You are a helpful teaching assistant. For every piece of info you give the user based on the documents knowledge base, make sure to reference which document that info came from. \nIf the user asks a question which isn't in the scope of the document knowledge base, fall back to your own knowledge but make sure to let them know you're doing so.\nAlways reference course material like this: (filename, Page #)",
      placeholder: "Enter system prompt",
      rows: 4,
    },
    {
      key: "retryOnFail",
      label: "Retry on Fail",
      type: "checkbox",
      defaultValue: false,
    },
  ] as const satisfies readonly PropertyDefinition[];
}

// Export the configuration instance
export const agentNodeConfig = new AgentNodeConfig().getConfig();
