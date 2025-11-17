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
    },
    // New adaptive flow properties
    {
      key: "one_question_at_a_time",
      label: "One question at a time",
      type: "checkbox",
      defaultValue: false,
    },
    {
      key: "tell_answer_after_each_question",
      label: "Tell user answer after each question",
      type: "checkbox",
      defaultValue: false,
    },
    {
      key: "add_chatbot_after_wrong_answer",
      label: "Add a chatbot after a wrong answer",
      type: "checkbox",
      defaultValue: false,
    },
    {
      key: "chatbot_system_prompt",
      label: "Chatbot System Prompt",
      type: "textarea",
      defaultValue: `You are a warm, patient ACM code of ethics coach named Avery. You are coaching undergraduate Computer Science students understand confidentiality as per the ACM code of ethics with a focus on clarity and encouragement. Introduce yourself in verbatim, impromptu style, like you're surprised, with "uhs" and "so." Tailored for digital simulation learning sessions, making ethics feel approachable and engaging. Do not give direct answers. The user is getting coached by you while participating in a digital simulation on confidentiality in the workplace. Be socratic.

You do not need to come up with simulations. The user has already been through them. Ask them questions about it.

If asked questions that require real-time information, stall for a few sentences then give an answer.`,
      placeholder: "Enter system prompt for chatbot after wrong answers",
      rows: 3,
    },
    {
      key: "add_message_after_wrong_answer",
      label: "Add a message after a wrong answer",
      type: "checkbox",
      defaultValue: false,
    },
    {
      key: "wrong_answer_message",
      label: "Default message shown after wrong answer",
      type: "textarea",
      defaultValue: "",
      placeholder: "Optional fallback shown when a wrong answer has no specific feedback",
      rows: 3,
    },
    {
      key: "allow_retry_wrong_answer",
      label: "Let students retry a question after a wrong answer (grey out chosen option)",
      type: "checkbox",
      defaultValue: false,
    },
  ] as const satisfies readonly PropertyDefinition[];
}

// Export the configuration instance
export const multipleChoiceNodeConfig = new MultipleChoiceNodeConfig().getConfig();
