import { BaseNodeConfig } from "../baseNode";
import { PropertyDefinition } from "../../types";

export class GroupNodeConfig extends BaseNodeConfig {
  nodeType = "group";
  displayName = "Group";

  readonly properties = [
    ...this.createBaseProperties(),
    {
      key: "grouping_method",
      label: "Grouping Method",
      type: "select",
      defaultValue: "homogeneous",
      options: [
        "homogeneous",
        "diverse",
        "mixed"
      ],
    },
    {
      key: "group_size",
      label: "Group Size",
      type: "number",
      defaultValue: 1,
      min: 1,
      max: 10,
    },
    {
      key: "use_demographics",
      label: "Use User Demographic Data",
      type: "checkbox",
      defaultValue: false,
    },
    {
      key: "include_explanations",
      label: "Generate AI Explanations",
      type: "checkbox",
      defaultValue: true,
    },
    {
      key: "selected_submission_prompts",
      label: "Submission Prompts for Grouping",
      type: "submissionPromptSelector",
      defaultValue: [],
      placeholder: "Select submission prompts to use for grouping",
    },
  ] as const satisfies readonly PropertyDefinition[];
}

// Export the configuration instance
export const groupNodeConfig = new GroupNodeConfig().getConfig();
