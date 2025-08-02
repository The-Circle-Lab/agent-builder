import { BaseNodeConfig } from "../baseNode";
import { PropertyDefinition } from "../../types";

export class VideoNodeConfig extends BaseNodeConfig {
  nodeType = "video";
  displayName = "Video";

  readonly properties = [
    ...this.createBaseProperties(),
    {
      key: "title",
      label: "Video Title",
      type: "text",
      defaultValue: "",
    },
    {
      key: "videoUrl",
      label: "What video should be played?",
      type: "uploadVideo",
      defaultValue: "",
    },
  ] as const satisfies readonly PropertyDefinition[];
}

// Export the configuration instance
export const videoNodeConfig = new VideoNodeConfig().getConfig();
