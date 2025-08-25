from typing import List, Dict, Any, Optional
from services.deployment_service import AgentDeployment
from services.behaviour_service import BehaviorDeployment
import uuid
import pprint
from enum import Enum
from sqlmodel import Session as DBSession

class VariableType(str, Enum):
    TEXT = "text"
    PDF = "pdf"
    GROUP = "group"
    LIST = "list"

class OriginType(str, Enum):
    STUDENT = "student"
    BEHAVIOUR = "behaviour"

class Origin(str, Enum):
    PROMPT = "prompt"
    GROUP = "group"
    THEME = "theme"
    LIVE_PRESENTATION = "live_presentation"
    GLOBAL = "global"

class DeploymentVariable:
    def __init__(self, name: str, origin_type: OriginType, origin: Origin, variable_type: VariableType, 
                 page: int = 0, index: int = 0, variable_value: Any = None):
        self.name = name
        self.origin_type = origin_type
        self.origin = origin
        self.variable_type = variable_type
        self.page = page
        self.index = index
        self.variable_value = variable_value
    
    def is_empty(self) -> bool:
        """Check if the variable value is empty/None"""
        return self.variable_value is None or (isinstance(self.variable_value, (list, dict, str)) and len(self.variable_value) == 0)
    
    def set_value(self, value: Any):
        """Set the variable value"""
        self.variable_value = value
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert variable to dictionary representation"""
        return {
            "name": self.name,
            "origin_type": self.origin_type.value,
            "origin": self.origin.value,
            "type": self.variable_type.value,
            "page": self.page,
            "index": self.index,
            "value": self.variable_value,
            "is_empty": self.is_empty()
        }
    
    def is_behavior_variable(self) -> bool:
        """Check if this is a behavior-generated variable"""
        return self.origin_type == OriginType.BEHAVIOUR
    
    def is_student_variable(self) -> bool:
        """Check if this is a student-generated variable"""
        return self.origin_type == OriginType.STUDENT

class Page:
    def __init__(self, page_number: str, page_config: Dict[str, Any], deployment_id: str, collection_name: Optional[str] = None):
        self.page_number = page_number
        self.input_type = page_config.get("input_type")
        self.input_id = page_config.get("input_id")
        self.input_node = page_config.get("input_node", False)
        self.output_type = page_config.get("output_type")
        self.output_id = page_config.get("output_id")
        self.output_node = page_config.get("output_node", False)
        self.nodes = page_config.get("nodes", {})
        
        # Reference to parent PageDeployment (will be set during initialization)
        self._page_deployment: Optional['PageDeployment'] = None
        
        # Create the AgentDeployment for this page
        page_deployment_id = f"{deployment_id}_page_{page_number}"
        page_workflow_config = {
            "pagesExist": False,
            "nodes": self.nodes
        }
        
        self.agent_deployment = AgentDeployment(
            deployment_id=page_deployment_id,
            config=page_workflow_config,
            collection_name=collection_name,
            coming_from_page=True
        )
        
        # Log the deployment ID for URL/session purposes
        print(f"🎯 PAGE {page_number} DEPLOYMENT IDs:")
        print(f"   📋 Page Container ID: {page_deployment_id}")
        print(f"   🚀 Agent Deployment ID: {self.agent_deployment.deployment_id}")
        print(f"   📝 Use Agent Deployment ID for student sessions/prompts")
    
    def set_page_deployment(self, page_deployment: 'PageDeployment'):
        """Set reference to parent PageDeployment for input resolution"""
        self._page_deployment = page_deployment
        
        print(f"🔍 set_page_deployment called for page {self.page_number}")
        print(f"🔍 Primary node type: {self.get_primary_node_type()}")
        print(f"🔍 Has input: {self.has_input()}")
        
        # If this is a live presentation page, set up data (auto-detection or explicit input)
        if self.get_primary_node_type() == "livePresentation":
            print(f"🔍 Setting up live presentation data for page {self.page_number}")
            self._set_live_presentation_input_data()
        else:
            print(f"🔍 Skipping live presentation setup for page {self.page_number} (not a live presentation)")
    
    def refresh_live_presentation_input_data(self):
        """Manually refresh input data for live presentation from current variables"""
        if self.get_primary_node_type() == "livePresentation":
            print(f"🔄 Manually refreshing input data for live presentation page {self.page_number}")
            self._set_live_presentation_input_data()
    
    def _set_live_presentation_input_data(self):
        """Set input data for live presentation from connected variables"""
        print(f"🔍 _set_live_presentation_input_data called for page {self.page_number}")
        live_presentation_service = self.agent_deployment.get_live_presentation_service()
        print(f"🔍 Live presentation service found: {live_presentation_service is not None}")
        
        if live_presentation_service:
            # Set parent page deployment reference for auto-detection
            live_presentation_service.set_parent_page_deployment(self._page_deployment)
            
            # If this page has explicit input configuration, use it
            if self.has_input():
                print(f"🔍 Page has input - type: {self.input_type}, id: {self.input_id}")
                input_data = self.resolve_input_source()
                print(f"🔍 Resolved input data: {input_data}")
                print(f"🔍 Input data type: {type(input_data)}")
                
                if input_data is not None:
                    live_presentation_service.set_input_variable_data(input_data)
                    print(f"🎤 Set explicit input data for live presentation page {self.page_number}")
                else:
                    print(f"⚠️ Explicit input data is None for live presentation page {self.page_number}")
            else:
                print(f"🔍 Page {self.page_number} has no explicit input - relying on auto-detection")
        else:
            print(f"⚠️ No live presentation service found for page {self.page_number}")
    
    def get_agent_deployment(self) -> AgentDeployment:
        return self.agent_deployment
    
    def has_input(self) -> bool:
        return self.input_type is not None and self.input_id is not None
    
    def has_output(self) -> bool:
        return self.output_type is not None and self.output_id is not None
    
    def is_input_from_variable(self) -> bool:
        return self.input_type == "variable"
    
    def is_input_from_page(self) -> bool:
        return self.input_type == "page"
    
    def is_output_to_variable(self) -> bool:
        return self.output_type == "variable"
    
    def is_output_to_behaviour(self) -> bool:
        return self.output_type == "behaviour"
    
    def has_group_input(self) -> bool:
        """Check if this page's input is from a GROUP type variable."""
        if not self.has_input() or not self.is_input_from_variable():
            return False
        if not self._page_deployment:
            return False
        variable = self._page_deployment.get_variable_by_id_or_name(self.input_id)
        result = variable and variable.variable_type == VariableType.GROUP
        return result

    def get_group_data_for_user(self, user_email: str) -> Optional[Dict[str, Any]]:
        """Get group data for a specific user if this page has group input."""
        if not self.has_group_input():
            return None
        
        group_data = self.resolve_input_source()
        if not group_data or not isinstance(group_data, dict):
            return None
        
        # Look for the user in the groups
        for group_name, members in group_data.items():
            if isinstance(members, list) and user_email in members:
                result = {
                    "group_name": group_name,
                    "group_members": members,
                    "member_count": len(members),
                    "all_groups": group_data
                }
                return result
        
        return None

    def resolve_input_source(self) -> Optional[Any]:
        """
        Resolve the input source for this page.
        Returns the actual data that should be used as input.
        """
        print(f"🔍 resolve_input_source called for page {self.page_number}")
        
        if not self.has_input() or not self._page_deployment:
            print(f"🔍 No input or no page deployment: has_input={self.has_input()}, page_deployment={self._page_deployment is not None}")
            return None
        
        if self.is_input_from_variable():
            print(f"🔍 Input from variable: {self.input_id}")
            # Get data from a variable
            variable = self._page_deployment.get_variable_by_id_or_name(self.input_id)
            print(f"🔍 Variable found: {variable is not None}")
            if variable:
                print(f"🔍 Variable value: {variable.variable_value}")
                print(f"🔍 Variable type: {variable.variable_type}")
                print(f"🔍 Variable is empty: {variable.is_empty()}")
            return variable.variable_value if variable else None
        
        elif self.is_input_from_page():
            print(f"🔍 Input from page: {self.input_id}")
            # Get output data from another page
            source_page = self._page_deployment.get_page_by_number(self.input_id)
            if source_page:
                return source_page.get_output_data()
            return None
        
        print(f"🔍 Unknown input type: {self.input_type}")
        return None
    
    def get_output_data(self) -> Optional[Any]:
        """
        Get the output data from this page based on its nodes and output configuration.
        This method should be implemented based on the page's node types.
        """
        if not self.has_output() or not self.output_node:
            return None
        
        # For now, delegate to PageDeployment to get the actual submission data
        if self._page_deployment:
            return self._page_deployment.get_page_output_data(self.page_number)
        
        return None
    
    def get_primary_node_type(self) -> Optional[str]:
        """Get the type of the primary/first node in this page"""
        if "1" in self.nodes:
            return self.nodes["1"].get("type")
        return None
    
    def cleanup(self):
        if hasattr(self.agent_deployment, 'cleanup'):
            self.agent_deployment.cleanup()

