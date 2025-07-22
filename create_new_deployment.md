# How to create a new deployment type?

A new deployment type requires multiple components to be created in both the frontend and backend. You can do this list in practically any order, although for least issue I recommend following it in this order.

### 1. Add a new node in the frontend + any additional node types

- For reference, lets define the node folder as `(root)/frontend/src/app/components/agentBuilder/components/nodes/nodeTypes`.
- The base node every node is based upon is located at `(node_folder)/baseNode.tsx`.
- Create a new node in the `deploymentTypeNodes` folder, and additionally make a corresponding config file in the `configs` folder (use other nodes as reference). Make sure to define the following properties to it:
    - If starting from a copy of another node, make sure to change all names of node type-specific imports and exports to match your new node.
    - Define the node's ID in the `getNodeType()` function. Remember this ID and keep it consistent.
    - The `nodeType` static variable in the starting deployment node class must be set to `"start"`. Any additional node after should be defined as `"base"` (which it is by default).
    - For a starting node, you also want to define it's side menu data so it could be added with no complications. In `sideMenuInfo`, define it's category as `starter`, it's display name, and optionally give it an icon (must be located in the frontend's `public` folder) and description.
        - For reference, the category is what the side menu uses to get all nodes by group. This is necessary for later.
    - Redefine `renderNodeContent` to contain the node's name and any icon of your choosing to make it distinctive.
    - If your node will be connecting to another node, you may want to define handles, plus buttons, and connection configurations.
        - Define a `handle` object in the `renderNodeContent()` function. Define handle `type`s coming from previous node in the workflow as `"source"` and later define the handle it's going into as `"target"`. Additionally, give the `id` as something distinctive to use for later. You may also want to define `position` based on where the handle is relative to the node. Example:
            ```html
            <Handle
                type="source"
                position={Position.Right}
                id="chat-output"
                style={{ 
                    positioning stuff goes here
                }}
            />
            ```
        - For clarity purposes, add a text box near the handle to define where it connects to.
        - You may want to add a `PlusButton` object to add a connecting node to the previous from a list. If so, in your `(node_title)Props` interface, define `onAddNodeClick` and `edges` like so:
            ```ts
            export interface node_titleProps extends BaseNodeProps {
                onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void;
                edges?: Edge[];
                data?: ChatNodeData;
            }
            ```
            You also want to define it in the `create(node_title)Type` export:
            ```ts
            export const createnode_titleType = (
                onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void,
                edges: Edge[] = [],
                onDelete?: (nodeId: string) => void,
                onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void
            ) =>
                BaseNode.createNodeType(ChatNode, {
                    onAddNodeClick,
                    edges,
                    onDelete,
                    onSettings,
            });
            ```
            And finally you want to define at the top of the `renderNodeContent()` function as so:
            ```ts
            const { onAddNodeClick, id, edges = [] } = this.props;
            ```
            - Define the `handleID` as the `id` of your node's handle you want to connect it to. 
            - Set `objectType` for the category of the next possible node you want the user to see.
            - Example:
                ```html
                    <PlusButton
                        handleId="chat-output"
                        objectType="Agent"
                        nodeId={id}
                        edges={edges}
                        onAddNodeClick={onAddNodeClick}
                        position={{
                            positioning stuff goes here
                        }}
                    />
                ```
        - After you define your handles, you will need to define `handleConfigs` for each node, defining what it can connect to and it's limit. You define these through a Record object whith the key being the string of the handle you want to configure. You can then define `maxConnections` (-1 would mean unlimited) and `compatibleWith` (a list of handles it can connect to). Here's an example:
            ```ts
                public static handleConfigs: Record<string, HandleConfig> = {
                    "chat-output": {
                    maxConnections: 1,
                    compatibleWith: ["agent-input"],
                    },
                };
            ```
    - You can also define the properties the node needs to carry in order to be seen as a "valid" (otherwise the workflow won't deploy). By default, the baseNode defines this as true but you can configure it to only be valid if certain handles are connected to nodes like so:
        ```ts
            public checkNodeValidity(): boolean {
                const { edges = [], id } = this.props;

                // Check if chat-output handle is connected
                const chatOutputConnected = edges.some(
                (edge) => edge.source === id && edge.sourceHandle === "chat-output"
                );

                // Return true only if chat-output handle is connected
                return chatOutputConnected;
            }
        ```
    - The final important attribute is defining the `getNextNode(_nodes?: Node[])` function, which defines the behaviour of the workflows output JSON sent to the backend. All you need to do is define what handle is considered the "next node" in the workflow order. Every other handle would be considered an "attachment" otherwise. Here's an example:
        ```ts
        public getNextNode(_nodes?: Node[]): Node | null {
            if (!_nodes) return null;

            const { edges = [], id } = this.props;

            // Find the edge connected to the chat-output handle
            const outputEdge = edges.find(
            (edge) => edge.source === id && edge.sourceHandle === "chat-output"
            );

            if (!outputEdge) return null;

            // Find and return the target node
            const targetNode = _nodes.find((node) => node.id === outputEdge.target);
            return targetNode || null;
        }
        ```
- Once you're done creating the node, the next important thing to create is the configuration file for the node. This will be the options the user will get to alter in workflow creation and will be sent to the backend.
    - After confiuring the `nodeType` (keep consistent with your node class) and `displayName` variables, you can alter the actual properties in the `properties` variable. Here are the different variables you need to configure for each individual property:
        - `key`: the name of the variable in the workflow's output JSON.
        - `label`: the display name of the variable in the settings menu.
        - `type`: the data type of the setting. You can use an existing one or make your own. Here are some existing ones and their own properties to configure:
            - `"number"`: an integer value.
                - `min`: the minimum number possible.
                - `max`: the maximum number possible.
                - `rows`: the height of the input (keep at 1 for number).
            - `"checkbox"`: a boolean value.
            - `"text"`: a single line string value.
            - `"textarea"`: string value but you can change the amount of rows for the user.
                - `rows`: the height of the input.
            - `"select"`: a dropdown selection between different options.
                - `options`: a string list of possible options
            - `"range"`: a slider which returns an integer.
                - `min`: the minimum number possible.
                - `max`: the maximum number possible.
            - `"upload"`: a file upload currently only configured to work with the MCP node. Would need updating to be dynamic.
            - `"dynamicTextList"`: a list of any length of strings that the user can add, remove, and manipulate.
            - `"testCases"`: an object made to define test cases to be ran against code for the Tests node.
            - `"multipleChoiceQuestions"`: an object made to define multiple choice questions alongside their possible answers and the true answer. Made for the Questions node.
            - Although it's currently not the prettiest, you can define new settings in `(root)/src/app/components/agentBuilder/components/nodes/types.ts` and `(root)/src/app/components/agentBuilder/components/nodes/components/settingsMenu.tsx`, I'll make it a goal to provide a better solution for this though.
        - `defaultValue`: the value of the property at creation.
- Once you defined both the node class, the properties class, and clarified all inputs and exports, the only thing you need to do to make the existence of the node known to the system is import it in `(node_folder)/index.ts` and define it in `NODE_MODULES` with the node ID as the key. You can now use the workflow editor with your node (although no actual functionality once deployed).
- **Important:** Once you finished establishing the node, you will want to put it into a workflow and configure it as it would be done in your use case. Once configured, press `Ctrl + E` and open up the Console in Inspect Element, it should output the JSON that will be fed into the backend. This is necessary for referencing the different properties later, so copy this and put it in your favourite coding editor for later. Here's an example:
    ```json
    {
    "1": {
        "type": "chat",
        "config": {
        "label": "New chat",
        "saveMessages": true
        }
    },
    "2": {
        "type": "agent",
        "config": {
        "label": "New agent",
        "prompt": "{input}",
        "systemPrompt": "You are a helpful teaching assistant!",
        "retryOnFail": false
        },
        "attachments": {
        "llmModel": [
            {
            "type": "openAI",
            "config": {
                "label": "New openAI",
                "model": "gpt-4o-2024-08-06",
                "maximumOutputTokens": 1200,
                "topP": 0.5,
                "temperature": 0.6
            }
            }
        ]
        }
    },
    "3": {
        "type": "result",
        "config": {
        "label": "New result",
        "format": "text",
        "saveOutput": true
        }
    }
    }
    ```

### 2. Define the deployment type and it's necessary database models in the backend

- For reference, let's define the backend folder as `(root)/backend`.
- All of the models and enums will be contained in `backend/models`.
- Before anything, let's begin with defining the new type of deployment. In `backend/models/enums.py`, add an additional option in the `DeploymentType` enum class.
    ```python
    class DeploymentType(str, Enum):
        CHAT = "chat"
        CODE = "code"
        MCQ = "mcq" 
    ```
- You can then define the data types for SQLite required in `backend/models/database`. You will need to keep these in mind for later.

### 3. Modify the deployment service object and create a class for your deployment type's functionality

- For reference, let's define the deployment folder as `(root)/backend/services`.
- In `(deployment_folder)/deployment_service.py`, within the `__init__` function's switch/match, you want to define a case for your deployment starting node. For now just leave a placeholder as you will be defining your future deploymen object.
- In `(deployment_folder)/deployment_types`, you want to define the your deployment object and it's functionality here. For reference check other deployment types.
- Once established, go back to the `deployment_service.py` constructor and create your new deployment type object and pass in parameters using the frontend's output JSON as reference.
- For the main public functions of your deployment, add them to the deployment service class where it calls your specific deployment object. This will be used later when we define the API routes.

### 4. Define API routes for your service

- For reference, let's define the routes folder as `(root)/backend/api`.
- Create a new route file in `(routes_folder)/deployments`. Here you can define requests and their models for your deployment. Make sure to do proper permission checking. Look at the other route files for reference. Some important functions for validity checking are `validate_deployment_type()`,  `check_deployment_open()`, `ensure_deployment_loaded()`, and `db` related functions.
- Once defined, we can define these routes as functions for the frontend in `(root)/frontend/src/lib/deploymentAPIs`. Create a new file for your specific API and define the functions using the other ones for reference.

### 5. Creating the frontend for the new deployment type

- Once all your routes are set up, you can finally define the frontend component of your deployment's behaviour.
- Let's define the components folder as `(root)/frontend/src/app/components`.
- In `(components folder)/classes/ClassDeployments.tsx`, you want to define your deployment type so the deployment list successfully redirects the user to the page where your deployment is. Add a new key in `DEPLOYMENT_TYPES`, match the `name` property to the name of your deployment type in the backend, modify the `handleDeploymentAction` function to match your future frontend file for your deployment, and customize the button to your liking.
    - There are two additional features which you can add in some capacity to your deployment:
        - `handleStudentViewAction` defines a summary component for the deployment. If you'd like to create your own look at any of the `(components_folder)/classes/Student___Modal.tsx` files.
        - `hasGrading` which defines whether the deployment type has access to grading functionality. You can see an example of how this is used in the `StudentSubmissionsModal.tsx` code.
- You can then create your frontend for your deployment in `(components_folder)/deployments`, where you should create a folder specifically for your deployment and start working on it there.

This should be all the information required for you to make your own deployment. Shoot me a message if you require any further assistance or clarification!
