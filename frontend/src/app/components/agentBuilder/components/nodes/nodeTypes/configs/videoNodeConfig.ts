import { BaseNodeConfig } from "../baseNode";
import { PropertyDefinition } from "../../types";

export class VideoNodeConfig extends BaseNodeConfig {
  nodeType = "video";
  displayName = "Video Upload";

  readonly properties = [
    {
      key: "selected_video_id",
      label: "Selected Video Id",
      type: "hidden",
      defaultValue: null,
    },
    {
      key: "videos",
      label: "Video Upload",
      type: "videoUpload",
      defaultValue: [],
      placeholder: "Upload a video file",
      selectionKey: "selected_video_id",
    },
  ] as const satisfies readonly PropertyDefinition[];
}

export const videoNodeConfig = new VideoNodeConfig().getConfig();
