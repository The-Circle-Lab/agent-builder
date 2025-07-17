import { BaseNodeConfig } from "../baseNode";
import { PropertyDefinition } from "../../types";

export class QuestionsNodeConfig extends BaseNodeConfig {
  nodeType = "questions";
  displayName = "Questions";

  readonly properties = [
    ...this.createBaseProperties(),
    {
      key: "title",
      label: "Quiz Title",
      type: "text",
      defaultValue: "",
      placeholder: "Enter quiz title",
      rows: 1,
    },
    {
      key: "description",
      label: "Description",
      type: "textarea",
      defaultValue: "",
      placeholder: "Enter quiz description",
      rows: 2,
    },
    {
      key: "questions",
      label: "Multiple Choice Questions",
      type: "multipleChoiceQuestions",
      defaultValue: [],
    },
  ] as const satisfies readonly PropertyDefinition[];
}

// Export the configuration instance
export const questionsNodeConfig = new QuestionsNodeConfig().getConfig();