class Behavior:
    def __init__(self, behavior_number: str, behavior_config: Dict[str, Any], deployment_id: str):
        self.behavior_number = behavior_number
        self.input_type = behavior_config.get("input_type")
        self.input_id = behavior_config.get("input_id")
        self.input_node = behavior_config.get("input_node", False)
        self.output_type = behavior_config.get("output_type")
        self.output_id = behavior_config.get("output_id")
        self.output_node = behavior_config.get("output_node", False)
        self.nodes = behavior_config.get("nodes", {})
        
        # Reference to parent PageDeployment (will be set during initialization)
        self._page_deployment: Optional['PageDeployment'] = None
        
        # Create the BehaviorDeployment for this behavior
        behavior_deployment_id = f"{deployment_id}_behavior_{behavior_number}"
        
        # Extract the behavior configuration from the first node
        if "1" in self.nodes:
            behavior_type = self.nodes["1"]["type"]
            behavior_node_config = self.nodes["1"].get("config", {})
            
            self.behavior_deployment = BehaviorDeployment(
                behavior_id=behavior_deployment_id,
                config={
                    "type": behavior_type,
                    "config": behavior_node_config
                },
                deployment_id=deployment_id
            )
        else:
            raise ValueError(f"Behavior {behavior_number} has no nodes configured")
    
    def set_page_deployment(self, page_deployment: 'PageDeployment'):
        """Set reference to parent PageDeployment for input resolution"""
        self._page_deployment = page_deployment
    
    def get_behavior_deployment(self) -> BehaviorDeployment:
        return self.behavior_deployment
    
    def has_input(self) -> bool:
        return self.input_type is not None and self.input_id is not None
    
    def has_output(self) -> bool:
        # Check if explicitly configured with output
        if self.output_type is not None and self.output_id is not None:
            return True
        
        # For the new variable system: group and theme behaviors always output to variables
        behavior_type = self.get_behavior_deployment().get_behavior_type()
        if behavior_type in ["group", "themeCreator"]:
            print(f"🔍 BEHAVIOR HAS_OUTPUT: {behavior_type} behavior automatically has output (variable system)")
            return True
        
        return False
    
    def is_input_from_page(self) -> bool:
        return self.input_type == "page"
    
    def is_input_from_variable(self) -> bool:
        return self.input_type == "variable"
    
    def is_output_to_variable(self) -> bool:
        # Check if explicitly configured to output to variable
        if self.output_type == "variable":
            return True
        
        # For the new variable system: group and theme behaviors always output to variables
        behavior_type = self.get_behavior_deployment().get_behavior_type()
        if behavior_type in ["group", "themeCreator"]:
            print(f"🔍 BEHAVIOR IS_OUTPUT_TO_VARIABLE: {behavior_type} behavior automatically outputs to variable")
            return True
        
        return False
    
    def is_output_to_page(self) -> bool:
        return self.output_type == "page"
    
    def resolve_input_source(self) -> Optional[Any]:
        """
        Resolve the input source for this behavior.
        Returns the actual data that should be used as input.
        """
        print(f"🔍 BEHAVIOR DEBUG: resolve_input_source called for behavior {self.behavior_number}")
        print(f"🔍 BEHAVIOR DEBUG: has_input={self.has_input()}, page_deployment={self._page_deployment is not None}")
        print(f"🔍 BEHAVIOR DEBUG: input_type={self.input_type}, input_id={self.input_id}")
        
        if not self.has_input() or not self._page_deployment:
            print(f"🔍 BEHAVIOR DEBUG: Returning None due to no input or no page deployment")
            return None
        
        if self.is_input_from_page():
            print(f"🔍 BEHAVIOR DEBUG: Input from page: {self.input_id}")
            # Get output data from a page
            source_page = self._page_deployment.get_page_by_number(self.input_id)
            print(f"🔍 BEHAVIOR DEBUG: Source page found: {source_page is not None}")
            if source_page:
                output_data = source_page.get_output_data()
                print(f"🔍 BEHAVIOR DEBUG: Page output data type: {type(output_data)}")
                print(f"🔍 BEHAVIOR DEBUG: Page output data: {output_data}")
                return output_data
            return None
        
        elif self.is_input_from_variable():
            print(f"🔍 BEHAVIOR DEBUG: Input from variable: {self.input_id}")
            # Get data from a variable
            variable = self._page_deployment.get_variable_by_id_or_name(self.input_id)
            print(f"🔍 BEHAVIOR DEBUG: Variable found: {variable is not None}")
            if variable:
                print(f"🔍 BEHAVIOR DEBUG: Variable value type: {type(variable.variable_value)}")
                print(f"🔍 BEHAVIOR DEBUG: Variable value: {variable.variable_value}")
            return variable.variable_value if variable else None
        
        print(f"🔍 BEHAVIOR DEBUG: Unknown input type, returning None")
        return None
    
    def execute_with_resolved_input(self, progress_callback: Optional[callable] = None) -> Dict[str, Any]:
        """
        Execute the behavior with automatically resolved input data.
        """
        if self.has_input():
            input_data = self.resolve_input_source()
            if input_data is None:
                # Provide more specific error messages based on input type
                if self.is_input_from_page():
                    source_page = self._page_deployment.get_page_by_number(self.input_id) if self._page_deployment else None
                    if not source_page:
                        raise ValueError(
                            f"Behavior {self.behavior_number} is configured to get input from page {self.input_id}, "
                            f"but that page does not exist. Please check your workflow configuration."
                        )
                    else:
                        raise ValueError(
                            f"Behavior {self.behavior_number} is configured to get input from page {self.input_id}, "
                            f"but that page has no output data. Make sure the page has received student submissions "
                            f"or produces output data before running this behavior."
                        )
                elif self.is_input_from_variable():
                    variable = self._page_deployment.get_variable_by_id_or_name(self.input_id) if self._page_deployment else None
                    if not variable:
                        raise ValueError(
                            f"Behavior {self.behavior_number} is configured to get input from variable '{self.input_id}', "
                            f"but that variable does not exist. Please check your workflow configuration."
                        )
                    else:
                        raise ValueError(
                            f"Behavior {self.behavior_number} is configured to get input from variable '{self.input_id}', "
                            f"but that variable is empty (None). Make sure the variable is populated with data "
                            f"before running this behavior."
                        )
                else:
                    raise ValueError(
                        f"Behavior {self.behavior_number} could not resolve input from {self.input_type}:{self.input_id}. "
                        f"Please check your workflow configuration."
                    )
            return self.execute_with_input(input_data, progress_callback)
        else:
            # Execute without input if behavior doesn't require input
            return self.execute_with_input(None, progress_callback)
    
    def execute_with_input(self, input_data: Any, progress_callback: Optional[callable] = None) -> Dict[str, Any]:
        """Execute the behavior with the provided input data"""
        # Pass DB session if available for behaviors that require database/Qdrant access
        db_session = getattr(self._page_deployment, '_db_session', None)
        prompt_context = getattr(self._page_deployment, '_prompt_context', None)
        result = self.behavior_deployment.execute_behavior(input_data, db_session=db_session, prompt_context=prompt_context, progress_callback=progress_callback)
        
        # Handle output if behavior produces output
        print(f"🔍 BEHAVIOR OUTPUT CHECK: success={result.get('success')}, has_output={self.has_output()}")
        if self.has_output():
            print(f"🔍 BEHAVIOR OUTPUT CONFIG: output_type={self.output_type}, output_id={self.output_id}, is_output_to_variable={self.is_output_to_variable()}")
        
        if result.get("success") and self.has_output():
            if self.is_output_to_variable():
                print(f"🔍 CALLING _handle_variable_output for {self.get_behavior_deployment().get_behavior_type()}")
                self._handle_variable_output(result)
            else:
                print(f"🔍 BEHAVIOR NOT CONFIGURED TO OUTPUT TO VARIABLE: output_type={self.output_type}")
        
        return result
    
    def _handle_variable_output(self, result: Dict[str, Any]) -> None:
        """Handle writing behavior output to a variable"""
        if not self._page_deployment:
            return
        
        behavior_type = self.get_behavior_deployment().get_behavior_type()
        behavior_page_number = int(self.behavior_number)
        
        # Create the appropriate behavior variable based on behavior type
        if behavior_type == "group":
            variable_name = f"group_{behavior_page_number}"
            variable_origin = Origin.GROUP
            variable_type = VariableType.GROUP
            output_data = result.get("groups")
        elif behavior_type == "themeCreator":
            variable_name = f"theme_{behavior_page_number}"
            variable_origin = Origin.THEME
            variable_type = VariableType.LIST
            output_data = result.get("themes")
        else:
            # Fallback for unknown behavior types
            variable_name = f"{behavior_type}_{behavior_page_number}"
            variable_origin = Origin.GLOBAL
            variable_type = VariableType.LIST
            output_data = result.get("result") or result.get("output")
        
        if output_data is not None:
            try:
                # Create or update the behavior variable
                variable = self._page_deployment.create_behavior_variable(
                    name=variable_name,
                    origin=variable_origin,
                    variable_type=variable_type,
                    page=behavior_page_number,
                    index=0,
                    value=output_data
                )
                
                # Perform the assignment 
                success = self._page_deployment.set_variable_value(variable_name, output_data)
                print(f"🔍 VARIABLE ASSIGNMENT: {variable_name} = {success}")
                if success:
                    result["output_written_to_variable"] = variable_name
                    result["variable_assignment_success"] = True
                    
                    # Add additional metadata about the assignment
                    result["variable_info"] = {
                        "name": variable.name,
                        "origin_type": variable.origin_type.value,
                        "origin": variable.origin.value,
                        "type": variable.variable_type.value,
                        "page": variable.page,
                        "index": variable.index,
                        "was_empty_before": variable.is_empty()
                    }
                    
                    print(f"✅ Behavior output written to variable: {variable_name}")
                else:
                    result["warning"] = f"Could not persist output to variable '{variable_name}'"
                    result["variable_assignment_success"] = False
                
            except Exception as e:
                result["warning"] = f"Error creating behavior variable '{variable_name}': {str(e)}"
                result["variable_assignment_success"] = False
        else:
            result["warning"] = f"No output data found in behavior result to assign to variable"
            result["variable_assignment_success"] = False
    
    def cleanup(self):
        if hasattr(self.behavior_deployment, 'cleanup'):
            self.behavior_deployment.cleanup()

    def diagnose_input_configuration(self) -> Dict[str, Any]:
        """
        Diagnose the input configuration for this behavior to help with debugging.
        Returns a dictionary with diagnostic information.
        """
        diagnosis = {
            "behavior_number": self.behavior_number,
            "has_input_configured": self.has_input(),
            "input_type": self.input_type,
            "input_id": self.input_id,
            "input_source_exists": False,
            "input_data_available": False,
            "input_data_preview": None,
            "recommendations": []
        }
        
        if not self.has_input():
            diagnosis["recommendations"].append(
                "This behavior has no input configured. If it needs input data, "
                "connect it to a page or variable in your workflow."
            )
            return diagnosis
        
        if self.is_input_from_page():
            source_page = self._page_deployment.get_page_by_number(self.input_id) if self._page_deployment else None
            if source_page:
                diagnosis["input_source_exists"] = True
                output_data = source_page.get_output_data()
                if output_data is not None:
                    diagnosis["input_data_available"] = True
                    # Provide a preview of the data (first few items if it's a list)
                    if isinstance(output_data, list):
                        preview_count = min(3, len(output_data))
                        diagnosis["input_data_preview"] = {
                            "type": "list",
                            "length": len(output_data),
                            "first_items": output_data[:preview_count]
                        }
                    else:
                        diagnosis["input_data_preview"] = {
                            "type": type(output_data).__name__,
                            "value": str(output_data)[:200] + "..." if len(str(output_data)) > 200 else str(output_data)
                        }
                else:
                    diagnosis["recommendations"].append(
                        f"Page {self.input_id} exists but has no output data. "
                        "Make sure students have submitted to this page or the page produces output."
                    )
            else:
                diagnosis["recommendations"].append(
                    f"Page {self.input_id} does not exist. Check your workflow configuration."
                )
        
        elif self.is_input_from_variable():
            variable = self._page_deployment.get_variable_by_id_or_name(self.input_id) if self._page_deployment else None
            if variable:
                diagnosis["input_source_exists"] = True
                if variable.variable_value is not None:
                    diagnosis["input_data_available"] = True
                    diagnosis["input_data_preview"] = {
                        "type": type(variable.variable_value).__name__,
                        "value": str(variable.variable_value)[:200] + "..." if len(str(variable.variable_value)) > 200 else str(variable.variable_value)
                    }
                else:
                    diagnosis["recommendations"].append(
                        f"Variable '{self.input_id}' exists but is empty (None). "
                        "Make sure it's populated with data before running this behavior."
                    )
            else:
                diagnosis["recommendations"].append(
                    f"Variable '{self.input_id}' does not exist. Check your workflow configuration."
                )
        
        if not diagnosis["recommendations"]:
            diagnosis["recommendations"].append("Input configuration looks good!")
        
        return diagnosis

