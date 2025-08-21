import { BaseNodeConfig } from "../baseNode";
import { PropertyDefinition } from "../../types";

export class ThemeCreatorNodeConfig extends BaseNodeConfig {
  nodeType = "themeCreator";
  displayName = "Theme Creator";

  readonly properties = [
    ...this.createBaseProperties(),
    {
      key: "num_themes",
      label: "Number of Themes",
      type: "number",
      defaultValue: 3,
      min: 1,
      max: 20,
    },
    {
      key: "selected_submission_prompts",
      label: "Submission Prompts for Theming",
      type: "submissionPromptSelector",
      defaultValue: [],
      placeholder: "Select submission prompts to use for theme creation",
    },
    {
      key: "llm_polish_prompt",
      label: "LLM Helper Prompt (optional)",
      type: "textarea",
      defaultValue: "",
      placeholder: "Enter a prompt for the LLM to polish the theme names to tailor to the type of question being asked",
    },
    {
      key: "filter_web_content",
      label: "Filter Web Content (Remove ads, navigation, headers, and other web artifacts from PDF content)",
      type: "checkbox",
      defaultValue: true,
    },
    {
      key: "enhance_with_web_search",
      label: "Enhance Themes with Recent Events (Use web search to connect themes to recent events and current context)",
      type: "checkbox",
      defaultValue: false,
    }
  ] as const satisfies readonly PropertyDefinition[];
}

// Export the configuration instance
export const themeCreatorNodeConfig = new ThemeCreatorNodeConfig().getConfig();



