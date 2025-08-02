import { BaseNodeConfig } from "../baseNode";
import { PropertyDefinition } from "../../types";

export class SubmissionNodeConfig extends BaseNodeConfig {
  nodeType = "submission";
  displayName = "Submission";

  readonly properties = [
    ...this.createBaseProperties(),
    {
      key: "submission_prompts",
      label: "Submission Prompts",
      type: "submissionPrompts",
      defaultValue: [],
      placeholder: "Configure submission prompts",
    }
  ] as const satisfies readonly PropertyDefinition[];
}

// Export the configuration instance
export const submissionNodeConfig = new SubmissionNodeConfig().getConfig();
