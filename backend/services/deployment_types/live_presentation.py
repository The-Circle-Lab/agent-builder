import asyncio
import json
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Set
from fastapi import WebSocket, WebSocketDisconnect
from enum import Enum

# Import response summarizer for group summary generation
from .response_summarizer import ResponseSummarizer, QuestionContext, StudentResponse

class ConnectionStatus(str, Enum):
    CONNECTED = "connected"
    READY = "ready"
    DISCONNECTED = "disconnected"

class MessageType(str, Enum):
    # Teacher messages
    SEND_PROMPT = "send_prompt"
    SEND_GROUP_INFO = "send_group_info"
    SEND_READY_CHECK = "send_ready_check"
    GET_STATS = "get_stats"
    
    # Student messages
    STUDENT_READY = "student_ready"
    STUDENT_RESPONSE = "student_response"
    STUDENT_JOIN = "student_join"
    
    # System messages
    CONNECTION_UPDATE = "connection_update"
    PROMPT_RECEIVED = "prompt_received"
    ERROR = "error"

class LivePresentationPrompt:
    def __init__(self, prompt_data: Dict[str, Any]):
        self.id = prompt_data.get("id", str(uuid.uuid4()))
        self.statement = prompt_data.get("statement", "")
        self.has_input = prompt_data.get("hasInput", False)
        self.input_type = prompt_data.get("inputType", "textarea")
        self.input_placeholder = prompt_data.get("inputPlaceholder", "")
        self.use_random_list_item = prompt_data.get("useRandomListItem", False)
        self.list_variable_id = prompt_data.get("listVariableId")
        self.is_system_prompt = prompt_data.get("isSystemPrompt", False)
        self.category = prompt_data.get("category", "general")
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "statement": self.statement,
            "hasInput": self.has_input,
            "inputType": self.input_type,
            "inputPlaceholder": self.input_placeholder,
            "useRandomListItem": self.use_random_list_item,
            "listVariableId": self.list_variable_id,
            "isSystemPrompt": self.is_system_prompt,
            "category": self.category
        }

