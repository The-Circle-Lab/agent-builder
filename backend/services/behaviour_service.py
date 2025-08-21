from typing import Dict, Any, List, Optional
from models.database.db_models import DeploymentType
from services.deployment_types.group_assignment import GroupAssignmentBehavior
from services.deployment_types.theme_creator import ThemeCreatorBehavior

class BehaviorType:
    GROUP = "group"
    THEME = "themeCreator"

class BehaviorDeployment:
    """
    Service for handling behavior-based tasks that run in the background.
    Used exclusively by PageService for processing behaviors like group assignments.
    """
    
    def __init__(
        self,
        behavior_id: str,
        config: Dict[str, Any],
        deployment_id: str
    ) -> None:
        self.behavior_id = behavior_id
        self.deployment_id = deployment_id
        self.behavior_type = config.get('type')
        self.config = config.get('config', {})
        self._results: Optional[Dict[str, Any]] = None
        self._behavior_handler = None
        
        # Validate behavior type and create appropriate handler
        if self.behavior_type == BehaviorType.GROUP:
            self._behavior_handler = GroupAssignmentBehavior(self.config)
        elif self.behavior_type == BehaviorType.THEME:
            self._behavior_handler = ThemeCreatorBehavior(self.config)
        else:
            raise ValueError(f"Unsupported behavior type: {self.behavior_type}")
    
    def get_behavior_type(self) -> str:
        """Get the type of behavior (e.g., 'group')"""
        return self.behavior_type
    
    def execute_behavior(self, input_data: Any, db_session: Optional[Any] = None, prompt_context: Optional[str] = None) -> Dict[str, Any]:
        """
        Execute the behavior with the provided input data.
        
        Args:
            input_data: Input data for the behavior (format depends on behavior type)
            
        Returns:
            Dictionary containing the results of the behavior execution
        """
        try:
            if self._behavior_handler is None:
                raise ValueError(f"No handler available for behavior type: {self.behavior_type}")
            
            # Log behavior execution
            print(f"🚀 Executing {self.behavior_type} behavior with {len(input_data) if hasattr(input_data, '__len__') else 'N/A'} input items")
            
            # Execute the behavior using the appropriate handler
            # Pass through database session when available for handlers that need persistence/lookups
            if hasattr(self._behavior_handler, 'execute'):
                try:
                    result = self._behavior_handler.execute(input_data, db_session=db_session, prompt_context=prompt_context)
                except TypeError:
                    # Fallback for handlers not expecting all parameters
                    try:
                        result = self._behavior_handler.execute(input_data, db_session=db_session)
                    except TypeError:
                        result = self._behavior_handler.execute(input_data)
            else:
                raise ValueError(f"Behavior handler for type {self.behavior_type} has no execute method")
            
            # Add behavior metadata and output counts to the result
            result.update({
                "behavior_type": self.behavior_type,
                "behavior_id": self.behavior_id
            })
            
            # Add output counts for database tracking
            if "groups" in result and isinstance(result["groups"], dict):
                result["output_groups_created"] = len(result["groups"])
            
            if "themes" in result and isinstance(result["themes"], list):
                result["output_themes_created"] = len(result["themes"])
            
            # Cache the results
            self.set_results(result)
            
            return result
            
        except Exception as e:
            error_result = {
                "success": False,
                "error": str(e),
                "behavior_type": self.behavior_type,
                "behavior_id": self.behavior_id
            }
            self.set_results(error_result)
            return error_result
    
    def generate_explanations_for_existing_groups(
        self, 
        groups: Dict[str, List[str]], 
        student_data: List[Dict[str, Any]]
    ) -> Dict[str, str]:
        """
        Generate explanations for existing group assignments.
        
        Args:
            groups: Dictionary mapping group names to lists of student names
            student_data: List of student dictionaries with 'name' and 'text' keys
            
        Returns:
            Dictionary mapping group names to explanation strings
        """
        if self.behavior_type != BehaviorType.GROUP:
            raise ValueError("Explanation generation only available for group behaviors")
        
        if not isinstance(self._behavior_handler, GroupAssignmentBehavior):
            raise ValueError("Invalid behavior handler for group explanation generation")
        
        return self._behavior_handler.generate_explanations_for_existing_groups(groups, student_data)
    
    def get_results(self) -> Optional[Dict[str, Any]]:
        """Get the cached results of the last behavior execution"""
        return self._results
    
    def set_results(self, results: Dict[str, Any]) -> None:
        """Cache the results of a behavior execution"""
        self._results = results
    
    def get_config(self) -> Dict[str, Any]:
        """Get the behavior configuration"""
        base_config = {
            "behavior_id": self.behavior_id,
            "behavior_type": self.behavior_type,
            "config": self.config,
            "deployment_id": self.deployment_id
        }
        
        # Include handler-specific configuration if available
        if self._behavior_handler and hasattr(self._behavior_handler, 'get_config'):
            base_config["handler_config"] = self._behavior_handler.get_config()
        
        return base_config
    
    def update_config(self, new_config: Dict[str, Any]) -> None:
        """
        Update the behavior configuration.
        
        Args:
            new_config: Dictionary containing new configuration values
        """
        # Update base configuration
        if 'config' in new_config:
            self.config.update(new_config['config'])
        
        # Update handler configuration if available
        if self._behavior_handler and hasattr(self._behavior_handler, 'update_config'):
            self._behavior_handler.update_config(new_config.get('config', {}))
    
    def get_behavior_handler(self):
        """Get the underlying behavior handler (for advanced use cases)"""
        return self._behavior_handler
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert behavior deployment to dictionary representation"""
        result = {
            "behavior_id": self.behavior_id,
            "deployment_id": self.deployment_id,
            "behavior_type": self.behavior_type,
            "config": self.config,
            "has_results": self._results is not None,
            "results": self._results
        }
        
        # Include handler information if available
        if self._behavior_handler:
            result["handler_class"] = self._behavior_handler.__class__.__name__
            if hasattr(self._behavior_handler, 'get_config'):
                result["handler_config"] = self._behavior_handler.get_config()
        
        return result

    async def cleanup(self) -> None:
        """Cleanup any resources used by the behavior"""
        print(f"BehaviorDeployment {self.behavior_id} cleaned up")
        self._results = None
        self._behavior_handler = None 
