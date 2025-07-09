import { BaseNodeConfig } from "../baseNode";
import { PropertyDefinition } from "../../types";

export class TestsNodeConfig extends BaseNodeConfig {
  nodeType = "tests";
  displayName = "Tests";

  readonly properties = [
    ...this.createBaseProperties(),
    {
      key: "function_name",
      label: "Function Name",
      type: "text",
      defaultValue: "",
      placeholder: "Enter function name",
      rows: 1,
    },
    {
      key: "parameter_count",
      label: "Parameter Count",
      type: "number",
      defaultValue: 1,
      placeholder: "Enter parameter count",
      rows: 1,
      min: 0,
      max: 10
    },
    {
      key: "parameter_names",
      label: "Parameter Names",
      type: "dynamicTextList",
      defaultValue: [],
      placeholder: "Enter parameter name",
      countKey: "parameter_count",
    },
    {
      key: "test_cases",
      label: "Test Cases",
      type: "testCases",
      defaultValue: [],
      countKey: "parameter_count",
    },
  ] as const satisfies readonly PropertyDefinition[];
}

// Export the configuration instance
export const testsNodeConfig = new TestsNodeConfig().getConfig();