class StudentConnection:
    def __init__(self, user_id: str, user_name: str, websocket: WebSocket):
        self.user_id = user_id
        self.user_name = user_name
        self.websocket = websocket
        self.status = ConnectionStatus.CONNECTED
        self.connected_at = datetime.now()
        self.last_activity = datetime.now()
        self.responses: Dict[str, Any] = {}  # prompt_id -> response data
        self.group_info: Optional[Dict[str, Any]] = None
    
    async def send_message(self, message: Dict[str, Any]):
        """Send a message to this student"""
        try:
            await self.websocket.send_text(json.dumps(message))
            self.last_activity = datetime.now()
        except Exception as e:
            print(f"Error sending message to {self.user_name}: {e}")
            self.status = ConnectionStatus.DISCONNECTED
    
    def set_ready(self):
        """Mark student as ready"""
        self.status = ConnectionStatus.READY
        self.last_activity = datetime.now()
    
    def add_response(self, prompt_id: str, response_data: Dict[str, Any]):
        """Add a response from this student"""
        self.responses[prompt_id] = {
            **response_data,
            "timestamp": datetime.now().isoformat(),
            "user_id": self.user_id,
            "user_name": self.user_name
        }
        self.last_activity = datetime.now()
    
    def to_stats_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for stats purposes"""
        return {
            "user_id": self.user_id,
            "user_name": self.user_name,
            "status": self.status,
            "connected_at": self.connected_at.isoformat(),
            "last_activity": self.last_activity.isoformat(),
            "response_count": len(self.responses),
            "group_info": self.group_info
        }

class LivePresentationDeployment:
    def __init__(self, config: Dict[str, Any], deployment_id: str):
        self.deployment_id = deployment_id
        self.config = config
        self.title = config.get("title", "Live Presentation")
        self.description = config.get("description", "")
        
        # Parse saved prompts from config
        self.saved_prompts: List[LivePresentationPrompt] = []
        saved_prompts_data = config.get("saved_prompts", [])
        for prompt_data in saved_prompts_data:
            self.saved_prompts.append(LivePresentationPrompt(prompt_data))
        
        # Add built-in system prompts that are always available
        self._add_system_prompts()
        
        # WebSocket connections
        self.students: Dict[str, StudentConnection] = {}  # user_id -> StudentConnection
        self.teacher_websockets: Set[WebSocket] = set()
        
        # Session data
        self.session_active = False
        self.current_prompt: Optional[Dict[str, Any]] = None
        self.ready_check_active = False
        self.ready_students: Set[str] = set()
        
        # Variable data (for group info, list items, etc.)
        self.input_variable_data: Optional[Any] = None
        
        # Separate storage for theme data (list items) to avoid conflicts with group data
        self._theme_data: Optional[List[Any]] = None
        
        # Reference to parent page deployment for auto-detecting variables
        self._parent_page_deployment: Optional[Any] = None
        
        # Cache for list variable data to avoid repeated lookups
        self._list_variable_cache: Dict[str, Optional[List[Any]]] = {}
        
        # Database session for persistence
        self._db_session = None
        
        # Group response completion tracking: prompt_id -> {group_name -> {completed: bool, summary_sent: bool}}
        self._group_completion_status: Dict[str, Dict[str, Dict[str, bool]]] = {}
        
        # Initialize response summarizer for group summaries using GPT-5 (only if possible)
        self._response_summarizer = None
        try:
            self._response_summarizer = ResponseSummarizer(
                model_name="gpt-5",
                temperature=1.0,  # GPT-5 only supports default temperature of 1.0
                max_tokens=2000
            )
        except Exception as e:
            print(f"⚠️ Could not initialize ResponseSummarizer (API key not available): {e}")
            print("🎯 Group summary features will be disabled, but basic functionality will work")
        
        print(f"🎤 LivePresentationDeployment created: {deployment_id}")
        print(f"   Title: {self.title}")
        print(f"   Saved Prompts: {len(self.saved_prompts)}")
    
    def _add_system_prompts(self):
        """Add built-in system prompts that are always available"""
        # Thank you prompt for ending presentations
        thank_you_prompt_data = {
            "id": "system_thank_you",
            "statement": "Thank you for participating! 🎉\n\nYour engagement and contributions have made this session meaningful. We appreciate your time and thoughtful responses.",
            "hasInput": False,
            "inputType": "none",
            "inputPlaceholder": "",
            "useRandomListItem": False,
            "listVariableId": None,
            "isSystemPrompt": True,
            "category": "closing"
        }
        
        thank_you_prompt = LivePresentationPrompt(thank_you_prompt_data)
        self.saved_prompts.append(thank_you_prompt)
        
        print(f"🎤 Added system prompts: 1 (Thank you prompt)")
    
    def set_input_variable_data(self, data: Any):
        """Set data from connected input variable (e.g., group data)"""
        self.input_variable_data = data
        print(f"🎤 Input variable data set: {type(data)} with {len(data) if isinstance(data, (list, dict)) else 'N/A'} items")
        print(f"🎤 Variable data preview: {data}")
        
        # Clear cache when variable data changes
        self.clear_list_variable_cache()
        
        # If this is theme data (list format), store it separately for list items
        if isinstance(data, list) and data and isinstance(data[0], dict) and 'title' in data[0]:
            print(f"🎯 Detected theme data, storing separately for list items: {len(data)} themes")
            self._theme_data = data
            print(f"🎯 Theme data stored: {[theme.get('title', 'Unknown') for theme in data[:3]]}")
        else:
            print(f"🔍 Data is not theme data - Type: {type(data)}, List: {isinstance(data, list)}")
            if isinstance(data, list) and data:
                print(f"🔍 First item type: {type(data[0])}, Has title: {'title' in data[0] if isinstance(data[0], dict) else False}")
        
        # Update group info for all already connected students
        for student in self.students.values():
            if student.status != ConnectionStatus.DISCONNECTED:
                self._assign_group_info_to_student(student)
        
        # Persist the change
        asyncio.create_task(self._save_session_state())
    
    def manually_set_group_data(self, group_data: Dict[str, Any]):
        """Manually set group data for testing/debugging purposes"""
        print(f"🔧 Manually setting group data: {group_data}")
        self.set_input_variable_data(group_data)
    
    def set_database_session(self, db_session):
        """Set the database session for persistence"""
        self._db_session = db_session
    
    def set_parent_page_deployment(self, page_deployment):
        """Set reference to parent PageDeployment for auto-detecting variables"""
        self._parent_page_deployment = page_deployment
        print(f"🎤 Parent page deployment set for live presentation")
        # Auto-detect and set group variable data
        self._auto_detect_group_variable()
    
    def _auto_detect_group_variable(self):
        """Auto-detect and use the first available GROUP type variable from parent page deployment"""
        if not self._parent_page_deployment:
            print(f"🔍 No parent page deployment available for auto-detection")
            # Try to get it from the deployment manager
            self._try_get_parent_page_deployment()
            if not self._parent_page_deployment:
                print(f"🔍 Still no parent page deployment available after trying to get it")
                return
        
        try:
            # Look for GROUP type variables  
            from services.page_service import VariableType
            
            # First, let's see what variables exist
            all_variables = self._parent_page_deployment.get_deployment_variables()
            print(f"🔍 All available variables in page deployment:")
            for var in all_variables:
                print(f"   - '{var.name}' (type: {var.variable_type}, empty: {var.is_empty()})")
            
            group_variables = []
            for variable in all_variables:
                if hasattr(variable, 'variable_type') and variable.variable_type == VariableType.GROUP:
                    group_variables.append(variable)
            
            # If no variables found or they're empty, try to get latest group assignment from database
            if not group_variables or all(var.is_empty() for var in group_variables):
                print(f"🔍 No populated GROUP variables found, checking for recent group assignments in database...")
                group_data_from_db = self._get_latest_group_assignment_from_database()
                if group_data_from_db:
                    print(f"✅ Found group assignment data in database")
                    self.set_input_variable_data(group_data_from_db)
                    return
                else:
                    print(f"⚠️ No group assignment data found in database")
            
            print(f"🔍 Found {len(group_variables)} GROUP type variables")
            
            if group_variables:
                # Prioritize variables with dictionary-format group assignment data
                selected_variable = None
                for var in group_variables:
                    print(f"🔍 Checking GROUP variable '{var.name}': empty={var.is_empty()}")
                    if not var.is_empty() and var.variable_value:
                        print(f"🔍 Variable '{var.name}' value type: {type(var.variable_value)}")
                        print(f"🔍 Variable '{var.name}' sample data: {str(var.variable_value)[:200]}...")
                        
                        # Check if this looks like group assignment data (dictionary format)
                        if isinstance(var.variable_value, dict):
                            # Check if it contains group assignments (group_name -> list of members)
                            sample_values = list(var.variable_value.values())[:3]  # Check first 3 values
                            if sample_values and all(isinstance(v, list) for v in sample_values):
                                print(f"✅ Found group assignment data in variable '{var.name}'")
                                selected_variable = var
                                break
                            else:
                                print(f"⚠️ Variable '{var.name}' has dict format but not group assignments")
                        elif isinstance(var.variable_value, list):
                            print(f"⚠️ Variable '{var.name}' contains list data (likely themes), skipping for group assignments")
                        else:
                            print(f"⚠️ Variable '{var.name}' has unknown data format: {type(var.variable_value)}")
                
                # If no dictionary-format variables found, try any non-empty one as fallback
                if not selected_variable:
                    for var in group_variables:
                        if not var.is_empty():
                            print(f"🔄 Fallback: using variable '{var.name}' even though format may not match")
                            selected_variable = var
                            break
                
                # Last resort: use first variable even if empty
                if not selected_variable and group_variables:
                    selected_variable = group_variables[0]
                    print(f"🔄 Last resort: using first GROUP variable '{selected_variable.name}'")
                
                if selected_variable:
                    print(f"🎤 Auto-detected GROUP variable: '{selected_variable.name}'")
                    if selected_variable.variable_value:
                        self.set_input_variable_data(selected_variable.variable_value)
                        print(f"🎤 Auto-loaded group data from variable '{selected_variable.name}'")
                    else:
                        print(f"⚠️ GROUP variable '{selected_variable.name}' is empty")
                else:
                    print(f"⚠️ No suitable GROUP variables found")
            else:
                print(f"⚠️ No GROUP type variables found in page deployment")
        
        except Exception as e:
            print(f"❌ Error during group variable auto-detection: {e}")
    
    def _get_latest_group_assignment_from_database(self) -> Optional[Dict[str, List[str]]]:
        """Get the latest group assignment data from database for this deployment"""
        if not self._db_session:
            print(f"🔍 No database session available for group assignment lookup")
            return None
        
        try:
            from models.database.grouping_models import GroupAssignment, Group, GroupMember
            from models.database.page_models import PageDeploymentState
            from sqlmodel import select, and_
            
            # Get the page deployment ID for this live presentation
            main_deployment_id = self.deployment_id.split('_page_')[0]
            
            # Find the page deployment state
            page_deployment_state = self._db_session.exec(
                select(PageDeploymentState).where(
                    PageDeploymentState.deployment_id == main_deployment_id
                )
            ).first()
            
            if not page_deployment_state:
                print(f"🔍 No page deployment state found for {main_deployment_id}")
                return None
            
            # Get the latest group assignment for this page deployment
            latest_assignment = self._db_session.exec(
                select(GroupAssignment)
                .where(and_(
                    GroupAssignment.page_deployment_id == page_deployment_state.id,
                    GroupAssignment.is_active == True
                ))
                .order_by(GroupAssignment.created_at.desc())
            ).first()
            
            if not latest_assignment:
                print(f"🔍 No group assignments found for page deployment {main_deployment_id}")
                return None
            
            print(f"🔍 Found group assignment from {latest_assignment.created_at}")
            print(f"    Total groups: {latest_assignment.total_groups}, Total students: {latest_assignment.total_students}")
            
            # Build the group data dictionary
            group_data = {}
            groups = self._db_session.exec(
                select(Group).where(and_(
                    Group.assignment_id == latest_assignment.id,
                    Group.is_active == True
                ))
                .order_by(Group.group_number)
            ).all()
            
            for group in groups:
                members = self._db_session.exec(
                    select(GroupMember).where(and_(
                        GroupMember.group_id == group.id,
                        GroupMember.is_active == True
                    ))
                ).all()
                
                member_names = [member.student_name for member in members]
                group_data[group.group_name] = member_names
                print(f"    {group.group_name}: {member_names}")
            
            return group_data if group_data else None
            
        except Exception as e:
            print(f"❌ Error retrieving group assignment from database: {e}")
            return None
    
    def refresh_group_variable_data(self):
        """Manually refresh group variable data from parent page deployment"""
        print(f"🔄 Manual refresh of group variable data requested")
        self._auto_detect_group_variable()
    
    def _try_get_parent_page_deployment(self):
        """Try to get parent page deployment from deployment manager"""
        try:
            # Extract the main deployment ID from our page deployment ID
            # Format: "4c1555b3-af7e-44d5-8a11-93906f0e3228_page_3" -> "4c1555b3-af7e-44d5-8a11-93906f0e3228"
            if "_page_" in self.deployment_id:
                main_deployment_id = self.deployment_id.split("_page_")[0]
                print(f"🔍 Trying to get parent page deployment: {main_deployment_id}")
                
                # Try to get it from pages_manager
                from services.pages_manager import get_active_page_deployment
                page_deployment_info = get_active_page_deployment(main_deployment_id)
                
                if page_deployment_info and "page_deployment" in page_deployment_info:
                    self._parent_page_deployment = page_deployment_info["page_deployment"]
                    print(f"🎤 Successfully retrieved parent page deployment from pages_manager")
                    return True
                else:
                    print(f"⚠️ Could not find parent page deployment in pages_manager")
                    
        except Exception as e:
            print(f"❌ Error trying to get parent page deployment: {e}")
        
        return False
    
    def _assign_group_info_to_student(self, student: "StudentConnection"):
        """Assign group info to a student based on current variable data"""
        student.group_info = None  # Reset first
        
        print(f"🔍 Assigning group info to student: {student.user_name}")
        print(f"🔍 Available input_variable_data: {self.input_variable_data}")
        print(f"🔍 Input variable data type: {type(self.input_variable_data)}")
        
        # Only handle dictionary format (standard group data)
        # Theme data should NOT be used for group assignments
        if self.input_variable_data and isinstance(self.input_variable_data, dict):
            print(f"🔍 Processing group assignment data - searching through {len(self.input_variable_data)} groups")
            for group_name, members in self.input_variable_data.items():
                print(f"🔍 Checking group '{group_name}' with members: {members}")
                print(f"🔍 Members type: {type(members)}")
                if isinstance(members, list):
                    print(f"🔍 Looking for '{student.user_name}' in members: {members}")
                    if student.user_name in members:
                        student.group_info = {
                            "group_name": group_name,
                            "group_members": members
                        }
                        print(f"✅ Found student '{student.user_name}' in group '{group_name}'")
                        return
                    else:
                        print(f"❌ Student '{student.user_name}' not found in group '{group_name}'")
                else:
                    print(f"⚠️ Group '{group_name}' members is not a list: {type(members)}")
        else:
            if isinstance(self.input_variable_data, list):
                print(f"⚠️ Found theme/list data instead of group assignment data. Theme data should not be used for group info.")
            print(f"⚠️ No valid group assignment data available")
        
        print(f"🔍 Final group_info for {student.user_name}: {student.group_info}")
    
    def diagnose_group_data_issues(self) -> Dict[str, Any]:
        """Diagnose issues with group data assignment"""
        diagnosis = {
            "has_input_variable_data": self.input_variable_data is not None,
            "input_variable_data_type": type(self.input_variable_data).__name__ if self.input_variable_data else None,
            "connected_students": len([s for s in self.students.values() if s.status != ConnectionStatus.DISCONNECTED]),
            "students_with_group_info": len([s for s in self.students.values() if s.status != ConnectionStatus.DISCONNECTED and s.group_info]),
            "students_without_group_info": len([s for s in self.students.values() if s.status != ConnectionStatus.DISCONNECTED and not s.group_info]),
        }
        
        if self.input_variable_data and isinstance(self.input_variable_data, dict):
            diagnosis["group_count"] = len(self.input_variable_data)
            diagnosis["groups"] = {}
            for group_name, members in self.input_variable_data.items():
                diagnosis["groups"][group_name] = {
                    "member_count": len(members) if isinstance(members, list) else 0,
                    "members": members if isinstance(members, list) else f"Invalid type: {type(members)}"
                }
        
        # List students and their group status
        diagnosis["student_details"] = []
        for student in self.students.values():
            if student.status != ConnectionStatus.DISCONNECTED:
                diagnosis["student_details"].append({
                    "user_name": student.user_name,
                    "has_group_info": student.group_info is not None,
                    "group_name": student.group_info.get("group_name") if student.group_info else None
                })
        
        return diagnosis
    
    async def restore_from_database(self):
        """Restore session state from database"""
        if not self._db_session:
            return
        
        try:
            from models.database.live_presentation_models import (
                LivePresentationSession, LivePresentationStudentConnection, LivePresentationResponse
            )
            from sqlmodel import select
            
            # Get session record
            session_record = self._db_session.exec(
                select(LivePresentationSession).where(
                    LivePresentationSession.deployment_id == self.deployment_id,
                    LivePresentationSession.is_active == True
                )
            ).first()
            
            if not session_record:
                print(f"🎤 No saved session found for {self.deployment_id}")
                return
            
            # Restore session state
            self.title = session_record.title
            self.description = session_record.description
            self.session_active = session_record.session_active
            self.ready_check_active = session_record.ready_check_active
            self.current_prompt = session_record.current_prompt
            self.input_variable_data = session_record.input_variable_data
            
            # Restore saved prompts (but preserve system prompts)
            if session_record.saved_prompts:
                # First, separate system prompts from regular prompts
                system_prompts = [p for p in self.saved_prompts if p.is_system_prompt]
                
                # Restore regular prompts from database
                restored_prompts = [
                    LivePresentationPrompt(prompt_data) 
                    for prompt_data in session_record.saved_prompts
                ]
                
                # Combine restored prompts with system prompts
                self.saved_prompts = restored_prompts + system_prompts
                
                print(f"🎤 Restored {len(restored_prompts)} prompts from database and preserved {len(system_prompts)} system prompts")
            
            # Note: Student connections are not restored on server restart
            # Students will need to reconnect, but their data remains in the database
            
            print(f"🎤 Session state restored for {self.deployment_id}")
            print(f"   Session active: {self.session_active}")
            print(f"   Ready check active: {self.ready_check_active}")
            print(f"   Saved prompts: {len(self.saved_prompts)}")
            
        except Exception as e:
            print(f"Error restoring session state from database: {e}")
    
    async def get_session_history_from_database(self) -> Dict[str, Any]:
        """Get session history and responses from database for teacher dashboard"""
        if not self._db_session:
            return {}
        
        try:
            from models.database.live_presentation_models import (
                LivePresentationSession, LivePresentationStudentConnection, LivePresentationResponse
            )
            from sqlmodel import select
            
            # Get session record
            session_record = self._db_session.exec(
                select(LivePresentationSession).where(
                    LivePresentationSession.deployment_id == self.deployment_id,
                    LivePresentationSession.is_active == True
                )
            ).first()
            
            if not session_record:
                return {}
            
            # Get student connections
            connections = self._db_session.exec(
                select(LivePresentationStudentConnection).where(
                    LivePresentationStudentConnection.session_id == session_record.id,
                    LivePresentationStudentConnection.is_active == True
                )
            ).all()
            
            # Get responses
            responses = self._db_session.exec(
                select(LivePresentationResponse).where(
                    LivePresentationResponse.session_id == session_record.id,
                    LivePresentationResponse.is_active == True
                )
            ).all()
            
            # Organize data
            history = {
                "session_info": {
                    "title": session_record.title,
                    "created_at": session_record.created_at,
                    "total_connections": len(connections)
                },
                "connections": [
                    {
                        "user_id": conn.user_id,
                        "user_name": conn.user_name,
                        "status": conn.status,
                        "connected_at": conn.connected_at,
                        "last_activity": conn.last_activity,
                        "group_info": conn.group_info
                    }
                    for conn in connections
                ],
                "responses": [
                    {
                        "user_name": resp.response_data.get("user_name") if resp.response_data else "Unknown",
                        "prompt_id": resp.prompt_id,
                        "response_text": resp.response_text,
                        "submitted_at": resp.submitted_at,
                        "group_info": resp.response_data.get("group_info") if resp.response_data else None
                    }
                    for resp in responses
                ]
            }
            
            return history
            
        except Exception as e:
            print(f"Error getting session history from database: {e}")
            return {}
    
    async def _save_session_state(self):
        """Save current session state to database"""
        if not self._db_session:
            return
        
        try:
            from models.database.live_presentation_models import LivePresentationSession
            from sqlmodel import select
            
            # Get or create session record
            session_record = self._db_session.exec(
                select(LivePresentationSession).where(
                    LivePresentationSession.deployment_id == self.deployment_id,
                    LivePresentationSession.is_active == True
                )
            ).first()
            
            if not session_record:
                session_record = LivePresentationSession(
                    deployment_id=self.deployment_id,
                    title=self.title,
                    description=self.description,
                    session_active=self.session_active,
                    ready_check_active=self.ready_check_active,
                    current_prompt=self.current_prompt,
                    input_variable_data=self.input_variable_data,
                    saved_prompts=[prompt.to_dict() for prompt in self.saved_prompts if not prompt.is_system_prompt]
                )
                self._db_session.add(session_record)
            else:
                # Update existing session
                session_record.session_active = self.session_active
                session_record.ready_check_active = self.ready_check_active
                session_record.current_prompt = self.current_prompt
                session_record.input_variable_data = self.input_variable_data
                session_record.saved_prompts = [prompt.to_dict() for prompt in self.saved_prompts if not prompt.is_system_prompt]
                session_record.updated_at = datetime.now()
                self._db_session.add(session_record)
            
            self._db_session.commit()
            print(f"🎤 Session state saved for {self.deployment_id}")
            
        except Exception as e:
            print(f"Error saving session state: {e}")
            if self._db_session:
                self._db_session.rollback()
    
    async def _save_student_connection(self, student: "StudentConnection"):
        """Save or update student connection in database"""
        if not self._db_session:
            return
        
        try:
            from models.database.live_presentation_models import (
                LivePresentationSession, LivePresentationStudentConnection
            )
            from sqlmodel import select
            
            # Get session record
            session_record = self._db_session.exec(
                select(LivePresentationSession).where(
                    LivePresentationSession.deployment_id == self.deployment_id,
                    LivePresentationSession.is_active == True
                )
            ).first()
            
            if not session_record:
                # Create session first
                await self._save_session_state()
                session_record = self._db_session.exec(
                    select(LivePresentationSession).where(
                        LivePresentationSession.deployment_id == self.deployment_id,
                        LivePresentationSession.is_active == True
                    )
                ).first()
            
            if session_record:
                # Get or create student connection record
                connection_record = self._db_session.exec(
                    select(LivePresentationStudentConnection).where(
                        LivePresentationStudentConnection.session_id == session_record.id,
                        LivePresentationStudentConnection.user_id == student.user_id,
                        LivePresentationStudentConnection.is_active == True
                    )
                ).first()
                
                if not connection_record:
                    connection_record = LivePresentationStudentConnection(
                        session_id=session_record.id,
                        user_id=student.user_id,
                        user_name=student.user_name,
                        status=student.status,
                        is_ready=(student.status == ConnectionStatus.READY),
                        group_info=student.group_info,
                        connected_at=student.connected_at,
                        last_activity=student.last_activity
                    )
                    self._db_session.add(connection_record)
                else:
                    # Update existing connection
                    connection_record.status = student.status
                    connection_record.is_ready = (student.status == ConnectionStatus.READY)
                    connection_record.last_activity = student.last_activity
                    if student.status == ConnectionStatus.DISCONNECTED:
                        connection_record.disconnected_at = datetime.now()
                    self._db_session.add(connection_record)
                
                self._db_session.commit()
                
        except Exception as e:
            print(f"Error saving student connection: {e}")
            if self._db_session:
                self._db_session.rollback()
    
    async def _save_prompt_to_database(self, prompt_data: Dict[str, Any]):
        """Save prompt to database for late-joining students (active for 10 minutes)"""
        if not self._db_session:
            return
        
        try:
            from models.database.live_presentation_models import (
                LivePresentationSession, LivePresentationPrompt
            )
            from sqlmodel import select
            
            # Get session record
            session_record = self._db_session.exec(
                select(LivePresentationSession).where(
                    LivePresentationSession.deployment_id == self.deployment_id,
                    LivePresentationSession.is_active == True
                )
            ).first()
            
            if not session_record:
                # Create session first
                await self._save_session_state()
                session_record = self._db_session.exec(
                    select(LivePresentationSession).where(
                        LivePresentationSession.deployment_id == self.deployment_id,
                        LivePresentationSession.is_active == True
                    )
                ).first()
            
            if session_record:
                # Clean up any previous active prompts for this session (we only keep the latest one)
                from sqlmodel import update
                
                # Mark previous prompts as inactive
                self._db_session.exec(
                    update(LivePresentationPrompt)
                    .where(LivePresentationPrompt.session_id == session_record.id)
                    .values(is_active=False)
                )
                
                # Create new prompt record
                prompt_record = LivePresentationPrompt(
                    session_id=session_record.id,
                    prompt_id=prompt_data.get("id", ""),
                    statement=prompt_data.get("statement", ""),
                    has_input=prompt_data.get("hasInput", False),
                    input_type=prompt_data.get("inputType", "textarea"),
                    input_placeholder=prompt_data.get("inputPlaceholder", ""),
                    use_random_list_item=prompt_data.get("useRandomListItem", False),
                    list_variable_id=prompt_data.get("listVariableId"),
                    sent_at=datetime.fromisoformat(prompt_data.get("sent_at")) if prompt_data.get("sent_at") else datetime.now(),
                    prompt_data=prompt_data
                )
                
                self._db_session.add(prompt_record)
                self._db_session.commit()
                print(f"🎤 Prompt saved to database: {prompt_data.get('id', 'unknown')}")
                
        except Exception as e:
            print(f"Error saving prompt to database: {e}")
            if self._db_session:
                self._db_session.rollback()
    
    async def _get_recent_prompt_from_database(self) -> Optional[Dict[str, Any]]:
        """Get the most recent prompt from database if it's within 10 minutes"""
        if not self._db_session:
            return None
        
        try:
            from models.database.live_presentation_models import (
                LivePresentationSession, LivePresentationPrompt
            )
            from sqlmodel import select, and_
            
            # Get session record
            session_record = self._db_session.exec(
                select(LivePresentationSession).where(
                    LivePresentationSession.deployment_id == self.deployment_id,
                    LivePresentationSession.is_active == True
                )
            ).first()
            
            if not session_record:
                return None
            
            # Calculate 10 minutes ago
            ten_minutes_ago = datetime.now() - timedelta(minutes=10)
            
            # Get the most recent active prompt that was sent within the last 10 minutes
            recent_prompt = self._db_session.exec(
                select(LivePresentationPrompt).where(
                    and_(
                        LivePresentationPrompt.session_id == session_record.id,
                        LivePresentationPrompt.is_active == True,
                        LivePresentationPrompt.sent_at >= ten_minutes_ago
                    )
                ).order_by(LivePresentationPrompt.sent_at.desc())
            ).first()
            
            if recent_prompt:
                print(f"🎤 Found recent prompt (sent at {recent_prompt.sent_at}): {recent_prompt.prompt_id}")
                # Return the full prompt data
                if recent_prompt.prompt_data:
                    return recent_prompt.prompt_data
                else:
                    # Fallback: construct prompt data from individual fields
                    return {
                        "id": recent_prompt.prompt_id,
                        "statement": recent_prompt.statement,
                        "hasInput": recent_prompt.has_input,
                        "inputType": recent_prompt.input_type,
                        "inputPlaceholder": recent_prompt.input_placeholder,
                        "useRandomListItem": recent_prompt.use_random_list_item,
                        "listVariableId": recent_prompt.list_variable_id,
                        "sent_at": recent_prompt.sent_at.isoformat()
                    }
            else:
                print(f"🎤 No recent prompts found within the last 10 minutes")
                return None
                
        except Exception as e:
            print(f"Error getting recent prompt from database: {e}")
            return None
    
    async def _cleanup_expired_prompts(self):
        """Clean up prompts older than 10 minutes"""
        if not self._db_session:
            return
        
        try:
            from models.database.live_presentation_models import LivePresentationPrompt
            from sqlmodel import update, and_
            
            # Calculate 10 minutes ago
            ten_minutes_ago = datetime.now() - timedelta(minutes=10)
            
            # Mark expired prompts as inactive
            result = self._db_session.exec(
                update(LivePresentationPrompt)
                .where(
                    and_(
                        LivePresentationPrompt.sent_at < ten_minutes_ago,
                        LivePresentationPrompt.is_active == True
                    )
                )
                .values(is_active=False)
            )
            
            self._db_session.commit()
            print(f"🎤 Cleaned up expired prompts: {result.rowcount} prompts marked as inactive")
            
        except Exception as e:
            print(f"Error cleaning up expired prompts: {e}")
            if self._db_session:
                self._db_session.rollback()
    
    async def _save_student_response(self, student: "StudentConnection", prompt_id: str, response_text: str):
        """Save student response to database"""
        if not self._db_session:
            return
        
        try:
            from models.database.live_presentation_models import (
                LivePresentationSession, LivePresentationStudentConnection, LivePresentationResponse
            )
            from sqlmodel import select
            
            # Get session and student connection records
            session_record = self._db_session.exec(
                select(LivePresentationSession).where(
                    LivePresentationSession.deployment_id == self.deployment_id,
                    LivePresentationSession.is_active == True
                )
            ).first()
            
            if session_record:
                connection_record = self._db_session.exec(
                    select(LivePresentationStudentConnection).where(
                        LivePresentationStudentConnection.session_id == session_record.id,
                        LivePresentationStudentConnection.user_id == student.user_id,
                        LivePresentationStudentConnection.is_active == True
                    )
                ).first()
                
                if connection_record:
                    # Create response record
                    response_record = LivePresentationResponse(
                        session_id=session_record.id,
                        student_connection_id=connection_record.id,
                        prompt_id=prompt_id,
                        response_text=response_text,
                        response_data={
                            "user_name": student.user_name,
                            "group_info": student.group_info
                        }
                    )
                    
                    self._db_session.add(response_record)
                    self._db_session.commit()
                    print(f"🎤 Response saved for {student.user_name} on prompt {prompt_id}")
                    
        except Exception as e:
            print(f"Error saving student response: {e}")
            if self._db_session:
                self._db_session.rollback()
    
    async def connect_student(self, user_id: str, user_name: str, websocket: WebSocket) -> bool:
        """Connect a student to the live presentation"""
        try:
            # WebSocket is already accepted in the route handler
            
            # Try to auto-detect group variables if we don't have data yet
            print(f"🔍 DEBUG: input_variable_data is None: {self.input_variable_data is None}")
            print(f"🔍 DEBUG: parent_page_deployment exists: {self._parent_page_deployment is not None}")
            
            if self.input_variable_data is None:
                if self._parent_page_deployment:
                    print(f"🔄 No group data available, attempting auto-detection for student connection")
                    self._auto_detect_group_variable()
                    
                    # If still no data, try database lookup directly
                    if self.input_variable_data is None:
                        print(f"🔍 Auto-detection failed, trying direct database lookup...")
                        group_data_from_db = self._get_latest_group_assignment_from_database()
                        if group_data_from_db:
                            self.set_input_variable_data(group_data_from_db)
                else:
                    print(f"🔍 No parent page deployment, trying database lookup directly...")
                    group_data_from_db = self._get_latest_group_assignment_from_database()
                    if group_data_from_db:
                        self.set_input_variable_data(group_data_from_db)
            
            # Create student connection
            student = StudentConnection(user_id, user_name, websocket)
            
            # Add group info if available from input variable
            self._assign_group_info_to_student(student)
            
            self.students[user_id] = student
            
            # Send welcome message
            welcome_message = {
                "type": "welcome",
                "message": f"Connected to {self.title}",
                "session_active": self.session_active,
                "group_info": student.group_info
            }
            await student.send_message(welcome_message)
            
            # Check for recent prompts (within 10 minutes) and send to late-joining student
            recent_prompt = await self._get_recent_prompt_from_database()
            if recent_prompt:
                print(f"🎤 Sending recent prompt to late-joining student: {user_name}")
                
                # Update current_prompt if we don't have one or this is more recent
                if not self.current_prompt or (
                    recent_prompt.get("sent_at") and 
                    self.current_prompt.get("sent_at") and
                    recent_prompt["sent_at"] > self.current_prompt["sent_at"]
                ):
                    self.current_prompt = recent_prompt
                    print(f"🎤 Updated current_prompt for late-joining student compatibility")
                
                await student.send_message({
                    "type": "prompt_received",
                    "prompt": recent_prompt,
                    "is_late_join": True  # Flag to indicate this is for a late-joining student
                })
            
            # Send group info message if student has group assignment (for late-joining students)
            if student.group_info:
                print(f"🎤 Sending group info message to late-joining student: {user_name}")
                await student.send_message({
                    "type": "group_info",
                    "group_info": student.group_info,
                    "is_late_join": True  # Flag to indicate this is for a late-joining student
                })
            
            # Check if there's an active ready check and send it to late-joining student
            if self.ready_check_active:
                print(f"🎤 Sending active ready check to late-joining student: {user_name}")
                await student.send_message({
                    "type": "ready_check",
                    "message": "Please click 'I'm Ready' when you're ready to continue",
                    "is_late_join": True  # Flag to indicate this is for a late-joining student
                })
            
            # Save to database
            await self._save_student_connection(student)
            
            # Notify teachers of new connection
            await self._notify_teachers_connection_update()
            
            print(f"🎤 Student connected: {user_name} ({user_id})")
            return True
            
        except Exception as e:
            print(f"Error connecting student {user_name}: {e}")
            return False
    
    async def connect_teacher(self, websocket: WebSocket) -> bool:
        """Connect a teacher to the live presentation"""
        try:
            # WebSocket is already accepted in the route handler
            self.teacher_websockets.add(websocket)
            
            # Send current stats
            stats = self.get_presentation_stats()
            await websocket.send_text(json.dumps({
                "type": "teacher_connected",
                "stats": stats,
                "saved_prompts": [prompt.to_dict() for prompt in self.saved_prompts]
            }))
            
            print(f"🎤 Teacher connected to {self.deployment_id}")
            return True
            
        except Exception as e:
            print(f"Error connecting teacher: {e}")
            return False
    
    async def disconnect_student(self, user_id: str):
        """Disconnect a student"""
        if user_id in self.students:
            student = self.students[user_id]
            student.status = ConnectionStatus.DISCONNECTED
            
            # Save disconnection to database
            await self._save_student_connection(student)
            
            del self.students[user_id]
            await self._notify_teachers_connection_update()
            print(f"🎤 Student disconnected: {user_id}")
    
    async def disconnect_teacher(self, websocket: WebSocket):
        """Disconnect a teacher"""
        self.teacher_websockets.discard(websocket)
        print(f"🎤 Teacher disconnected from {self.deployment_id}")
    
    async def handle_student_message(self, user_id: str, message: Dict[str, Any]):
        """Handle incoming message from student"""
        try:
            message_type = message.get("type")
            student = self.students.get(user_id)
            
            if not student:
                return
            
            if message_type == MessageType.STUDENT_READY:
                student.set_ready()
                self.ready_students.add(user_id)
                await self._notify_teachers_connection_update()
                
            elif message_type == MessageType.STUDENT_RESPONSE:
                prompt_id = message.get("prompt_id")
                response_text = message.get("response", "")
                
                if prompt_id:
                    student.add_response(prompt_id, {
                        "response": response_text,
                        "prompt_id": prompt_id
                    })
                    
                    # Save response to database
                    await self._save_student_response(student, prompt_id, response_text)
                    
                    # Notify teachers of new response
                    await self._notify_teachers_response_received(student, prompt_id, response_text)
                    
                    # Check if this completes a group's responses and trigger summary if needed
                    await self._check_group_completion_and_summarize(prompt_id)
            
        except Exception as e:
            print(f"Error handling student message from {user_id}: {e}")
    
    async def handle_teacher_message(self, websocket: WebSocket, message: Dict[str, Any]):
        """Handle incoming message from teacher"""
        try:
            message_type = message.get("type")
            
            if message_type == MessageType.SEND_PROMPT:
                prompt_data = message.get("prompt")
                await self.send_prompt_to_students(prompt_data)
                
            elif message_type == MessageType.SEND_GROUP_INFO:
                await self.send_group_info_to_students()
                
            elif message_type == MessageType.SEND_READY_CHECK:
                await self.start_ready_check()
                
            elif message_type == MessageType.GET_STATS:
                stats = self.get_presentation_stats()
                await websocket.send_text(json.dumps({
                    "type": "stats_update",
                    "stats": stats
                }))
            
            elif message_type == "refresh_variable_data":
                # Manual refresh of variable data from page deployment
                print(f"🔄 Teacher requested manual variable data refresh")
                # This would need to be implemented by the calling context
                await websocket.send_text(json.dumps({
                    "type": "refresh_requested",
                    "message": "Variable data refresh requested - check server logs"
                }))
            
            elif message_type == "diagnose_config":
                # Diagnose the current configuration
                diagnosis = self.diagnose_group_data_issues()
                print(f"🔍 Configuration diagnosis requested:")
                print(f"🔍 Current deployment_id: {self.deployment_id}")
                print(f"🔍 Current input_variable_data: {self.input_variable_data}")
                print(f"🔍 Full diagnosis: {diagnosis}")
                await websocket.send_text(json.dumps({
                    "type": "diagnosis_complete",
                    "message": "Configuration diagnosis complete - check server logs",
                    "diagnosis": diagnosis
                }))
            
            elif message_type == "refresh_group_variables":
                # Manually refresh group variable data
                print(f"🔄 Teacher requested group variable refresh")
                self.refresh_group_variable_data()
                diagnosis = self.diagnose_group_data_issues()
                await websocket.send_text(json.dumps({
                    "type": "group_variables_refreshed",
                    "message": "Group variables refreshed - check server logs",
                    "diagnosis": diagnosis
                }))
            
            elif message_type == "diagnose_list_variables":
                # Diagnose list variable configuration
                print(f"🔍 Teacher requested list variable diagnosis")
                diagnosis = self.diagnose_list_variable_configuration()
                print(f"🔍 List variable diagnosis complete:")
                print(f"    Prompts with list variables: {len(diagnosis['prompts_with_list_variables'])}")
                print(f"    Available list variables: {len(diagnosis['available_list_variables'])}")
                await websocket.send_text(json.dumps({
                    "type": "list_variables_diagnosed",
                    "message": "List variable diagnosis complete - check server logs for details",
                    "diagnosis": diagnosis
                }))
            
            elif message_type == "clear_list_cache":
                # Clear list variable cache
                print(f"🔄 Teacher requested list variable cache clear")
                self.clear_list_variable_cache()
                await websocket.send_text(json.dumps({
                    "type": "list_cache_cleared",
                    "message": "List variable cache cleared - next prompt will reload data fresh"
                }))
            
            elif message_type == "validate_list_configuration":
                # Validate list variable configuration
                print(f"🔍 Teacher requested list variable configuration validation")
                validation = self.validate_list_variable_configuration()
                print(f"🔍 Validation complete: {'✅ VALID' if validation['valid'] else '❌ INVALID'}")
                if validation['errors']:
                    print(f"    Errors: {validation['errors']}")
                if validation['warnings']:
                    print(f"    Warnings: {validation['warnings']}")
                await websocket.send_text(json.dumps({
                    "type": "list_configuration_validated",
                    "message": f"Configuration validation complete: {'Valid' if validation['valid'] else 'Issues found'}",
                    "validation": validation
                }))
                
            elif message_type == "rebuild_variable_mapping":
                # Rebuild variable mapping using workflow data
                print(f"🔄 Teacher requested variable mapping rebuild")
                workflow_data = await self._get_workflow_data_for_mapping()
                if workflow_data and self._parent_page_deployment:
                    self._parent_page_deployment.rebuild_variable_id_mapping(workflow_data)
                    # Clear cache to force fresh lookups
                    self.clear_list_variable_cache()
                    await websocket.send_text(json.dumps({
                        "type": "variable_mapping_rebuilt",
                        "message": "Variable mapping rebuilt successfully - try sending prompts again"
                    }))
                else:
                    await websocket.send_text(json.dumps({
                        "type": "variable_mapping_rebuild_failed", 
                        "message": "Failed to rebuild variable mapping - check server logs for details"
                    }))
            
            elif message_type == "debug_config_structure":
                # Debug the configuration structure to understand what's available
                print(f"🔍 Teacher requested config structure debug")
                debug_info = await self._debug_configuration_structure()
                await websocket.send_text(json.dumps({
                    "type": "config_debug_complete",
                    "message": "Configuration debug complete - check logs for details",
                    "debug_info": debug_info
                }))
        
        except Exception as e:
            print(f"Error handling teacher message: {e}")
    
    async def send_prompt_to_students(self, prompt_data: Dict[str, Any]):
        """Send a prompt to all connected students"""
        if not prompt_data:
            return
        
        prompt_id = prompt_data.get("id", str(uuid.uuid4()))
        self.current_prompt = {
            **prompt_data,
            "id": prompt_id,
            "sent_at": datetime.now().isoformat()
        }
        
        # Save prompt to database for late-joining students
        await self._save_prompt_to_database(self.current_prompt)
        
        # Clean up expired prompts
        await self._cleanup_expired_prompts()
        
        # Check if this prompt uses random list items that should be assigned per group
        use_random_list_item = prompt_data.get("useRandomListItem", False)
        list_variable_id = prompt_data.get("listVariableId")
        
        if use_random_list_item and list_variable_id:
            print(f"🎯 Prompt uses list items - assigning per group from variable: {list_variable_id}")
            await self._send_prompt_with_group_list_items(prompt_data, list_variable_id)
        else:
            # Standard prompt - send same message to all students
            message = {
                "type": "prompt_received",
                "prompt": self.current_prompt
            }
            
            # Send to all connected students
            for student in self.students.values():
                if student.status != ConnectionStatus.DISCONNECTED:
                    await student.send_message(message)
        
        # Save updated session state
        await self._save_session_state()
        
        print(f"🎤 Prompt sent to {len(self.students)} students")
    
    async def _send_prompt_with_group_list_items(self, prompt_data: Dict[str, Any], list_variable_id: str):
        """Send prompt to students with group-specific list items"""
        try:
            # ALWAYS try to get data from the specific variable first (this is the correct approach)
            list_data = None
            
            print(f"🎯 Looking for list data from specific variable: {list_variable_id}")
            
            # First priority: Get data from the specific listVariableId
            if list_variable_id:
                list_data = self._get_list_variable_data(list_variable_id)
                if list_data:
                    print(f"✅ Found list data from variable '{list_variable_id}': {len(list_data)} items")
                else:
                    print(f"⚠️ No data found for variable '{list_variable_id}'")
            
            # Only use fallbacks if NO specific variable was provided
            # This ensures each prompt uses its configured variable, not a fallback
            if not list_data and not list_variable_id:
                print(f"📋 No specific variable provided, trying fallbacks...")
                
                # Fallback 1: Use stored theme data
                if self._theme_data:
                    print(f"📋 Fallback 1: Using stored theme data with {len(self._theme_data)} items")
                    list_data = self._theme_data
                
                # Fallback 2: Use input_variable_data if it's a list
                elif self.input_variable_data and isinstance(self.input_variable_data, list):
                    print(f"📋 Fallback 2: Using theme data from input_variable_data with {len(self.input_variable_data)} items")
                    list_data = self.input_variable_data
                
                # Fallback 3: Try to find any theme data from page deployment variables
                else:
                    print(f"🔍 Fallback 3: Searching for any theme data in page deployment...")
                    theme_data_from_variables = self._try_get_theme_data_from_variables()
                    if theme_data_from_variables:
                        print(f"✅ Found theme data from variables: {len(theme_data_from_variables)} themes")
                        list_data = theme_data_from_variables
            elif not list_data and list_variable_id:
                print(f"❌ Specific variable '{list_variable_id}' was requested but not found. Will not use fallbacks to ensure prompt uses correct data.")
            
            if not list_data or not isinstance(list_data, list):
                print(f"⚠️ No valid list data found for variable: {list_variable_id}")
                # Fallback to sending prompt without list items
                await self._send_standard_prompt_to_all()
                return
            
            print(f"📋 Using list with {len(list_data)} items for group assignment from variable: {list_variable_id}")
            
            # Log a preview of the list items to help with debugging
            if list_data and len(list_data) > 0:
                if isinstance(list_data[0], dict) and 'title' in list_data[0]:
                    # Theme data format
                    preview_items = [item.get('title', 'Untitled') for item in list_data[:3]]
                    print(f"📋 List preview (themes): {preview_items}")
                else:
                    # Other list format
                    preview_items = [str(item)[:50] for item in list_data[:3]]
                    print(f"📋 List preview: {preview_items}")
            
            # IMPORTANT: Ensure students have group assignments before grouping
            # If we have theme data but no group assignments, try to get group data
            await self._ensure_students_have_group_assignments()
            
            # Group students by their group assignment
            groups_to_students = self._group_students_by_assignment()
            
            if not groups_to_students:
                print(f"⚠️ No group assignments found, sending same list item to all students")
                # If no groups, assign the first list item to everyone
                selected_item = list_data[0] if list_data else None
                await self._send_prompt_with_list_item_to_all(prompt_data, selected_item)
                return
            
            print(f"🎯 Found {len(groups_to_students)} groups for list item assignment")
            
            # Assign list items to groups (cycle through list if more groups than items)
            import random
            available_items = list_data.copy()
            random.shuffle(available_items)  # Randomize the list items
            
            group_assignments = {}
            for i, (group_name, students) in enumerate(groups_to_students.items()):
                # Cycle through available items if we have more groups than items
                item_index = i % len(available_items)
                selected_item = available_items[item_index]
                group_assignments[group_name] = selected_item
                
                # Log what's being assigned (truncate for theme data)
                item_preview = str(selected_item)[:100] if not isinstance(selected_item, dict) else selected_item.get('title', 'Theme')
                print(f"📝 {group_name} ({len(students)} students) → List item {item_index + 1}: {item_preview}...")
                
                # Send prompt with this list item to all students in this group
                for student in students:
                    if student.status != ConnectionStatus.DISCONNECTED:
                        message = {
                            "type": "prompt_received",
                            "prompt": {
                                **self.current_prompt,
                                "assigned_list_item": selected_item
                            }
                        }
                        await student.send_message(message)
                        print(f"  📤 Sent theme '{item_preview}' to {student.user_name}")
            
            print(f"✅ Successfully sent prompts with group-specific list items to all students")
            
        except Exception as e:
            print(f"❌ Error sending prompt with group list items: {e}")
            # Fallback to standard prompt
            await self._send_standard_prompt_to_all()
    
    def _get_list_variable_data(self, variable_id: str) -> Optional[List[Any]]:
        """Get list data from a specific variable by ID with caching"""
        if not self._parent_page_deployment:
            print(f"🔍 No parent page deployment available for list variable lookup")
            return None
        
        # Check cache first
        if variable_id in self._list_variable_cache:
            cached_data = self._list_variable_cache[variable_id]
            if cached_data is not None:
                print(f"📋 Using cached data for variable '{variable_id}': {len(cached_data)} items")
            else:
                print(f"📋 Using cached result for variable '{variable_id}': not found/empty")
            return cached_data
        
        try:
            print(f"🔍 Searching for specific variable: '{variable_id}'")
            
            # List all available variables for debugging
            all_variables = self._parent_page_deployment.get_deployment_variables()
            print(f"🔍 Available variables: {[var.name for var in all_variables]}")
            
            # List all LIST type variables specifically
            list_variables = [var for var in all_variables if hasattr(var, 'variable_type') and var.variable_type.value == 'list']
            print(f"🔍 Available LIST variables: {[var.name for var in list_variables]}")
            
            # Get the variable by ID or name (new method supports both)
            variable = self._parent_page_deployment.get_variable_by_id_or_name(variable_id)
            if not variable:
                print(f"❌ Variable '{variable_id}' not found in available variables")
                print(f"🔍 Did you mean one of these LIST variables? {[var.name for var in list_variables]}")
                # Cache the negative result
                self._list_variable_cache[variable_id] = None
                return None
            
            print(f"✅ Found variable '{variable_id}' (type: {getattr(variable, 'variable_type', 'unknown')})")
            
            if variable.is_empty():
                print(f"⚠️ Variable '{variable_id}' is empty")
                # Cache the negative result
                self._list_variable_cache[variable_id] = None
                return None
            
            variable_data = variable.variable_value
            if not isinstance(variable_data, list):
                print(f"⚠️ Variable '{variable_id}' is not a list (type: {type(variable_data)})")
                # Cache the negative result
                self._list_variable_cache[variable_id] = None
                return None
            
            print(f"📋 Successfully retrieved list variable '{variable_id}' with {len(variable_data)} items")
            
            # Cache the positive result
            self._list_variable_cache[variable_id] = variable_data
            
            # Preview the data for debugging
            if variable_data and len(variable_data) > 0:
                if isinstance(variable_data[0], dict) and 'title' in variable_data[0]:
                    preview = [item.get('title', 'Untitled') for item in variable_data[:3]]
                    print(f"📋 Variable '{variable_id}' preview (themes): {preview}")
                else:
                    preview = [str(item)[:30] for item in variable_data[:3]]
                    print(f"📋 Variable '{variable_id}' preview: {preview}")
            
            return variable_data
            
        except Exception as e:
            print(f"❌ Error retrieving list variable '{variable_id}': {e}")
            # Cache the negative result for errors too
            self._list_variable_cache[variable_id] = None
            return None
    
    def clear_list_variable_cache(self):
        """Clear the list variable cache (call when variables are updated)"""
        self._list_variable_cache.clear()
        print(f"🔄 Cleared list variable cache")
    
    def diagnose_list_variable_configuration(self) -> Dict[str, Any]:
        """Diagnose list variable configuration for prompts"""
        diagnosis = {
            "deployment_id": self.deployment_id,
            "parent_page_deployment_available": self._parent_page_deployment is not None,
            "saved_prompts_count": len(self.saved_prompts),
            "prompts_with_list_variables": [],
            "available_list_variables": [],
            "cache_status": {}
        }
        
        # Check saved prompts for list variable usage
        for prompt in self.saved_prompts:
            if prompt.use_random_list_item and prompt.list_variable_id:
                prompt_info = {
                    "prompt_id": prompt.id,
                    "statement_preview": prompt.statement[:100] + "..." if len(prompt.statement) > 100 else prompt.statement,
                    "list_variable_id": prompt.list_variable_id,
                    "variable_exists": False,
                    "variable_has_data": False,
                    "data_preview": None
                }
                
                # Check if the variable exists and has data
                if self._parent_page_deployment:
                    variable = self._parent_page_deployment.get_variable_by_id_or_name(prompt.list_variable_id)
                    if variable:
                        prompt_info["variable_exists"] = True
                        if not variable.is_empty() and isinstance(variable.variable_value, list):
                            prompt_info["variable_has_data"] = True
                            data = variable.variable_value
                            if data and isinstance(data[0], dict) and 'title' in data[0]:
                                prompt_info["data_preview"] = [item.get('title', 'Untitled') for item in data[:3]]
                            else:
                                prompt_info["data_preview"] = [str(item)[:50] for item in data[:3]]
                
                diagnosis["prompts_with_list_variables"].append(prompt_info)
        
        # List available LIST variables
        if self._parent_page_deployment:
            from services.page_service import VariableType
            all_variables = self._parent_page_deployment.get_deployment_variables()
            for variable in all_variables:
                if hasattr(variable, 'variable_type') and variable.variable_type == VariableType.LIST:
                    var_info = {
                        "name": variable.name,
                        "is_empty": variable.is_empty(),
                        "data_type": type(variable.variable_value).__name__ if variable.variable_value else "None",
                        "item_count": len(variable.variable_value) if variable.variable_value and isinstance(variable.variable_value, list) else 0
                    }
                    diagnosis["available_list_variables"].append(var_info)
        
        # Cache status
        diagnosis["cache_status"] = {
            "cached_variables": list(self._list_variable_cache.keys()),
            "cache_size": len(self._list_variable_cache)
        }
        
        return diagnosis
    
    def _try_get_theme_data_from_variables(self) -> Optional[List[Any]]:
        """Try to find theme data from page deployment variables (fallback only)"""
        if not self._parent_page_deployment:
            print(f"🔍 No parent page deployment available for theme data lookup")
            return None
        
        try:
            from services.page_service import VariableType
            
            # Look for LIST type variables that might contain themes
            all_variables = self._parent_page_deployment.get_deployment_variables()
            print(f"🔍 Fallback search: Looking for any theme data in {len(all_variables)} variables")
            
            list_variables = []
            for variable in all_variables:
                if hasattr(variable, 'variable_type') and variable.variable_type == VariableType.LIST:
                    if not variable.is_empty() and variable.variable_value:
                        data = variable.variable_value
                        # Check if this looks like theme data
                        if (isinstance(data, list) and data and 
                            isinstance(data[0], dict) and 'title' in data[0]):
                            list_variables.append((variable.name, data))
                            print(f"🔍 Found potential theme data in variable '{variable.name}': {len(data)} themes")
                        else:
                            print(f"🔍 Variable '{variable.name}' has list data but not theme format")
            
            if list_variables:
                # Return the first theme variable found (this is the old behavior for fallback)
                selected_var_name, selected_data = list_variables[0]
                print(f"⚠️ FALLBACK: Using first available theme variable '{selected_var_name}' with {len(selected_data)} themes")
                if len(list_variables) > 1:
                    other_vars = [name for name, _ in list_variables[1:]]
                    print(f"⚠️ Note: Other theme variables were available but not used: {other_vars}")
                    print(f"⚠️ To use specific themes, configure the prompt's listVariableId properly")
                return selected_data
            
            print(f"⚠️ No theme data found in any page deployment variables")
            return None
            
        except Exception as e:
            print(f"❌ Error searching for theme data: {e}")
            return None
    
    async def _ensure_students_have_group_assignments(self):
        """Ensure students have group assignments, get from database if needed"""
        # Check if any students already have group assignments
        students_with_groups = [s for s in self.students.values() 
                               if s.status != ConnectionStatus.DISCONNECTED and s.group_info]
        
        if students_with_groups:
            print(f"✅ {len(students_with_groups)} students already have group assignments")
            return
        
        print(f"🔍 No students have group assignments, attempting to get group data...")
        
        # Try to get group assignment data from database
        group_data_from_db = self._get_latest_group_assignment_from_database()
        if group_data_from_db:
            print(f"✅ Found group assignment data in database, assigning to students...")
            
            # Set group data directly (this won't overwrite theme data since we check types now)
            previous_data = self.input_variable_data
            self.input_variable_data = group_data_from_db
            
            # Assign group info to all students
            for student in self.students.values():
                if student.status != ConnectionStatus.DISCONNECTED:
                    self._assign_group_info_to_student(student)
            
            print(f"✅ Group assignments completed. Theme data preserved: {self._theme_data is not None}")
        else:
            print(f"⚠️ No group assignment data found in database")
    
    async def _check_group_completion_and_summarize(self, prompt_id: str):
        """Check if any groups have completed all responses for a prompt and generate summaries"""
        try:
            print(f"🎯 Checking group completion for prompt {prompt_id}")
            
            # Group current connected students by their assignments
            groups_to_students = self._group_students_by_assignment()
            
            if not groups_to_students:
                print(f"🔍 No group assignments found, skipping group summary")
                return
            
            # Initialize completion tracking for this prompt if not exists
            if prompt_id not in self._group_completion_status:
                self._group_completion_status[prompt_id] = {}
            
            prompt_completion = self._group_completion_status[prompt_id]
            
            # Check completion status for each group
            for group_name, students_in_group in groups_to_students.items():
                if group_name == "No Group":
                    continue  # Skip students without group assignments
                
                # Initialize group status if not exists
                if group_name not in prompt_completion:
                    prompt_completion[group_name] = {"completed": False, "summary_sent": False}
                
                group_status = prompt_completion[group_name]
                
                # Skip if we already sent a summary for this group
                if group_status["summary_sent"]:
                    continue
                
                # Check if all students in this group have responded
                students_with_responses = [
                    student for student in students_in_group 
                    if (student.status != ConnectionStatus.DISCONNECTED and 
                        prompt_id in student.responses)
                ]
                
                connected_students_in_group = [
                    student for student in students_in_group 
                    if student.status != ConnectionStatus.DISCONNECTED
                ]
                
                print(f"🔍 Group {group_name}: {len(students_with_responses)}/{len(connected_students_in_group)} responded")
                
                # If all connected students in the group have responded, generate summary
                if (len(connected_students_in_group) > 0 and 
                    len(students_with_responses) == len(connected_students_in_group)):
                    
                    print(f"✅ Group {group_name} completed! Generating summary...")
                    group_status["completed"] = True
                    
                    # Generate and send group summary
                    await self._generate_and_send_group_summary(prompt_id, group_name, students_with_responses)
                    group_status["summary_sent"] = True
                    
        except Exception as e:
            print(f"❌ Error checking group completion: {e}")
    
    async def _generate_and_send_group_summary(self, prompt_id: str, group_name: str, students: List["StudentConnection"]):
        """Generate a summary of group responses and send it to all group members"""
        try:
            print(f"🎯 Generating summary for {group_name} (prompt {prompt_id})")
            
            # Notify group members that summary generation has started
            generation_started_message = {
                "type": "summary_generation_started",
                "prompt_id": prompt_id,
                "group_name": group_name
            }
            
            for student in students:
                if student.status != ConnectionStatus.DISCONNECTED:
                    await student.send_message(generation_started_message)
            
            print(f"📢 Notified {group_name} members that summary generation started")
            
            # Get the original prompt text
            prompt_text = "Unknown prompt"
            if self.current_prompt and self.current_prompt.get("id") == prompt_id:
                prompt_text = self.current_prompt.get("statement", "Unknown prompt")
            
            # Prepare student responses for the summarizer
            student_responses = []
            for student in students:
                if prompt_id in student.responses:
                    response_data = student.responses[prompt_id]
                    student_responses.append(StudentResponse(
                        student_id=student.user_id,
                        student_name=student.user_name,
                        response_text=response_data.get("response", ""),
                        group_id=group_name,
                        timestamp=datetime.fromisoformat(response_data.get("timestamp")) if response_data.get("timestamp") else None
                    ))
            
            if not student_responses:
                print(f"⚠️ No valid responses found for {group_name}")
                return
            
            # Create question context
            question_context = QuestionContext(
                question_text=prompt_text,
                question_type="live_presentation_prompt",
                additional_context=f"Live presentation group discussion for {group_name}",
                prompt_id=prompt_id
            )
            
            # Generate summary using the response summarizer (if available)
            if not self._response_summarizer:
                print(f"⚠️ ResponseSummarizer not available, skipping group summary generation")
                return
            
            print(f"🎯 Calling response summarizer for {len(student_responses)} responses...")
            summary_result = await self._response_summarizer.summarize_responses(
                question_context=question_context,
                student_responses=student_responses,
                group_by="all",  # Since we're already processing one group
                summary_style="comprehensive"
            )
            
            # Format group name to add space between "Group" and number (e.g., "Group1" -> "Group 1")
            formatted_group_name = group_name.replace(r'^Group(\d+)$', r'Group \1') if group_name.startswith('Group') else group_name
            if group_name.startswith('Group') and group_name[5:].isdigit():
                formatted_group_name = f"Group {group_name[5:]}"
            else:
                formatted_group_name = group_name
            
            # Prepare summary message for group members
            summary_message = {
                "type": "group_summary",
                "prompt_id": prompt_id,
                "group_name": formatted_group_name,
                "summary": {
                    "text": summary_result.summary_text,
                    "key_themes": summary_result.key_themes,
                    "response_count": summary_result.student_count,
                    "generated_at": summary_result.timestamp.isoformat()
                }
            }
            
            # Send summary to all group members
            sent_count = 0
            for student in students:
                if student.status != ConnectionStatus.DISCONNECTED:
                    await student.send_message(summary_message)
                    sent_count += 1
                    print(f"📤 Sent group summary to {student.user_name}")
            
            print(f"✅ Group summary sent to {sent_count} members of {group_name}")
            
            # Notify teachers about the summary generation
            await self._notify_teachers_group_summary_generated(prompt_id, group_name, summary_result, sent_count)
            
        except Exception as e:
            print(f"❌ Error generating group summary for {group_name}: {e}")
    
    async def _notify_teachers_group_summary_generated(self, prompt_id: str, group_name: str, summary_result, sent_count: int):
        """Notify teachers that a group summary was generated"""
        try:
            message = {
                "type": "group_summary_generated",
                "prompt_id": prompt_id,
                "group_name": group_name,
                "summary": {
                    "text": summary_result.summary_text,
                    "key_themes": summary_result.key_themes,
                    "response_count": summary_result.student_count
                },
                "sent_to_students": sent_count,
                "timestamp": datetime.now().isoformat()
            }
            
            disconnected_teachers = set()
            for teacher_ws in self.teacher_websockets:
                try:
                    await teacher_ws.send_text(json.dumps(message))
                except:
                    disconnected_teachers.add(teacher_ws)
            
            # Remove disconnected teachers
            for teacher_ws in disconnected_teachers:
                self.teacher_websockets.discard(teacher_ws)
                
            print(f"📡 Notified teachers about group summary for {group_name}")
            
        except Exception as e:
            print(f"❌ Error notifying teachers about group summary: {e}")
    
    def _group_students_by_assignment(self) -> Dict[str, List["StudentConnection"]]:
        """Group students by their group assignments"""
        groups = {}
        
        print(f"🔍 Grouping {len(self.students)} students by assignment:")
        
        for student in self.students.values():
            if student.status == ConnectionStatus.DISCONNECTED:
                continue
                
            print(f"  - {student.user_name}: group_info = {student.group_info}")
                
            if student.group_info and student.group_info.get("group_name"):
                group_name = student.group_info["group_name"]
                if group_name not in groups:
                    groups[group_name] = []
                groups[group_name].append(student)
                print(f"    ✅ Assigned to group: {group_name}")
            else:
                # Students without group assignments go to a default group
                if "No Group" not in groups:
                    groups["No Group"] = []
                groups["No Group"].append(student)
                print(f"    ⚠️ No group assignment - added to 'No Group'")
        
        print(f"🔍 Final grouping result: {[(name, len(students)) for name, students in groups.items()]}")
        return groups
    
    async def _send_standard_prompt_to_all(self):
        """Send standard prompt (no list items) to all students"""
        message = {
            "type": "prompt_received",
            "prompt": self.current_prompt
        }
        
        for student in self.students.values():
            if student.status != ConnectionStatus.DISCONNECTED:
                await student.send_message(message)
    
    async def _send_prompt_with_list_item_to_all(self, prompt_data: Dict[str, Any], list_item: Any):
        """Send prompt with the same list item to all students"""
        message = {
            "type": "prompt_received",
            "prompt": {
                **self.current_prompt,
                "assigned_list_item": list_item
            }
        }
        
        for student in self.students.values():
            if student.status != ConnectionStatus.DISCONNECTED:
                await student.send_message(message)
    
    async def send_group_info_to_students(self):
        """Send group information to students"""
        print(f"🎤 Starting send_group_info_to_students")
        print(f"🎤 Connected students: {len([s for s in self.students.values() if s.status != ConnectionStatus.DISCONNECTED])}")
        print(f"🎤 Current input_variable_data: {self.input_variable_data}")
        
        # Try to auto-detect group variables if we don't have data yet
        print(f"🔍 DEBUG send_group_info: input_variable_data is None: {self.input_variable_data is None}")
        print(f"🔍 DEBUG send_group_info: parent_page_deployment exists: {self._parent_page_deployment is not None}")
        print(f"🔍 DEBUG send_group_info: current input_variable_data type: {type(self.input_variable_data)}")
        
        if self.input_variable_data is None:
            if self._parent_page_deployment:
                print(f"🔄 No group data available, attempting auto-detection for send group info")
                self._auto_detect_group_variable()
                
                # If still no data, try database lookup directly
                if self.input_variable_data is None:
                    print(f"🔍 Auto-detection failed, trying direct database lookup...")
                    group_data_from_db = self._get_latest_group_assignment_from_database()
                    if group_data_from_db:
                        self.set_input_variable_data(group_data_from_db)
            else:
                print(f"🔍 No parent page deployment for send_group_info, trying database lookup directly...")
                group_data_from_db = self._get_latest_group_assignment_from_database()
                if group_data_from_db:
                    self.set_input_variable_data(group_data_from_db)
        elif isinstance(self.input_variable_data, list):
            print(f"🔍 Found theme data instead of group data, trying database lookup...")
            group_data_from_db = self._get_latest_group_assignment_from_database()
            if group_data_from_db:
                self.set_input_variable_data(group_data_from_db)
        
        # First, refresh group info for all students based on current variable data
        for student in self.students.values():
            if student.status != ConnectionStatus.DISCONNECTED:
                print(f"🎤 Refreshing group info for student: {student.user_name}")
                self._assign_group_info_to_student(student)
        
        # Now send group info to all connected students
        sent_count = 0
        for student in self.students.values():
            if student.status != ConnectionStatus.DISCONNECTED:
                message = {
                    "type": "group_info",
                    "group_info": student.group_info  # This could be None if student not in any group
                }
                print(f"🎤 Sending message to {student.user_name}: {message}")
                await student.send_message(message)
                sent_count += 1
                
                # Save updated connection to database
                await self._save_student_connection(student)
        
        print(f"🎤 Group info sent to {sent_count} students")
        
        # Print diagnostic information
        diagnosis = self.diagnose_group_data_issues()
        print(f"🔍 Group data diagnosis: {diagnosis}")
        
        # Send confirmation to teachers about the action
        if self.teacher_websockets:
            students_with_groups = sum(1 for s in self.students.values() 
                                     if s.status != ConnectionStatus.DISCONNECTED and s.group_info is not None)
            students_without_groups = sent_count - students_with_groups
            
            result_message = {
                "type": "group_info_sent",
                "message": f"Group info sent to {sent_count} students",
                "students_with_groups": students_with_groups,
                "students_without_groups": students_without_groups,
                "variable_data_available": self.input_variable_data is not None
            }
            
            disconnected_teachers = set()
            for teacher_ws in self.teacher_websockets:
                try:
                    await teacher_ws.send_text(json.dumps(result_message))
                except:
                    disconnected_teachers.add(teacher_ws)
            
            # Remove disconnected teachers
            for teacher_ws in disconnected_teachers:
                self.teacher_websockets.discard(teacher_ws)
    
    async def start_ready_check(self):
        """Start a ready check for all students"""
        self.ready_check_active = True
        self.ready_students.clear()
        
        message = {
            "type": "ready_check",
            "message": "Please click 'I'm Ready' when you're ready to continue"
        }
        
        # Send to all connected students
        for student in self.students.values():
            if student.status != ConnectionStatus.DISCONNECTED:
                student.status = ConnectionStatus.CONNECTED  # Reset status
                await student.send_message(message)
        
        await self._notify_teachers_connection_update()
        
        # Save updated session state
        await self._save_session_state()
        
        print(f"🎤 Ready check started for {len(self.students)} students")
    
    async def _notify_teachers_connection_update(self):
        """Notify all teachers of connection/status updates"""
        stats = self.get_presentation_stats()
        message = {
            "type": "connection_update",
            "stats": stats
        }
        
        disconnected_teachers = set()
        for teacher_ws in self.teacher_websockets:
            try:
                await teacher_ws.send_text(json.dumps(message))
            except:
                disconnected_teachers.add(teacher_ws)
        
        # Remove disconnected teachers
        for teacher_ws in disconnected_teachers:
            self.teacher_websockets.discard(teacher_ws)
    
    async def _notify_teachers_response_received(self, student: StudentConnection, prompt_id: str, response: str):
        """Notify teachers when a student submits a response"""
        message = {
            "type": "student_response_received",
            "student": {
                "user_id": student.user_id,
                "user_name": student.user_name,
                "group_info": student.group_info
            },
            "prompt_id": prompt_id,
            "response": response,
            "timestamp": datetime.now().isoformat()
        }
        
        disconnected_teachers = set()
        for teacher_ws in self.teacher_websockets:
            try:
                await teacher_ws.send_text(json.dumps(message))
            except:
                disconnected_teachers.add(teacher_ws)
        
        # Remove disconnected teachers
        for teacher_ws in disconnected_teachers:
            self.teacher_websockets.discard(teacher_ws)
    
    def get_presentation_stats(self) -> Dict[str, Any]:
        """Get current presentation statistics"""
        total_students = len(self.students)
        connected_students = sum(1 for s in self.students.values() if s.status != ConnectionStatus.DISCONNECTED)
        ready_students = len(self.ready_students)
        
        students_list = [student.to_stats_dict() for student in self.students.values()]
        
        # Group statistics if we have group data
        group_stats = {}
        if self.input_variable_data and isinstance(self.input_variable_data, dict):
            for group_name, members in self.input_variable_data.items():
                if isinstance(members, list):
                    connected_in_group = sum(1 for s in self.students.values() 
                                           if s.group_info and s.group_info.get("group_name") == group_name 
                                           and s.status != ConnectionStatus.DISCONNECTED)
                    group_stats[group_name] = {
                        "total_members": len(members),
                        "connected_members": connected_in_group,
                        "members": members
                    }
        
        return {
            "deployment_id": self.deployment_id,
            "title": self.title,
            "session_active": self.session_active,
            "ready_check_active": self.ready_check_active,
            "total_students": total_students,
            "connected_students": connected_students,
            "ready_students": ready_students,
            "students": students_list,
            "group_stats": group_stats,
            "current_prompt": self.current_prompt,
            "saved_prompts_count": len(self.saved_prompts)
        }
    
    def get_student_responses(self, prompt_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get all student responses, optionally filtered by prompt ID"""
        responses = []
        for student in self.students.values():
            if prompt_id:
                if prompt_id in student.responses:
                    responses.append(student.responses[prompt_id])
            else:
                responses.extend(student.responses.values())
        return responses
    
    def cleanup(self):
        """Cleanup resources"""
        print(f"🎤 LivePresentationDeployment {self.deployment_id} cleaned up")

    def validate_list_variable_configuration(self) -> Dict[str, Any]:
        """Validate that each prompt's list variable configuration is correct"""
        validation_result = {
            "valid": True,
            "errors": [],
            "warnings": [],
            "prompt_validations": []
        }
        
        for prompt in self.saved_prompts:
            if prompt.use_random_list_item:
                prompt_validation = {
                    "prompt_id": prompt.id,
                    "statement_preview": prompt.statement[:50] + "..." if len(prompt.statement) > 50 else prompt.statement,
                    "list_variable_id": prompt.list_variable_id,
                    "valid": True,
                    "issues": []
                }
                
                if not prompt.list_variable_id:
                    prompt_validation["valid"] = False
                    prompt_validation["issues"].append("Prompt uses random list items but no listVariableId is configured")
                    validation_result["errors"].append(f"Prompt '{prompt.id}' missing listVariableId")
                    validation_result["valid"] = False
                else:
                    # Test if the variable can be retrieved
                    test_data = self._get_list_variable_data(prompt.list_variable_id)
                    if test_data is None:
                        prompt_validation["valid"] = False
                        prompt_validation["issues"].append(f"Variable '{prompt.list_variable_id}' not found or empty")
                        validation_result["errors"].append(f"Prompt '{prompt.id}' references missing/empty variable '{prompt.list_variable_id}'")
                        validation_result["valid"] = False
                    else:
                        prompt_validation["issues"].append(f"Successfully validated - variable has {len(test_data)} items")
                
                validation_result["prompt_validations"].append(prompt_validation)
        
        # Check for duplicate variable usage (which is actually okay, but worth noting)
        variable_usage = {}
        for prompt in self.saved_prompts:
            if prompt.use_random_list_item and prompt.list_variable_id:
                if prompt.list_variable_id not in variable_usage:
                    variable_usage[prompt.list_variable_id] = []
                variable_usage[prompt.list_variable_id].append(prompt.id)
        
        for var_id, prompt_ids in variable_usage.items():
            if len(prompt_ids) > 1:
                validation_result["warnings"].append(f"Variable '{var_id}' is used by multiple prompts: {prompt_ids}")
        
        return validation_result
    
    async def _get_workflow_data_for_mapping(self) -> Optional[Dict[str, Any]]:
        """Get workflow data that contains variable mappings"""
        try:
            if not self._db_session:
                print(f"⚠️ No database session available for workflow data lookup")
                return None
            
            # Extract main deployment ID
            main_deployment_id = self.deployment_id.split('_page_')[0] if '_page_' in self.deployment_id else self.deployment_id
            
            from sqlmodel import select
            from models.database.db_models import Deployment, Workflow
            
            # Get the deployment record
            db_deployment = self._db_session.exec(
                select(Deployment).where(
                    Deployment.deployment_id == main_deployment_id,
                    Deployment.is_active == True
                )
            ).first()
            
            if not db_deployment:
                print(f"⚠️ No deployment record found for {main_deployment_id}")
                return None
            
            # Try to get workflow data from different sources
            # PRIORITY: Original Workflow record (contains frontend node structure)
            workflow_data = None
            
            # Source 1: Workflow record (ORIGINAL frontend data with nodes)
            if db_deployment.workflow_id:
                workflow_record = self._db_session.get(Workflow, db_deployment.workflow_id)
                if workflow_record and workflow_record.is_active:
                    workflow_data = workflow_record.workflow_data
                    if workflow_data:
                        print(f"✅ Found ORIGINAL workflow data in workflow record")
                        print(f"🔍 Original workflow keys: {list(workflow_data.keys()) if isinstance(workflow_data, dict) else 'Not a dict'}")
                        return workflow_data
                    else:
                        print(f"⚠️ Workflow record exists but has no workflow_data")
                else:
                    print(f"⚠️ Workflow record {db_deployment.workflow_id} not found or inactive")
            else:
                print(f"⚠️ No workflow_id in deployment record")
            
            # Source 2: __workflow_nodes__ in deployment config (processed version)
            if isinstance(db_deployment.config, dict):
                workflow_data = db_deployment.config.get("__workflow_nodes__")
                if workflow_data:
                    print(f"⚠️ Using PROCESSED workflow data from deployment config (__workflow_nodes__)")
                    return workflow_data
            
            # Source 3: Deployment config itself (most processed)
            if isinstance(db_deployment.config, dict):
                print(f"⚠️ Using MOST PROCESSED deployment config as fallback")
                return db_deployment.config
            
            print(f"⚠️ No workflow data found in any source")
            return None
            
        except Exception as e:
            print(f"❌ Error getting workflow data: {e}")
            return None
    
    async def _debug_configuration_structure(self) -> Dict[str, Any]:
        """Debug the configuration structure to understand what's available"""
        debug_info = {
            "deployment_id": self.deployment_id,
            "parent_page_deployment_available": self._parent_page_deployment is not None,
            "config_structure": {},
            "workflow_data_sources": []
        }
        
        try:
            if not self._db_session:
                debug_info["error"] = "No database session available"
                return debug_info
            
            # Extract main deployment ID
            main_deployment_id = self.deployment_id.split('_page_')[0] if '_page_' in self.deployment_id else self.deployment_id
            
            from sqlmodel import select
            from models.database.db_models import Deployment, Workflow
            
            # Get the deployment record
            db_deployment = self._db_session.exec(
                select(Deployment).where(
                    Deployment.deployment_id == main_deployment_id,
                    Deployment.is_active == True
                )
            ).first()
            
            if not db_deployment:
                debug_info["error"] = f"No deployment record found for {main_deployment_id}"
                return debug_info
            
            debug_info["deployment_record"] = {
                "workflow_id": db_deployment.workflow_id,
                "config_type": type(db_deployment.config).__name__,
                "config_keys": list(db_deployment.config.keys()) if isinstance(db_deployment.config, dict) else "Not a dict"
            }
            
            # Check Source 1: __workflow_nodes__ in deployment config
            if isinstance(db_deployment.config, dict):
                workflow_nodes = db_deployment.config.get("__workflow_nodes__")
                if workflow_nodes:
                    debug_info["workflow_data_sources"].append("deployment.config.__workflow_nodes__")
                    debug_info["config_structure"]["__workflow_nodes__"] = {
                        "type": type(workflow_nodes).__name__,
                        "keys": list(workflow_nodes.keys()) if isinstance(workflow_nodes, dict) else "Not a dict"
                    }
                    
                    # Check for global variables nodes
                    if isinstance(workflow_nodes, dict):
                        for node_id, node_data in workflow_nodes.items():
                            if isinstance(node_data, dict) and node_data.get("type") == "globalVariables":
                                debug_info["config_structure"]["globalVariables_found"] = {
                                    "node_id": node_id,
                                    "config_keys": list(node_data.get("config", {}).keys()),
                                    "variables_count": len(node_data.get("config", {}).get("variables", []))
                                }
            
            # Check Source 2: Workflow record
            if db_deployment.workflow_id:
                workflow_record = self._db_session.get(Workflow, db_deployment.workflow_id)
                if workflow_record and workflow_record.is_active:
                    debug_info["workflow_data_sources"].append("workflow_record.workflow_data")
                    debug_info["workflow_record"] = {
                        "name": workflow_record.name,
                        "workflow_data_type": type(workflow_record.workflow_data).__name__,
                        "workflow_data_keys": list(workflow_record.workflow_data.keys()) if isinstance(workflow_record.workflow_data, dict) else "Not a dict"
                    }
            
            # Check Source 3: Direct deployment config
            debug_info["workflow_data_sources"].append("deployment.config (direct)")
            
            print(f"🔍 DEBUG: Configuration structure analysis complete")
            print(f"   Sources available: {debug_info['workflow_data_sources']}")
            if "globalVariables_found" in debug_info["config_structure"]:
                print(f"   Global variables found: {debug_info['config_structure']['globalVariables_found']}")
            
            return debug_info
            
        except Exception as e:
            debug_info["error"] = f"Error during debug: {str(e)}"
            print(f"❌ Error during configuration debug: {e}")
            return debug_info

    @classmethod
    def from_config(cls, config: Dict[str, Any], deployment_id: str) -> "LivePresentationDeployment":
        """Create LivePresentationDeployment from page config"""
        # Extract the live presentation config from node 1
        live_presentation_config = config.get("1", {}).get("config", {})
        
        # Extract prompts from node 2 if it exists
        prompts_config = config.get("2", {}).get("config", {})
        saved_prompts = prompts_config.get("saved_prompts", [])
        
        # Combine configurations
        combined_config = {
            **live_presentation_config,
            "saved_prompts": saved_prompts
        }
        
        return cls(combined_config, deployment_id)
