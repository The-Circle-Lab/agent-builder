import { BaseNodeConfig } from "../baseNode";
import { PropertyDefinition } from "../../types";

export class ChatNodeConfig extends BaseNodeConfig {
  nodeType = "chat";
  displayName = "Chat";

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
export const chatNodeConfig = new ChatNodeConfig().getConfig();
