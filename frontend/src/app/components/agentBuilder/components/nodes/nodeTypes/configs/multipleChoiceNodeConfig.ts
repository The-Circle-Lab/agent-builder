import { BaseNodeConfig } from "../baseNode";
import { PropertyDefinition } from "../../types";

export class MultipleChoiceNodeConfig extends BaseNodeConfig {
  nodeType = "mcq";
  displayName = "Multiple Choice";

  readonly properties = [
    ...this.createBaseProperties(),
    {
      key: "questionsGiven",
      label: "How many questions to give? (-1 for all)",
      type: "number",
      defaultValue: -1,
    },
    {
      key: "randomizeQuestions",
      label: "Randomize questions?",
      type: "checkbox",
      defaultValue: true,
    }
  ] as const satisfies readonly PropertyDefinition[];
}

// Export the configuration instance
export const multipleChoiceNodeConfig = new MultipleChoiceNodeConfig().getConfig();
