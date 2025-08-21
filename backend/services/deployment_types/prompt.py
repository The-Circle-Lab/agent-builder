from typing import Dict, Any, List, Optional


class PromptDeployment:
    def __init__(self, main_question: str, submission_requirements: List[Dict[str, Any]], group_data: Optional[Dict[str, Any]] = None):
        """
        Initialize prompt deployment with the main question and submission requirements
        
        Args:
            main_question: The main prompt question from the first node
            submission_requirements: List of submission prompts with their media types
                                   Each item should have 'prompt' and 'mediaType' keys
                                   Can be empty for question-only prompts
            group_data: Optional group data if this prompt is connected to a group variable
        """
        self.main_question = main_question
        self.submission_requirements = submission_requirements
        self.group_data = group_data
        
        # Validate submission requirements (only if they exist)
        for i, req in enumerate(submission_requirements):
            if 'prompt' not in req or 'mediaType' not in req:
                raise ValueError(f"Submission requirement {i} missing 'prompt' or 'mediaType'")
            if req['mediaType'] not in ['textarea', 'hyperlink', 'pdf']:
                raise ValueError(
                    f"Invalid mediaType '{req['mediaType']}' in requirement {i}. Must be 'textarea', 'hyperlink' or 'pdf'"
                )

    def get_main_question(self) -> str:
        """Get the main prompt question"""
        return self.main_question

    def get_submission_requirements(self) -> List[Dict[str, Any]]:
        """Get all submission requirements"""
        return self.submission_requirements

    def get_submission_requirement(self, index: int) -> Optional[Dict[str, Any]]:
        """Get a specific submission requirement by index"""
        if 0 <= index < len(self.submission_requirements):
            return self.submission_requirements[index]
        return None

    def get_submission_count(self) -> int:
        """Get the total number of submission requirements"""
        return len(self.submission_requirements)

    def is_question_only(self) -> bool:
        """Check if this is a question-only prompt (no submissions required)"""
        return len(self.submission_requirements) == 0

    def has_group_data(self) -> bool:
        """Check if this prompt has group data to display"""
        return self.group_data is not None

    def get_user_group_info(self, user_email: str) -> Optional[Dict[str, Any]]:
        """
        Get group information for a specific user
        
        Args:
            user_email: Email of the user to find group info for
            
        Returns:
            Dictionary with group information or None if user not found
        """
        if not self.group_data:
            return None
        
        # The group_data should contain group assignments from the group behavior
        # Format: {"Group 1": ["user1@email.com", "user2@email.com"], ...}
        for group_name, members in self.group_data.items():
            if isinstance(members, list) and user_email in members:
                return {
                    "group_name": group_name,
                    "group_members": members,
                    "member_count": len(members)
                }
        
        return None

    def get_user_group_info_with_explanation(self, user_email: str, explanations: Optional[Dict[str, str]] = None) -> Optional[Dict[str, Any]]:
        """
        Get group information for a specific user including explanation
        
        Args:
            user_email: Email of the user to find group info for
            explanations: Optional dictionary mapping group names to explanations
            
        Returns:
            Dictionary with group information including explanation or None if user not found
        """
        group_info = self.get_user_group_info(user_email)
        if not group_info:
            return None
        
        # Add explanation if available
        if explanations and group_info["group_name"] in explanations:
            group_info["explanation"] = explanations[group_info["group_name"]]
        
        return group_info

    def set_group_data(self, group_data: Dict[str, Any]) -> None:
        """Set group data for this prompt deployment"""
        self.group_data = group_data

    def validate_submission(self, index: int, response: str) -> Dict[str, Any]:
        """
        Validate a user's submission for a specific requirement
        
        Args:
            index: Index of the submission requirement
            response: User's response/submission
            
        Returns:
            Dict with validation results
        """
        if index < 0 or index >= len(self.submission_requirements):
            return {
                "valid": False,
                "error": f"Invalid submission index {index}. Must be between 0 and {len(self.submission_requirements) - 1}"
            }
        
        requirement = self.submission_requirements[index]
        media_type = requirement['mediaType']
        
        # Basic validation
        if not response or not response.strip():
            return {
                "valid": False,
                "error": "Submission cannot be empty"
            }
        
        # Specific validation based on media type
        if media_type == 'hyperlink':
            if not self._is_valid_url(response.strip()):
                return {
                    "valid": False,
                    "error": "Please provide a valid URL (must start with http:// or https://)"
                }
        elif media_type == 'pdf':
            # PDF submissions should be handled via the dedicated file upload endpoint.
            # Reject validation here to guide clients to the correct flow.
            return {
                "valid": False,
                "error": "This submission requires a PDF upload. Use the PDF upload endpoint."
            }
        
        return {
            "valid": True,
            "error": None
        }

    def _is_valid_url(self, url: str) -> bool:
        """Check if a string is a valid URL"""
        import re
        url_pattern = re.compile(
            r'^https?://'  # http:// or https://
            r'(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|'  # domain...
            r'localhost|'  # localhost...
            r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})'  # ...or ip
            r'(?::\d+)?'  # optional port
            r'(?:/?|[/?]\S+)$', re.IGNORECASE)
        return url_pattern.match(url) is not None

    def to_dict(self) -> Dict[str, Any]:
        """Convert deployment to dictionary representation"""
        result = {
            "main_question": self.main_question,
            "submission_requirements": self.submission_requirements,
            "submission_count": len(self.submission_requirements),
            "is_question_only": self.is_question_only(),
            "has_group_data": self.has_group_data()
        }
        
        if self.group_data:
            result["group_data"] = self.group_data
        
        return result

    @staticmethod
    def from_config(config: Dict[str, Any], group_data: Optional[Dict[str, Any]] = None) -> 'PromptDeployment':
        """
        Create PromptDeployment from workflow configuration
        
        Args:
            config: Full workflow configuration dict
            group_data: Optional group data if this prompt is connected to a group variable
            
        Returns:
            PromptDeployment instance
        """
        # Extract main question from prompt node (node 1)
        prompt_node = config.get('1', {})
        if prompt_node.get('type') != 'prompt':
            raise ValueError("First node must be of type 'prompt'")
        
        main_question = prompt_node.get('config', {}).get('question', '')
        if not main_question:
            raise ValueError("Prompt node must have a 'question' in config")
        
        # Check if there's a submission node (node 2)
        submission_node = config.get('2', {})
        submission_prompts = []
        
        # If node 2 exists and is a submission node, extract submission requirements
        if submission_node and submission_node.get('type') == 'submission':
            submission_prompts = submission_node.get('config', {}).get('submission_prompts', [])
            if not submission_prompts:
                # Even if submission node exists but has no prompts, treat as question-only
                submission_prompts = []
        
        # Create deployment with main question, submission requirements, and group data
        return PromptDeployment(main_question, submission_prompts, group_data) 
