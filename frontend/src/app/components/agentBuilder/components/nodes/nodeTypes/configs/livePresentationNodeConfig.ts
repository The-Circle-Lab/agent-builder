import { BaseNodeConfig } from "../baseNode";
import { PropertyDefinition } from "../../types";

export class LivePresentationNodeConfig extends BaseNodeConfig {
  nodeType = "livePresentation";
  displayName = "Live Presentation";

  readonly properties = [
    ...this.createBaseProperties(),
    {
      key: "title",
      label: "Presentation Title",
      type: "text",
      defaultValue: "",
      placeholder: "Enter presentation title",
    },
    {
      key: "description",
      label: "Presentation Description",
      type: "textarea",
      rows: 3,
      defaultValue: "",
      placeholder: "Describe what this live presentation will cover",
    }
  ] as const satisfies readonly PropertyDefinition[];
}

// Export the configuration instance
export const livePresentationNodeConfig = new LivePresentationNodeConfig().getConfig();