class PageDeployment:
    page_list: List[Page]
    behavior_list: List[Behavior]
    deployment_variables: List[DeploymentVariable]

    page_count: int
    behavior_count: int
    pages_accessible: int
    deployment_id: str

    def __init__(self, deployment_id: str, config: Dict[str, Any], collection_name: Optional[str] = None):
        if not config.get("pagesExist", False):
            raise ValueError("Pages are necessary in this workflow")
        
        self.deployment_id = deployment_id
        self.page_list = []
        self.behavior_list = []
        self.page_count = 0
        self.behavior_count = 0
        self.pages_accessible = -1
        
        # Initialize deployment variables from new array format
        self.deployment_variables = []
        self.variable_id_to_name_map = {}  # Map variable IDs to names
        
        variables = config.get("variables", [])
        print(f"🔍 Initializing variables from new format: {len(variables)} variables found")
        
        # Support both old dict format and new array format for backward compatibility
        if isinstance(variables, dict):
            print(f"🔍 Using legacy dict format for variables")
            for var_name, var_type_str in variables.items():
                var_type = VariableType(var_type_str)
                variable = DeploymentVariable(
                    name=var_name, 
                    origin_type=OriginType.BEHAVIOUR,  # Assume behavior for legacy
                    origin=Origin.GLOBAL,  # Default for legacy
                    variable_type=var_type
                )
                self.deployment_variables.append(variable)
        elif isinstance(variables, list):
            print(f"🔍 Using new array format for variables")
            for var_data in variables:
                if isinstance(var_data, dict):
                    try:
                        variable = DeploymentVariable(
                            name=var_data["name"],
                            origin_type=OriginType(var_data["origin_type"]),
                            origin=Origin(var_data["origin"]),
                            variable_type=VariableType(var_data["type"]),
                            page=var_data.get("page", 0),
                            index=var_data.get("index", 0)
                        )
                        self.deployment_variables.append(variable)
                        print(f"   ✅ Initialized variable: {variable.name} ({variable.origin_type.value}:{variable.origin.value})")
                    except (KeyError, ValueError) as e:
                        print(f"   ❌ Error initializing variable {var_data}: {e}")
                        continue
        
        # Build variable ID to name mapping from global variables in workflow data
        print(f"🔍 DEBUG: Config structure for variable mapping:")
        print(f"   Config keys: {list(config.keys()) if isinstance(config, dict) else 'Not a dict'}")
        
        # Check if we have the full workflow data with nodes
        workflow_nodes = config.get("nodes", {})
        if not workflow_nodes:
            # Try alternative structure - check if config itself contains nodes
            workflow_nodes = config
        
        print(f"🔍 DEBUG: Workflow nodes found: {list(workflow_nodes.keys()) if isinstance(workflow_nodes, dict) else 'Not a dict'}")
        
        # Look for global variables nodes to build ID to name mapping
        for node_id, node_data in workflow_nodes.items():
            if isinstance(node_data, dict):
                node_type = node_data.get("type")
                print(f"🔍 DEBUG: Found node {node_id} of type '{node_type}'")
                
                if node_type == "globalVariables":
                    node_config = node_data.get("config", {})
                    variables_list = node_config.get("variables", [])
                    print(f"🔍 DEBUG: Global variables node config: {node_config}")
                    print(f"🔍 DEBUG: Variables list: {variables_list}")
                    
                    for variable_info in variables_list:
                        if isinstance(variable_info, dict):
                            var_id = variable_info.get("id")
                            var_name = variable_info.get("name")
                            print(f"🔍 DEBUG: Processing variable - ID: '{var_id}', Name: '{var_name}'")
                            if var_id and var_name:
                                self.variable_id_to_name_map[var_id] = var_name
                                print(f"🔗 Mapped variable ID '{var_id}' to name '{var_name}'")
        
        print(f"🗂️ Built variable ID mapping: {self.variable_id_to_name_map}")
        
        pages = config.get("pages", {})
        
        # Sort pages by page number to maintain order
        sorted_pages = sorted(pages.items(), key=lambda x: int(x[0]))
        
        for page_number, page_config in sorted_pages:
            print("\n\n\nPage number: ", page_number)
            print("\n\n\nPage config: ")
            pprint.pprint(page_config)
            print("\n\n\n")
            
            # Create Page object
            page = Page(
                page_number=page_number,
                page_config=page_config,
                deployment_id=deployment_id,
                collection_name=collection_name
            )
            
            # Set the page deployment reference for input resolution
            page.set_page_deployment(self)
            
            self.page_list.append(page)
            self.page_count += 1

        # Process behaviors if they exist
        behaviors = config.get("behaviours", {})
        if behaviors:
            # Sort behaviors by behavior number to maintain order
            sorted_behaviors = sorted(behaviors.items(), key=lambda x: int(x[0]))
            
            for behavior_number, behavior_config in sorted_behaviors:
                print(f"\n\n\nBehavior number: {behavior_number}")
                print("\n\n\nBehavior config: ")
                pprint.pprint(behavior_config)
                print("\n\n\n")
                
                # Create Behavior object
                behavior = Behavior(
                    behavior_number=behavior_number,
                    behavior_config=behavior_config,
                    deployment_id=deployment_id
                )
                
                # Set the page deployment reference for input resolution
                behavior.set_page_deployment(self)
                
                self.behavior_list.append(behavior)
                self.behavior_count += 1
        
        # Print deployment summary for URL purposes
        self.print_deployment_summary()
    
    def print_deployment_summary(self):
        """Print summary of all deployment page IDs for URL purposes"""
        print(f"\n{'='*50}")
        print(f"PAGE DEPLOYMENT CREATED")
        print(f"{'='*50}")
        print(f"Main Deployment ID: {self.deployment_id}")
        print(f"Total Pages: {self.get_page_count()}")
        print(f"Total Behaviors: {self.get_behavior_count()}")
        print(f"Total Variables: {len(self.deployment_variables)}")
        print(f"Pages Accessible: {self.pages_accessible} (-1 = all)")
        print(f"\n🎯 STUDENT ACCESS IDs (use these for sessions/prompts):")
        for i, page in enumerate(self.page_list, 1):
            agent_deployment_id = page.get_agent_deployment().deployment_id
            page_container_id = f"{self.deployment_id}_page_{page.page_number}"
            page_type = page.get_primary_node_type() or "unknown"
            print(f"  Page {i} ({page_type}):")
            print(f"    🚀 STUDENT ACCESS ID: {agent_deployment_id}")
            print(f"    📋 Page Container ID: {page_container_id}")
            print(f"    ✅ Use the STUDENT ACCESS ID for prompt sessions!")
        
        if self.behavior_list:
            print(f"\nBehaviors:")
            for behavior in self.behavior_list:
                behavior_type = behavior.get_behavior_deployment().get_behavior_type()
                print(f"  Behavior {behavior.behavior_number}: {behavior_type}")
        
        if self.deployment_variables:
            print(f"\nVariables:")
            for var in self.deployment_variables:
                print(f"  {var.name}: {var.variable_type.value} (empty: {var.is_empty()})")
        
        print(f"{'='*50}\n")
        
        # Note: Variable restoration will happen after database session is set
        print(f"📝 PageDeployment initialization complete - variables will be restored when database session is set")
    
    def set_database_session(self, db_session):
        """Set the database session for variable persistence"""
        self._db_session = db_session
        print(f"💾 Database session set for PageDeployment variable persistence")
        
        # Now restore variables from database
        print(f"🔄 Attempting to restore variables from database...")
        self._restore_variables_from_database()
    
    def set_pages_accessible(self, pages_accessible: int):
        """Set the number of pages that are accessible to students"""
        if pages_accessible < -1 or pages_accessible == 0:
            raise ValueError("pages_accessible must be -1 (all pages) or a positive integer")
        if pages_accessible > self.get_page_count():
            raise ValueError(f"pages_accessible cannot exceed total page count ({self.get_page_count()})")
        self.pages_accessible = pages_accessible
    
    def get_pages_accessible(self) -> int:
        """Get the number of pages that are accessible to students"""
        return self.pages_accessible
    
    def get_variable_by_name(self, variable_name: str) -> Optional[DeploymentVariable]:
        """Get a deployment variable by name"""
        for variable in self.deployment_variables:
            if variable.name == variable_name:
                return variable
        return None
    
    def get_variable_by_id_or_name(self, variable_id_or_name: str) -> Optional[DeploymentVariable]:
        """Get a deployment variable by ID or name (supports both for compatibility)"""
        # First try to resolve the ID to a name
        variable_name = self.variable_id_to_name_map.get(variable_id_or_name)
        if variable_name:
            print(f"🔗 Resolved variable ID '{variable_id_or_name}' to name '{variable_name}'")
            return self.get_variable_by_name(variable_name)
        
        # If not found in ID mapping, try as a direct name
        variable = self.get_variable_by_name(variable_id_or_name)
        if variable:
            print(f"🔍 Found variable by direct name lookup: '{variable_id_or_name}'")
            return variable
        
        print(f"❌ Variable '{variable_id_or_name}' not found by ID or name")
        print(f"🔍 Available ID mappings: {list(self.variable_id_to_name_map.keys())}")
        print(f"🔍 Available variable names: {[var.name for var in self.deployment_variables]}")
        return None
    
    def rebuild_variable_id_mapping(self, workflow_data: Optional[Dict[str, Any]] = None):
        """Rebuild variable ID to name mapping from workflow data"""
        print(f"🔄 Rebuilding variable ID mapping...")
        self.variable_id_to_name_map.clear()
        
        if not workflow_data:
            print(f"⚠️ No workflow data provided for mapping rebuild")
            return
        
        print(f"🔍 Rebuild DEBUG: Workflow data keys: {list(workflow_data.keys()) if isinstance(workflow_data, dict) else 'Not a dict'}")
        
        # Debug the actual structure we received
        print(f"🔍 Rebuild DEBUG: Full workflow data structure:")
        for key, value in workflow_data.items():
            print(f"   {key}: {type(value)} = {value}")
        
        # The structure seems to be different - let's look for the actual variable data
        # Try to access the variables section directly
        variables_section = workflow_data.get('variables', {})
        print(f"🔍 Rebuild DEBUG: Variables section: {variables_section}")
        
        # Look for global variables nodes to build ID to name mapping
        found_variables = False
        
        # Check if we have the nodes list structure
        nodes_list = workflow_data.get('nodes', [])
        if isinstance(nodes_list, list):
            print(f"🔍 Rebuild DEBUG: Searching through {len(nodes_list)} nodes for globalVariables")
            
            for node in nodes_list:
                if isinstance(node, dict):
                    node_id = node.get("id")
                    node_type = node.get("type")
                    print(f"🔍 Rebuild DEBUG: Found node {node_id} of type '{node_type}'")
                    
                    if node_type == "globalVariables":
                        found_variables = True
                        node_data = node.get("data", {})
                        variables_list = node_data.get("variables", [])
                        print(f"🔍 Rebuild DEBUG: Global variables node data: {node_data}")
                        print(f"🔍 Rebuild DEBUG: Variables list: {variables_list}")
                        
                        for variable_info in variables_list:
                            if isinstance(variable_info, dict):
                                var_id = variable_info.get("id")
                                var_name = variable_info.get("name")
                                print(f"🔍 Rebuild DEBUG: Processing variable - ID: '{var_id}', Name: '{var_name}'")
                                if var_id and var_name:
                                    self.variable_id_to_name_map[var_id] = var_name
                                    print(f"🔗 Mapped variable ID '{var_id}' to name '{var_name}'")
        
        if not found_variables:
            print(f"❌ No globalVariables nodes found in workflow data")
            print(f"🔍 Available keys in workflow data: {list(workflow_data.keys())}")
            
            # Try alternative approach - maybe the workflow data doesn't have nodes
            # Let's see if we can get the original workflow data instead
            print(f"🔍 This workflow data structure doesn't contain nodes - we need the original frontend workflow data")
        
        print(f"🗂️ Rebuilt variable ID mapping: {self.variable_id_to_name_map}")
    
    def _save_variable_to_database(self, variable: "DeploymentVariable"):
        """Save a deployment variable to the database"""
        try:
            if not hasattr(self, '_db_session') or not self._db_session:
                print(f"⚠️ No database session available for saving variable '{variable.name}'")
                return
            
            from models.database.page_models import PageDeploymentState, PageDeploymentVariable
            from sqlmodel import select
            
            # Get or create the page deployment state
            page_deployment_state = self._db_session.exec(
                select(PageDeploymentState).where(
                    PageDeploymentState.deployment_id == self.deployment_id,
                    PageDeploymentState.is_active == True
                )
            ).first()
            
            if not page_deployment_state:
                # Create page deployment state if it doesn't exist
                page_deployment_state = PageDeploymentState(
                    deployment_id=self.deployment_id,
                    pages_accessible=self.pages_accessible
                )
                self._db_session.add(page_deployment_state)
                self._db_session.commit()
                self._db_session.refresh(page_deployment_state)
            
            # Get or create the variable record
            variable_record = self._db_session.exec(
                select(PageDeploymentVariable).where(
                    PageDeploymentVariable.page_deployment_id == page_deployment_state.id,
                    PageDeploymentVariable.name == variable.name,
                    PageDeploymentVariable.is_active == True
                )
            ).first()
            
            if not variable_record:
                # Create new variable record
                variable_record = PageDeploymentVariable(
                    page_deployment_id=page_deployment_state.id,
                    name=variable.name,
                    origin_type=variable.origin_type.value,
                    origin=variable.origin.value,
                    variable_type=variable.variable_type.value,
                    page=variable.page,
                    index=variable.index,
                    variable_value=variable.variable_value
                )
                self._db_session.add(variable_record)
                print(f"💾 Created new variable record for '{variable.name}'")
            else:
                # Update existing variable record
                variable_record.variable_value = variable.variable_value
                from datetime import datetime
                variable_record.updated_at = datetime.now()
                self._db_session.add(variable_record)
                print(f"💾 Updated variable record for '{variable.name}'")
            
            self._db_session.commit()
            print(f"✅ Variable '{variable.name}' saved to database successfully")
            
        except Exception as e:
            print(f"❌ Error saving variable '{variable.name}' to database: {e}")
            if self._db_session:
                self._db_session.rollback()
    
    def _restore_variables_from_database(self):
        """Restore all variables from the database"""
        try:
            if not hasattr(self, '_db_session') or not self._db_session:
                print(f"⚠️ No database session available for restoring variables")
                return
            
            from models.database.page_models import PageDeploymentState, PageDeploymentVariable
            from sqlmodel import select
            
            # Get the page deployment state
            page_deployment_state = self._db_session.exec(
                select(PageDeploymentState).where(
                    PageDeploymentState.deployment_id == self.deployment_id,
                    PageDeploymentState.is_active == True
                )
            ).first()
            
            if not page_deployment_state:
                print(f"🔍 No page deployment state found for '{self.deployment_id}' - no variables to restore")
                return
            
            # Get all variable records
            variable_records = self._db_session.exec(
                select(PageDeploymentVariable).where(
                    PageDeploymentVariable.page_deployment_id == page_deployment_state.id,
                    PageDeploymentVariable.is_active == True
                )
            ).all()
            
            if not variable_records:
                print(f"🔍 No variables found in database for '{self.deployment_id}'")
                return
            
            print(f"🔄 Restoring {len(variable_records)} variables from database...")
            restored_count = 0
            
            for record in variable_records:
                try:
                    # Convert database record back to DeploymentVariable
                    # Note: OriginType, Origin, VariableType are already imported at the top of this file
                    
                    # Create the variable
                    variable = DeploymentVariable(
                        name=record.name,
                        origin_type=OriginType(record.origin_type),
                        origin=Origin(record.origin),
                        variable_type=VariableType(record.variable_type),
                        page=record.page,
                        index=record.index
                    )
                    
                    # Set the value if it exists
                    if record.variable_value is not None:
                        variable.set_value(record.variable_value)
                    
                    # Find existing variable or add new one
                    existing_var = self.get_variable_by_name(record.name)
                    if existing_var:
                        # Update existing variable
                        existing_var.set_value(record.variable_value)
                        print(f"   ✅ Updated existing variable '{record.name}'")
                    else:
                        # Add new variable to list
                        self.deployment_variables.append(variable)
                        print(f"   ✅ Added new variable '{record.name}'")
                    restored_count += 1
                    
                    print(f"   ✅ Restored '{record.name}' ({record.origin}:{record.variable_type}) with {len(record.variable_value) if isinstance(record.variable_value, (list, dict)) else 'non-container'} items")
                    
                except Exception as e:
                    print(f"   ❌ Error restoring variable '{record.name}': {e}")
            
            print(f"✅ Successfully restored {restored_count}/{len(variable_records)} variables from database")
            
        except Exception as e:
            print(f"❌ Error restoring variables from database: {e}")
    
    def set_variable_value(self, variable_name: str, value: Any) -> bool:
        """Set the value of a deployment variable and persist to database"""
        print(f"🔍 SET_VARIABLE_VALUE called: '{variable_name}' = {type(value)} with {len(value) if hasattr(value, '__len__') else 'no length'}")
        variable = self.get_variable_by_name(variable_name)
        if variable:
            print(f"🔍 Variable '{variable_name}' found, setting value...")
            print(f"🔍 Before set: variable.is_empty() = {variable.is_empty()}")
            variable.set_value(value)
            print(f"🔍 After set: variable.is_empty() = {variable.is_empty()}")
            print(f"🔍 Variable value type: {type(variable.variable_value)}")
            print(f"🔍 Variable value preview: {str(variable.variable_value)[:100] if variable.variable_value else 'None'}")
            
            # Persist to database if we have a session
            if hasattr(self, '_db_session') and self._db_session:
                print(f"🔍 Persisting variable '{variable_name}' to database...")
                self._save_variable_to_database(variable)
            else:
                print(f"⚠️ No database session available for persisting variable '{variable_name}'")
            return True
        else:
            print(f"❌ Variable '{variable_name}' not found in deployment variables")
            print(f"🔍 Available variables: {[var.name for var in self.deployment_variables]}")
            return False
    
    def is_page_accessible(self, page_number: int) -> bool:
        """Check if a specific page number is accessible"""
        print(f"🔍 Checking accessibility for page {page_number}")
        
        # Check if page exists
        if page_number > len(self.page_list) or page_number < 1:
            print(f"❌ Page {page_number} does not exist (total pages: {len(self.page_list)})")
            return False
        
        # First check basic accessibility (if pages_accessible is -1, all pages are accessible)
        if self.pages_accessible != -1 and page_number > self.pages_accessible:
            print(f"❌ Page {page_number} not accessible due to pages_accessible limit ({self.pages_accessible})")
            return False
        
        # Check if page depends on variables that are empty
        page = self.page_list[page_number - 1]  # Convert to 0-based index
        print(f"🔍 Page {page_number} has input: {page.has_input()}")
        print(f"🔍 Page {page_number} is input from variable: {page.is_input_from_variable() if page.has_input() else 'N/A'}")
        
        if page.is_input_from_variable() and page.input_id:
            print(f"🔍 Page {page_number} depends on variable: '{page.input_id}'")
            
            # Use get_variable_by_id_or_name to handle both IDs and names
            variable = self.get_variable_by_id_or_name(page.input_id)
            
            if variable:
                is_empty = variable.is_empty()
                print(f"🔍 Variable '{page.input_id}' found - empty: {is_empty}")
                print(f"🔍 Variable value type: {type(variable.variable_value)}")
                print(f"🔍 Variable value preview: {str(variable.variable_value)[:100] if variable.variable_value else 'None'}")
                
                if is_empty:
                    print(f"❌ Page {page_number} not accessible - required variable '{page.input_id}' is empty")
                    return False
                else:
                    print(f"✅ Page {page_number} variable dependency satisfied")
            else:
                print(f"❌ Page {page_number} depends on variable '{page.input_id}' which was not found")
                return False
        else:
            print(f"🔍 Page {page_number} has no variable dependencies")
        
        print(f"✅ Page {page_number} is accessible")
        return True

    def get_deployment_list(self) -> List[AgentDeployment]:
        """Get list of AgentDeployment objects from all pages"""
        return [page.get_agent_deployment() for page in self.page_list]
    
    def get_page_list(self) -> List[Page]:
        """Get list of Page objects"""
        return self.page_list
    
    def get_page_by_number(self, page_number: str) -> Optional[Page]:
        """Get Page object by page number"""
        # Print deployment page IDs for URL purposes
        print(f"\n=== PAGE NUMBER ACCESS ===")
        print(f"Main Deployment ID: {self.deployment_id}")
        print(f"Looking for Page Number: {page_number}")
        print(f"All Student Access IDs:")
        for i, page in enumerate(self.page_list, 1):
            agent_deployment_id = page.get_agent_deployment().deployment_id
            accessibility = "✓ Accessible" if self.is_page_accessible(i) else "✗ Not Accessible"
            current = "← CURRENT" if page.page_number == page_number else ""
            print(f"  Page {i} (#{page.page_number}): 🚀 {agent_deployment_id} ({accessibility}) {current}")
        print(f"=========================\n")
        
        for page in self.page_list:
            if page.page_number == page_number:
                return page
        return None
    
    def get_deployment_by_index(self, index: int) -> AgentDeployment:
        """Get AgentDeployment by page index with accessibility checks"""
        page_number = index + 1
        if not self.is_page_accessible(page_number):
            if page_number > self.pages_accessible and self.pages_accessible != -1:
                raise ValueError(f"Page {page_number} is not yet accessible. You'll need to wait until your instructor allows access to this page. Currently accessible pages: 1-{self.pages_accessible}")
            else:
                # Check if it's due to empty variable dependency
                page = self.page_list[index]
                if page.is_input_from_variable() and page.input_id:
                    variable = self.get_variable_by_id_or_name(page.input_id)
                    if variable and variable.is_empty():
                        raise ValueError(f"Page {page_number} is not yet accessible. This page depends on the variable '{page.input_id}' which has not been populated yet.")
                raise ValueError(f"Page {page_number} is not yet accessible.")
        
        # Print deployment page IDs for URL purposes
        print(f"\n=== PAGE DEPLOYMENT ACCESS ===")
        print(f"Main Deployment ID: {self.deployment_id}")
        print(f"Accessing Page {page_number} (index {index})")
        print(f"All Student Access IDs:")
        for i, page in enumerate(self.page_list, 1):
            agent_deployment_id = page.get_agent_deployment().deployment_id
            accessibility = "✓ Accessible" if self.is_page_accessible(i) else "✗ Not Accessible"
            current = "← ACCESSING THIS" if i == page_number else ""
            print(f"  Page {i}: 🚀 {agent_deployment_id} ({accessibility}) {current}")
        print(f"==============================\n")
        
        return self.page_list[index].get_agent_deployment()
    
    def get_page_by_index(self, index: int) -> Page:
        """Get Page object by index"""
        page_number = index + 1
        if not self.is_page_accessible(page_number):
            if page_number > self.pages_accessible and self.pages_accessible != -1:
                raise ValueError(f"Page {page_number} is not yet accessible. You'll need to wait until your instructor allows access to this page. Currently accessible pages: 1-{self.pages_accessible}")
            else:
                # Check if it's due to empty variable dependency
                page = self.page_list[index]
                if page.is_input_from_variable() and page.input_id:
                    variable = self.get_variable_by_id_or_name(page.input_id)
                    if variable and variable.is_empty():
                        raise ValueError(f"Page {page_number} is not yet accessible. This page depends on the variable '{page.input_id}' which has not been populated yet.")
                raise ValueError(f"Page {page_number} is not yet accessible.")
        
        # Print deployment page IDs for URL purposes
        print(f"\n=== PAGE OBJECT ACCESS ===")
        print(f"Main Deployment ID: {self.deployment_id}")
        print(f"Accessing Page {page_number} (index {index})")
        print(f"All Student Access IDs:")
        for i, page in enumerate(self.page_list, 1):
            agent_deployment_id = page.get_agent_deployment().deployment_id
            accessibility = "✓ Accessible" if self.is_page_accessible(i) else "✗ Not Accessible"
            current = "← ACCESSING THIS" if i == page_number else ""
            print(f"  Page {i}: 🚀 {agent_deployment_id} ({accessibility}) {current}")
        print(f"=========================\n")
        
        return self.page_list[index]

    def get_page_count(self) -> int:
        return len(self.page_list)

    def get_deployment_by_id(self, deployment_id: str) -> AgentDeployment:
        for page in self.page_list:
            if page.get_agent_deployment().deployment_id == deployment_id:
                return page.get_agent_deployment()
        return None
    
    def get_page_by_deployment_id(self, deployment_id: str) -> Page:
        """Get Page object by deployment ID"""
        for page in self.page_list:
            if page.get_agent_deployment().deployment_id == deployment_id:
                return page
        return None
    
    def get_primary_deployment_type(self):
        """Get the deployment type from the first page (all pages should have same type)"""
        if self.page_list:
            return self.page_list[0].get_agent_deployment().get_deployment_type()
        return None
    
    def get_contains_chat(self) -> bool:
        """Check if any page contains chat functionality"""
        return any(page.get_agent_deployment().get_contains_chat() for page in self.page_list)
    
    def get_deployment_variables(self) -> List[DeploymentVariable]:
        """Get all deployment variables"""
        return self.deployment_variables

    def get_behavior_list(self) -> List[Behavior]:
        """Get list of Behavior objects"""
        return self.behavior_list
    
    def get_behavior_count(self) -> int:
        """Get the number of behaviors"""
        return len(self.behavior_list)
    
    def get_behavior_by_number(self, behavior_number: str) -> Optional[Behavior]:
        """Get behavior by its number/ID"""
        for behavior in self.behavior_list:
            if behavior.behavior_number == behavior_number:
                return behavior
        return None
    
    def execute_behavior(self, behavior_number: str, input_data: Any = None) -> Dict[str, Any]:
        """
        DEPRECATED: Use execute_behavior_with_resolved_input instead.
        Execute a specific behavior with optional input data.
        """
        print(f"WARNING: execute_behavior is deprecated. Use execute_behavior_with_resolved_input instead.")
        behavior = self.get_behavior_by_number(behavior_number)
        if not behavior:
            raise ValueError(f"Behavior {behavior_number} not found")
        
        # If behavior expects input, validate and prepare it
        if behavior.has_input() and input_data is None:
            raise ValueError(f"Behavior {behavior_number} requires input data")
        
        # Execute the behavior using the new method
        return behavior.execute_with_input(input_data)
    
    def execute_behavior_with_resolved_input(self, behavior_number: str, executed_by_user_id: Optional[int] = None, progress_callback: Optional[callable] = None) -> Dict[str, Any]:
        """
        Execute a behavior with automatically resolved input data.
        This is the main method for instructor-triggered behavior execution.
        """
        behavior = self.get_behavior_by_number(behavior_number)
        if not behavior:
            raise ValueError(f"Behavior {behavior_number} not found")
        
        # Record execution start time
        import time
        start_time = time.time()
        
        # Capture input data for potential saving (especially for group behaviors)
        captured_input_data = None
        behavior_type = behavior.get_behavior_deployment().get_behavior_type()
        
        try:
            # Capture the input data before execution
            if behavior.has_input():
                captured_input_data = behavior.resolve_input_source()
            
            result = behavior.execute_with_resolved_input(progress_callback)
            execution_time = time.time() - start_time
            
            # Save execution to database if we have a session and user ID
            if hasattr(self, '_db_session') and self._db_session and executed_by_user_id:
                import asyncio
                try:
                    # For theme creator behaviors, log what we're saving
                    if behavior_type == "themeCreator":
                        print(f"🎯 PREPARING TO SAVE THEME CREATOR EXECUTION:")
                        print(f"   Behavior: {behavior_number}")
                        print(f"   Success: {result.get('success', False)}")
                        print(f"   Has themes: {'themes' in result}")
                        print(f"   Theme count: {len(result.get('themes', []))}")
                        print(f"   Student data count: {len(captured_input_data) if captured_input_data else 0}")
                    
                    # For group behaviors, log what we're saving
                    if behavior_type == "group":
                        print(f"🎯 PREPARING TO SAVE GROUP EXECUTION:")
                        print(f"   Behavior: {behavior_number}")
                        print(f"   Success: {result.get('success', False)}")
                        print(f"   Has groups: {'groups' in result}")
                        print(f"   Has explanations: {'explanations' in result}")
                    
                    try:
                        # Try to get existing event loop
                        loop = asyncio.get_running_loop()
                        # Create and await the task in the existing loop
                        task = loop.create_task(self._save_behavior_execution(
                            behavior_number=behavior_number,
                            behavior_type=behavior_type,
                            executed_by_user_id=executed_by_user_id,
                            success=result.get("success", False),
                            execution_time_seconds=execution_time,
                            execution_result=result,
                            error_message=result.get("error") if not result.get("success", False) else None,
                            student_data=captured_input_data if behavior_type in ["group", "themeCreator"] else None
                        ))
                        print(f"✅ Scheduled {behavior_type} behavior save task")
                    except RuntimeError:
                        # No running event loop, create a new one and run the coroutine
                        print(f"🔄 No running event loop, creating new one for {behavior_type} save...")
                        asyncio.run(self._save_behavior_execution(
                            behavior_number=behavior_number,
                            behavior_type=behavior_type,
                            executed_by_user_id=executed_by_user_id,
                            success=result.get("success", False),
                            execution_time_seconds=execution_time,
                            execution_result=result,
                            error_message=result.get("error") if not result.get("success", False) else None,
                            student_data=captured_input_data if behavior_type in ["group", "themeCreator"] else None
                        ))
                        print(f"✅ Completed synchronous {behavior_type} behavior save")
                        
                except Exception as save_error:
                    # Handle any saving errors gracefully
                    print(f"⚠️  Failed to save {behavior_type} behavior execution: {save_error}")
                    print(f"   Behavior will still return results, but execution won't be saved to database")
            
            return result
            
        except Exception as e:
            execution_time = time.time() - start_time
            error_result = {
                "success": False,
                "error": str(e),
                "behavior_number": behavior_number
            }
            
            # Save failed execution to database
            if hasattr(self, '_db_session') and self._db_session and executed_by_user_id:
                import asyncio
                try:
                    loop = asyncio.get_event_loop()
                    loop.create_task(self._save_behavior_execution(
                        behavior_number=behavior_number,
                        behavior_type=behavior_type,
                        executed_by_user_id=executed_by_user_id,
                        success=False,
                        execution_time_seconds=execution_time,
                        execution_result=error_result,
                        error_message=str(e),
                        student_data=None  # No data for failed executions
                    ))
                except RuntimeError:
                    pass
            
            raise
    
    def validate_variable_assignment(self, variable_name: str, data: Any, behavior_type: str) -> Dict[str, Any]:
        """
        Validate that data can be assigned to a specific variable.
        
        Args:
            variable_name: Name of the variable to assign to
            data: Data to be assigned
            behavior_type: Type of behavior producing the data
            
        Returns:
            Dictionary with validation results
        """
        variable = self.get_variable_by_name(variable_name)
        if not variable:
            return {
                "valid": False,
                "error": f"Variable '{variable_name}' not found"
            }
        
        # Type-specific validation
        if variable.variable_type == VariableType.GROUP:
            if behavior_type == "group":
                # For group variables, expect dictionary with group data
                if isinstance(data, dict):
                    return {"valid": True}
                else:
                    return {
                        "valid": False,
                        "error": f"Group variable '{variable_name}' expects dictionary data, got {type(data)}"
                    }
            else:
                return {
                    "valid": False,
                    "error": f"Variable '{variable_name}' of type GROUP can only receive data from group behaviors"
                }
        
        elif variable.variable_type == VariableType.TEXT:
            # For text variables, expect string data
            if isinstance(data, str):
                return {"valid": True}
            else:
                return {
                    "valid": False,
                    "error": f"Text variable '{variable_name}' expects string data, got {type(data)}"
                }
        
        elif variable.variable_type == VariableType.LIST:
            # For list variables, expect list data from theme creators or other list-producing behaviors
            if isinstance(data, list):
                return {"valid": True}
            else:
                return {
                    "valid": False,
                    "error": f"List variable '{variable_name}' expects list data, got {type(data)}"
                }
        
        return {"valid": True}
    
    def get_variable_summary(self, behavior_variables_only: bool = False) -> Dict[str, Any]:
        """Get a summary of all variables and their current state"""
        print(f"🔍 GET_VARIABLE_SUMMARY called: behavior_variables_only={behavior_variables_only}")
        print(f"🔍 Total deployment variables: {len(self.deployment_variables)}")
        
        variables_to_include = self.deployment_variables
        
        if behavior_variables_only:
            variables_to_include = [var for var in self.deployment_variables if var.is_behavior_variable()]
            print(f"🔍 Filtered to behavior variables: {len(variables_to_include)}")
        
        summary = {
            "total_variables": len(variables_to_include),
            "behavior_variables_only": behavior_variables_only,
            "variables": []
        }
        
        for variable in variables_to_include:
            is_empty = variable.is_empty()
            print(f"🔍 Variable '{variable.name}': is_empty={is_empty}, value_type={type(variable.variable_value)}, value={str(variable.variable_value)[:50] if variable.variable_value else 'None'}")
            
            var_info = {
                "name": variable.name,
                "origin_type": variable.origin_type.value,
                "origin": variable.origin.value,
                "type": variable.variable_type.value,
                "page": variable.page,
                "index": variable.index,
                "is_empty": is_empty,
                "has_value": not is_empty,
                "value_type": type(variable.variable_value).__name__ if variable.variable_value is not None else None
            }
            
            # Add safe preview of value (don't expose sensitive data)
            if variable.variable_value is not None:
                if isinstance(variable.variable_value, dict):
                    var_info["value_preview"] = f"Dictionary with {len(variable.variable_value)} keys"
                elif isinstance(variable.variable_value, list):
                    var_info["value_preview"] = f"List with {len(variable.variable_value)} items"
                elif isinstance(variable.variable_value, str):
                    var_info["value_preview"] = variable.variable_value[:50] + "..." if len(variable.variable_value) > 50 else variable.variable_value
                else:
                    var_info["value_preview"] = str(variable.variable_value)[:50]
            
            summary["variables"].append(var_info)
        
        return summary
    
    def get_behavior_variables(self) -> List[DeploymentVariable]:
        """Get only behavior-generated variables"""
        return [var for var in self.deployment_variables if var.is_behavior_variable()]
    
    def get_student_variables(self) -> List[DeploymentVariable]:
        """Get only student-generated variables"""  
        return [var for var in self.deployment_variables if var.is_student_variable()]
    
    def get_variables_by_type(self, variable_type: VariableType) -> List[DeploymentVariable]:
        """Get variables by their type"""
        return [var for var in self.deployment_variables if var.variable_type == variable_type]
    
    def get_variables_by_origin(self, origin: Origin) -> List[DeploymentVariable]:
        """Get variables by their origin"""
        return [var for var in self.deployment_variables if var.origin == origin]
    
    def create_behavior_variable(self, name: str, origin: Origin, variable_type: VariableType, 
                                page: int, index: int = 0, value: Any = None) -> DeploymentVariable:
        """Create a new behavior variable and add it to the deployment"""
        variable = DeploymentVariable(
            name=name,
            origin_type=OriginType.BEHAVIOUR,
            origin=origin,
            variable_type=variable_type,
            page=page,
            index=index,
            variable_value=value
        )
        
        # Check if variable already exists
        existing = self.get_variable_by_name(name)
        if existing:
            # Update existing variable
            existing.variable_value = value
            print(f"🔄 Updated existing behavior variable: {name}")
            return existing
        else:
            # Add new variable
            self.deployment_variables.append(variable)
            print(f"✅ Created new behavior variable: {name} ({origin.value}:{variable_type.value})")
            return variable
    
    def get_page_data_for_behavior_input(self, page_id: str) -> List[Dict[str, Any]]:
        """
        Get data from a page to use as input for a behavior.
        This method should be implemented based on how page data is structured.
        For now, it's a placeholder that would need to be customized based on 
        how submission data is stored and retrieved.
        """
        # TODO: Implement based on how page submission data is stored
        # This would typically query the database for submissions to the specified page
        # and format them appropriately for behavior input
        
        # Placeholder implementation
        print(f"TODO: Implement get_page_data_for_behavior_input for page {page_id}")
        return []
    
    def execute_behavior_with_page_input(self, behavior_number: str, input_page_id: str) -> Dict[str, Any]:
        """Execute a behavior using data from a specific page as input"""
        behavior = self.get_behavior_by_number(behavior_number)
        if not behavior:
            raise ValueError(f"Behavior {behavior_number} not found")
        
        if not behavior.is_input_from_page():
            raise ValueError(f"Behavior {behavior_number} does not expect page input")
        
        # Get data from the specified page
        input_data = self.get_page_data_for_behavior_input(input_page_id)
        
        # Execute the behavior with the page data
        return self.execute_behavior(behavior_number, input_data)
    
    def cleanup_all_behaviors(self):
        """Cleanup all behavior deployments"""
        for behavior in self.behavior_list:
            behavior.cleanup()
    
    def cleanup_all_pages(self):
        """Cleanup all page deployments"""
        for page in self.page_list:
            page.cleanup()
        
        # Also cleanup behaviors
        self.cleanup_all_behaviors()
    
    def get_page_deployment_ids(self) -> List[str]:
        """Get all page deployment IDs"""
        return [page.get_agent_deployment().deployment_id for page in self.page_list]
    
    def get_page_output_data(self, page_number: str) -> Optional[Any]:
        """
        Get the output data for a specific page.
        This method retrieves actual data based on the page's node types and configuration.
        """
        print(f"🔍 PAGE OUTPUT DEBUG: get_page_output_data called for page {page_number}")
        
        page = self.get_page_by_number(page_number)
        print(f"🔍 PAGE OUTPUT DEBUG: Page found: {page is not None}")
        if page:
            print(f"🔍 PAGE OUTPUT DEBUG: Page has_output: {page.has_output()}")
            print(f"🔍 PAGE OUTPUT DEBUG: Page output_node: {page.output_node}")
        
        if not page or not page.has_output() or not page.output_node:
            print(f"🔍 PAGE OUTPUT DEBUG: Returning None - page conditions not met")
            return None
        
        # Get the primary node type to determine how to retrieve data
        primary_node_type = page.get_primary_node_type()
        print(f"🔍 PAGE OUTPUT DEBUG: Primary node type: {primary_node_type}")
        
        if primary_node_type == "prompt":
            print(f"🔍 PAGE OUTPUT DEBUG: Getting prompt page submissions")
            # For prompt pages, get all user submissions
            submissions = self._get_prompt_page_submissions(page)
            print(f"🔍 PAGE OUTPUT DEBUG: Retrieved {len(submissions) if submissions else 'None'} submissions")
            return submissions
        
        # Add other node types as needed
        # elif primary_node_type == "mcq":
        #     return self._get_mcq_page_submissions(page)
        
        print(f"get_page_output_data: Unsupported node type '{primary_node_type}' for page {page_number}")
        return None
    
    def _get_prompt_page_submissions(self, page: Page) -> List[Dict[str, Any]]:
        """
        Get all prompt submissions for a specific page.
        
        Args:
            page: The Page object to get submissions for
            
        Returns:
            List of dictionaries with 'name' and 'text' keys for behavior input
        """
        print(f"🔍 SUBMISSION DEBUG: _get_prompt_page_submissions called for page {page.page_number}")
        
        try:
            # Import the helper function
            from api.deployments.deployment_prompt_routes import get_all_prompt_submissions_for_deployment
            
            # Get the page's deployment ID from its agent deployment
            page_deployment_id = page.get_agent_deployment().deployment_id
            print(f"🔍 SUBMISSION DEBUG: Page deployment ID: {page_deployment_id}")
            
            # Use the injected database session if available, otherwise create a new one
            if hasattr(self, '_db_session') and self._db_session:
                print(f"🔍 SUBMISSION DEBUG: Using injected database session")
                result = get_all_prompt_submissions_for_deployment(page_deployment_id, self._db_session)
            else:
                print(f"🔍 SUBMISSION DEBUG: Creating new database session")
                # Fallback to creating a new session
                from database.database import get_session
                with get_session() as db_session:
                    result = get_all_prompt_submissions_for_deployment(page_deployment_id, db_session)
            
            print(f"🔍 SUBMISSION DEBUG: Raw result type: {type(result)}")
            print(f"🔍 SUBMISSION DEBUG: Raw result: {result}")
            
            # Extract student data and store prompt context for behavior use
            if isinstance(result, dict):
                submissions = result.get("students", [])
                prompt_context = result.get("prompt_context")
            else:
                print(f"ERROR: Expected dict from get_all_prompt_submissions_for_deployment, got {type(result)}: {result}")
                # Fallback to empty list if result is not a dict
                submissions = []
                prompt_context = None
            
            # Validate submissions format
            if not isinstance(submissions, list):
                print(f"ERROR: submissions should be a list, got {type(submissions)}: {submissions}")
                submissions = []
            
            # Validate each submission is a dict
            validated_submissions = []
            for i, submission in enumerate(submissions):
                if isinstance(submission, dict):
                    if 'name' in submission and 'text' in submission:
                        validated_submissions.append(submission)
                    else:
                        print(f"WARNING: Submission {i} missing required keys: {submission}")
                else:
                    print(f"ERROR: Submission {i} is not a dict: {type(submission)} = {submission}")
            
            submissions = validated_submissions
            
            # Store prompt context for potential use by behaviors
            if prompt_context and not hasattr(self, '_prompt_context'):
                self._prompt_context = prompt_context
            
            print(f"Retrieved {len(submissions)} validated submissions for page {page.page_number} (deployment: {page_deployment_id})")
            if prompt_context:
                print(f"Prompt context: {prompt_context[:100]}...")
            
            # Log the first few submissions for debugging
            if submissions:
                print(f"Sample submission type: {type(submissions[0])}")
                print(f"Sample submission: {submissions[0]}")
                
                # Additional debug for theme creator
                if isinstance(submissions, list) and len(submissions) > 0:
                    print(f"DEBUG: First submission structure for behavior input:")
                    first_sub = submissions[0]
                    if isinstance(first_sub, dict):
                        print(f"  Keys: {list(first_sub.keys())}")
                        print(f"  Has 'name' key: {'name' in first_sub}")
                        print(f"  Has 'text' key: {'text' in first_sub}")
                    else:
                        print(f"  ERROR: Submission is not a dict: {type(first_sub)}")
            else:
                print(f"No submissions found for page {page.page_number}")
                
            return submissions
            
        except Exception as e:
            print(f"Error getting prompt submissions for page {page.page_number}: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def set_database_session(self, db_session):
        """
        Set the database session for this PageDeployment.
        This session will be used for database operations.
        """
        self._db_session = db_session
    
    def set_db_session(self, db_session):
        """
        Alias for set_database_session for compatibility with API routes.
        """
        self.set_database_session(db_session)
    
    async def save_state_to_database(self):
        """Save the current state of this PageDeployment to database via pages_manager"""
        if hasattr(self, '_db_session') and self._db_session:
            try:
                from services.pages_manager import save_page_deployment_state
                await save_page_deployment_state(self, self._db_session)
            except Exception as e:
                print(f"Error saving page deployment state: {e}")
    
    async def persist_variable_change(self, variable_name: str, value: Any):
        """Persist a variable change to the database"""
        if hasattr(self, '_db_session') and self._db_session:
            try:
                from services.pages_manager import update_page_deployment_variable
                await update_page_deployment_variable(self.deployment_id, variable_name, value, self._db_session)
            except Exception as e:
                print(f"Error persisting variable change: {e}")
    
    def set_variable_value_with_persistence(self, variable_name: str, value: Any) -> bool:
        """Set variable value and persist to database"""
        success = self.set_variable_value(variable_name, value)
        if success:
            # Refresh live presentation pages that might use this variable
            self._refresh_live_presentation_variable_data()
            
            if hasattr(self, '_db_session') and self._db_session:
                # Schedule persistence (in real async context, this would be awaited)
                import asyncio
                try:
                    loop = asyncio.get_event_loop()
                    loop.create_task(self.persist_variable_change(variable_name, value))
                except RuntimeError:
                    # No event loop running, persistence will happen on next save
                    pass
        return success
    
    def _refresh_live_presentation_variable_data(self):
        """Refresh variable data for all live presentation pages"""
        for page in self.page_list:
            if page.get_primary_node_type() == "livePresentation" and page.has_input() and page.is_input_from_variable():
                print(f"🔄 Refreshing variable data for live presentation page {page.page_number}")
                page.refresh_live_presentation_input_data()
    
    def diagnose_live_presentation_variable_connection(self) -> Dict[str, Any]:
        """Diagnose live presentation variable connections"""
        diagnosis = {
            "total_pages": len(self.page_list),
            "total_variables": len(self.deployment_variables),
            "live_presentation_pages": [],
            "group_variables": []
        }
        
        # Check variables
        for var in self.deployment_variables:
            if var.variable_type == VariableType.GROUP:
                diagnosis["group_variables"].append({
                    "name": var.name,
                    "type": var.variable_type.value,
                    "is_empty": var.is_empty(),
                    "value_preview": str(var.variable_value)[:200] if var.variable_value else None
                })
        
        # Check live presentation pages
        for page in self.page_list:
            if page.get_primary_node_type() == "livePresentation":
                page_info = {
                    "page_number": page.page_number,
                    "has_input": page.has_input(),
                    "input_type": page.input_type,
                    "input_id": page.input_id,
                    "is_input_from_variable": page.is_input_from_variable() if page.has_input() else False,
                    "variable_exists": False,
                    "variable_value": None
                }
                
                if page.has_input() and page.is_input_from_variable():
                    variable = self.get_variable_by_id_or_name(page.input_id)
                    if variable:
                        page_info["variable_exists"] = True
                        page_info["variable_value"] = variable.variable_value
                        page_info["variable_is_empty"] = variable.is_empty()
                
                diagnosis["live_presentation_pages"].append(page_info)
        
        return diagnosis
    
    async def _save_behavior_execution(
        self,
        behavior_number: str,
        behavior_type: str,
        executed_by_user_id: int,
        success: bool,
        execution_time_seconds: float,
        execution_result: Dict[str, Any],
        error_message: Optional[str] = None,
        student_data: Optional[Any] = None
    ):
        """Save behavior execution to database via pages_manager"""
        try:
            from services.pages_manager import save_behavior_execution
            await save_behavior_execution(
                page_deployment=self,
                db=self._db_session,
                behavior_number=behavior_number,
                behavior_type=behavior_type,
                executed_by_user_id=executed_by_user_id,
                success=success,
                execution_time_seconds=execution_time_seconds,
                execution_result=execution_result,
                error_message=error_message,
                student_data=student_data
            )
        except Exception as e:
            print(f"Error saving behavior execution: {e}")
    