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
    }
  ] as const satisfies readonly PropertyDefinition[];
}

// Export the configuration instance
export const groupNodeConfig = new GroupNodeConfig().getConfig();
