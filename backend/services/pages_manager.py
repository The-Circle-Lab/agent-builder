from typing import Dict, Any, Optional, List
import uuid
from datetime import datetime, timezone
from sqlmodel import Session as DBSession, select
from models.database.db_models import (
    Deployment, 
    PageDeploymentState, 
    PageDeploymentVariable, 
    BehaviorExecutionHistory,
    User
)
from services.page_service import PageDeployment, DeploymentVariable, VariableType

# Store active page deployments with state
ACTIVE_PAGE_DEPLOYMENTS: Dict[str, Dict[str, Any]] = {}

async def load_page_deployment_on_demand(deployment_id: str, user_id: int, db: DBSession) -> bool:
    """Load a page deployment on demand from database with full state restoration"""
    if deployment_id in ACTIVE_PAGE_DEPLOYMENTS:
        return True  # Already loaded
    
    try:
        # Get the main deployment record
        db_deployment = db.exec(
            select(Deployment).where(
                Deployment.deployment_id == deployment_id,
                Deployment.is_active == True,
                Deployment.is_page_based == True,
                Deployment.parent_deployment_id == None  # Main deployment, not a page
            )
        ).first()
        
        if not db_deployment:
            return False

        # Get workflow data
        workflow_data = db_deployment.config.get("__workflow_nodes__") if isinstance(db_deployment.config, dict) else None

        if workflow_data is None:
            from models.database.db_models import Workflow 
            workflow_record: "Workflow" | None = db.get(Workflow, db_deployment.workflow_id)
            workflow_data = (
                workflow_record.workflow_data if (workflow_record and workflow_record.is_active) else None
            )

        if workflow_data is None:
            workflow_data = db_deployment.config

        # Create PageDeployment instance
        page_deployment = PageDeployment(
            deployment_id=db_deployment.deployment_id,
            config=workflow_data,
            collection_name=db_deployment.collection_name,
        )
        
        # Set database session for variable persistence
        page_deployment.set_database_session(db)
        
        # Restore state from database
        await restore_page_deployment_state(page_deployment, db)
        
        # Store in memory (don't store db session - get fresh one when needed)
        ACTIVE_PAGE_DEPLOYMENTS[deployment_id] = {
            "user_id": db_deployment.user_id,
            "workflow_name": db_deployment.workflow_name,
            "config": db_deployment.config,
            "page_deployment": page_deployment,
            "created_at": db_deployment.created_at.isoformat(),
            "type": db_deployment.type,
            "is_page_based": True,
            "page_count": page_deployment.get_page_count()
        }
        
        # Also register individual page deployments in ACTIVE_DEPLOYMENTS for compatibility
        from services.deployment_manager import add_active_deployment, is_deployment_active
        for page_idx, page_deploy in enumerate(page_deployment.get_deployment_list()):
            page_deployment_id = page_deploy.deployment_id
            
            # Only register if not already active to prevent duplicate registrations
            if not is_deployment_active(page_deployment_id):
                # Set up database persistence for Live Presentation pages
                if page_deploy.get_deployment_type() == "livePresentation":
                    page_deploy.set_database_session(db)
                    await page_deploy.restore_live_presentation_state()
                    print(f"🎤 Set up persistence for Live Presentation page {page_idx + 1}: {page_deployment_id}")
                
                add_active_deployment(page_deployment_id, {
                    "user_id": db_deployment.user_id,
                    "workflow_name": f"{db_deployment.workflow_name} - Page {page_idx + 1}",
                    "config": db_deployment.config,
                    "mcp_deployment": page_deploy,
                    "created_at": db_deployment.created_at.isoformat(),
                    "chat_history": [],
                    "type": page_deploy.get_deployment_type(),
                    "is_page_based": True,
                    "parent_deployment_id": db_deployment.deployment_id,
                    "page_number": page_idx + 1
                })
                print(f"🎤 Registered page deployment {page_deployment_id} in ACTIVE_DEPLOYMENTS via pages_manager")
            else:
                print(f"🎤 Page deployment {page_deployment_id} already active, skipping registration in pages_manager")
        
        print(f"Loaded page deployment {deployment_id} with restored state for user {user_id}")
        print(f"Registered {page_deployment.get_page_count()} individual page deployments")
        return True
        
    except Exception as e:
        print(f"Failed to load page deployment {deployment_id} on-demand: {e}")
        # Mark as inactive if it can't be loaded
        try:
            db_deployment = db.exec(
                select(Deployment).where(
                    Deployment.deployment_id == deployment_id
                )
            ).first()
            if db_deployment:
                db_deployment.is_active = False
                db.add(db_deployment)
                db.commit()
        except Exception as update_error:
            print(f"Failed to mark page deployment as inactive: {update_error}")
        
        return False

async def restore_page_deployment_state(page_deployment: PageDeployment, db: DBSession) -> None:
    """Restore page deployment state from database"""
    try:
        # Get page deployment state record
        page_state = db.exec(
            select(PageDeploymentState).where(
                PageDeploymentState.deployment_id == page_deployment.deployment_id,
                PageDeploymentState.is_active == True
            )
        ).first()
        
        if not page_state:
            # No state saved yet, create one with defaults
            await save_page_deployment_state(page_deployment, db)
            return
        
        # Restore pages_accessible setting
        page_deployment.set_pages_accessible(page_state.pages_accessible)
        
        # Restore variables
        db_variables = db.exec(
            select(PageDeploymentVariable).where(
                PageDeploymentVariable.page_deployment_id == page_state.id,
                PageDeploymentVariable.is_active == True
            )
        ).all()
        
        for db_var in db_variables:
            # Find the corresponding variable in page_deployment
            for variable in page_deployment.deployment_variables:
                if variable.name == db_var.name:
                    # Restore the value
                    variable.set_value(db_var.variable_value)
                    break
        
        print(f"Restored state for page deployment {page_deployment.deployment_id}: {len(db_variables)} variables")
        
    except Exception as e:
        print(f"Error restoring page deployment state: {e}")

async def save_page_deployment_state(page_deployment: PageDeployment, db: DBSession) -> None:
    """Save page deployment state to database"""
    try:
        # Get or create page deployment state record
        page_state = db.exec(
            select(PageDeploymentState).where(
                PageDeploymentState.deployment_id == page_deployment.deployment_id,
                PageDeploymentState.is_active == True
            )
        ).first()
        
        if not page_state:
            page_state = PageDeploymentState(
                deployment_id=page_deployment.deployment_id,
                pages_accessible=page_deployment.get_pages_accessible()
            )
            db.add(page_state)
            db.commit()
            db.refresh(page_state)
        else:
            # Update existing state
            page_state.pages_accessible = page_deployment.get_pages_accessible()
            page_state.updated_at = datetime.now(timezone.utc)
            db.add(page_state)
            db.commit()
        
        # Save/update variables
        for variable in page_deployment.deployment_variables:
            # Get existing variable record
            db_variable = db.exec(
                select(PageDeploymentVariable).where(
                    PageDeploymentVariable.page_deployment_id == page_state.id,
                    PageDeploymentVariable.name == variable.name,
                    PageDeploymentVariable.is_active == True
                )
            ).first()
            
            if not db_variable:
                # Create new variable record
                db_variable = PageDeploymentVariable(
                    page_deployment_id=page_state.id,
                    name=variable.name,
                    variable_type=variable.variable_type.value,
                    variable_value=variable.variable_value
                )
                db.add(db_variable)
            else:
                # Update existing variable
                db_variable.variable_value = variable.variable_value
                db_variable.updated_at = datetime.now(timezone.utc)
                db.add(db_variable)
        
        db.commit()
        print(f"Saved state for page deployment {page_deployment.deployment_id}")
        
    except Exception as e:
        print(f"Error saving page deployment state: {e}")
        db.rollback()

async def save_behavior_execution(
    page_deployment: PageDeployment, 
    db: DBSession,
    behavior_number: str,
    behavior_type: str,
    executed_by_user_id: int,
    success: bool,
    execution_time_seconds: float,
    execution_result: Dict[str, Any],
    error_message: Optional[str] = None,
    student_data: Optional[List[Dict[str, Any]]] = None
) -> str:
    """Save behavior execution history to database"""
    try:
        # Get page deployment state
        page_state = db.exec(
            select(PageDeploymentState).where(
                PageDeploymentState.deployment_id == page_deployment.deployment_id,
                PageDeploymentState.is_active == True
            )
        ).first()
        
        if not page_state:
            # Create state if it doesn't exist
            await save_page_deployment_state(page_deployment, db)
            page_state = db.exec(
                select(PageDeploymentState).where(
                    PageDeploymentState.deployment_id == page_deployment.deployment_id,
                    PageDeploymentState.is_active == True
                )
            ).first()
        
        execution_id = str(uuid.uuid4())
        
        # Calculate themes created for theme creator behaviors
        themes_created = None
        if behavior_type == "themeCreator" and "themes" in execution_result:
            themes_created = len(execution_result["themes"])
            print(f"🎯 Setting output_themes_created to {themes_created}")
        
        # Create behavior execution record
        execution_record = BehaviorExecutionHistory(
            page_deployment_id=page_state.id,
            execution_id=execution_id,
            behavior_number=behavior_number,
            behavior_type=behavior_type,
            executed_by_user_id=executed_by_user_id,
            success=success,
            execution_time_seconds=execution_time_seconds,
            input_student_count=execution_result.get("input_student_count"),
            output_groups_created=execution_result.get("output_groups_created"),
            output_themes_created=themes_created or execution_result.get("output_themes_created"),
            variable_written=execution_result.get("output_written_to_variable"),
            error_message=error_message,
            execution_result=execution_result
        )
        
        db.add(execution_record)
        db.commit()
        
        # If this is a successful group behavior execution, save the group data
        print(f"🔍 CHECKING GROUP SAVE CONDITIONS:")
        print(f"   Success: {success}")
        print(f"   Behavior type: {behavior_type}")
        print(f"   Has groups: {'groups' in execution_result}")
        print(f"   Has student data: {student_data is not None}")
        print(f"   Execution result keys: {list(execution_result.keys())}")
        
        # For group behaviors, we don't need student_data parameter since the group data contains all necessary info
        if (success and 
            behavior_type == "group" and 
            "groups" in execution_result):
            
            groups_data = execution_result.get("groups", {})
            explanations_data = execution_result.get("explanations", {})
            metadata = execution_result.get("metadata", {})
            
            print(f"🔍 GROUP SAVE DATA EXTRACTED:")
            print(f"   Groups: {list(groups_data.keys()) if groups_data else 'None'}")
            print(f"   Explanations: {list(explanations_data.keys()) if explanations_data else 'None'}")
            print(f"   Metadata: {metadata}")
            
            group_assignment_id = await save_group_assignment_to_database(
                execution_id=execution_id,
                page_deployment_id=page_state.id,
                groups_data=groups_data,
                explanations_data=explanations_data,
                student_data=None,  # Not needed for group save - all data is in groups_data
                metadata=metadata,
                db=db
            )
            
            if group_assignment_id:
                print(f"✅ Saved group assignment data with ID: {group_assignment_id}")
                
                # Output groups to the correct variable (new variable system)
                behavior_id = execution_result.get('behavior_id', f"{page_state.deployment_id}_behavior_1")
                # Extract page number from behavior_id (format: "uuid_behavior_2" -> "2")
                behavior_page_number = behavior_id.split('_behavior_')[-1] if '_behavior_' in behavior_id else '1'
                behavior_variable_name = f"group_{behavior_page_number}"
                print(f"🔍 OUTPUTTING GROUPS TO VARIABLE: {behavior_variable_name} (extracted from behavior_id: {behavior_id})")
                
                # Set the group variable with the groups data
                page_deployment.set_variable_value(behavior_variable_name, groups_data)
                print(f"✅ Set variable '{behavior_variable_name}' with {len(groups_data)} groups")
            else:
                print("❌ Failed to save group assignment data")
        else:
            print("❌ GROUP SAVE CONDITIONS NOT MET - skipping group database save")
        
        # If this is a successful theme behavior execution, save the theme data
        if (success and 
            behavior_type == "themeCreator" and 
            "themes" in execution_result and
              execution_result["themes"] and
              len(execution_result["themes"]) > 0):
            
            print(f"🎯 THEME CREATOR DETECTED: Attempting to save theme assignment to database")
            print(f"   Themes count: {len(execution_result.get('themes', []))}")
            print(f"   Student data available: {student_data is not None}")
            print(f"   Student data count: {len(student_data) if student_data else 'None'}")
            print(f"   Execution ID: {execution_id}")
            
            themes_data = execution_result.get("themes", [])
            metadata = execution_result.get("metadata", {})
            
            # Handle missing student_data by creating fallback data or using empty list
            effective_student_data = student_data
            if not effective_student_data:
                # Try to reconstruct basic student data from metadata
                total_students = metadata.get("total_students", 0)
                if total_students > 0:
                    # Create minimal student data structure for database saving
                    effective_student_data = [
                        {"name": f"student_{i+1}@example.com", "text": f"Student {i+1} submission"} 
                        for i in range(total_students)
                    ]
                    print(f"🎯 Created fallback student data for {total_students} students")
                else:
                    # Use empty list as fallback
                    effective_student_data = []
                    print(f"🎯 Using empty student data as fallback")
            
            theme_assignment_id = await save_theme_assignment_to_database(
                execution_id=execution_id,
                page_deployment_id=page_state.id,
                themes_data=themes_data,
                student_data=effective_student_data,
                metadata=metadata,
                db=db
            )
            
            if theme_assignment_id:
                print(f"✅ Saved theme assignment data with ID: {theme_assignment_id}")
                
                # Output themes to the correct variable (new variable system)
                behavior_id = execution_result.get('behavior_id', f"{page_state.deployment_id}_behavior_2")
                # Extract page number from behavior_id (format: "uuid_behavior_2" -> "2")
                behavior_page_number = behavior_id.split('_behavior_')[-1] if '_behavior_' in behavior_id else '2'
                behavior_variable_name = f"theme_{behavior_page_number}"
                print(f"🔍 OUTPUTTING THEMES TO VARIABLE: {behavior_variable_name} (extracted from behavior_id: {behavior_id})")
                
                # Set the theme variable with the themes data
                page_deployment.set_variable_value(behavior_variable_name, themes_data)
                print(f"✅ Set variable '{behavior_variable_name}' with {len(themes_data)} themes")
            else:
                print("❌ Failed to save theme assignment data")
        
        print(f"Saved behavior execution {execution_id} for deployment {page_deployment.deployment_id}")
        return execution_id
        
    except Exception as e:
        print(f"Error saving behavior execution: {e}")
        db.rollback()
        return ""

async def save_group_assignment_to_database(
    execution_id: str,
    page_deployment_id: int,
    groups_data: Dict[str, List[str]],
    explanations_data: Optional[Dict[str, str]],
    student_data: List[Dict[str, Any]],
    metadata: Dict[str, Any],
    db: DBSession
) -> Optional[int]:
    """
    Save group assignment results to the database.
    
    Args:
        execution_id: The behavior execution ID
        page_deployment_id: The page deployment state ID
        groups_data: Dictionary mapping group names to lists of student names
        explanations_data: Dictionary mapping group names to explanations
        student_data: Original student data with names and text
        metadata: Metadata from the group assignment
        db: Database session
        
    Returns:
        ID of the created GroupAssignment record, or None if failed
    """
    try:
        from models.database.grouping_models import GroupAssignment, Group, GroupMember
        
        # Create the main group assignment record
        group_assignment = GroupAssignment(
            execution_id=execution_id,
            page_deployment_id=page_deployment_id,
            total_students=metadata.get("total_students", 0),  # Use metadata count since student_data may be None
            total_groups=metadata.get("total_groups", len(groups_data)),
            group_size_target=metadata.get("group_size_target", 4),
            grouping_method=metadata.get("grouping_method", "mixed"),
            includes_explanations=metadata.get("includes_explanations", False)
        )
        
        db.add(group_assignment)
        db.commit()
        db.refresh(group_assignment)
        
        print(f"Created group assignment record with ID: {group_assignment.id}")
        
        # Create a lookup for student data (handle None case)
        student_lookup = {}
        if student_data:
            student_lookup = {student["name"]: student.get("text", "") for student in student_data}
        print(f"💾 STUDENT LOOKUP: {len(student_lookup)} entries")
        
        # Create group records
        print(f"💾 SAVING GROUPS TO DATABASE: {len(groups_data)} groups")
        print(f"💾 EXPLANATIONS DATA: {explanations_data}")
        
        for group_number, (group_name, member_names) in enumerate(groups_data.items(), 1):
            explanation = explanations_data.get(group_name) if explanations_data else None
            print(f"💾 Group '{group_name}' explanation: {explanation[:100] if explanation else 'None'}...")
            
            group = Group(
                assignment_id=group_assignment.id,
                group_name=group_name,
                group_number=group_number,
                explanation=explanation
            )
            
            db.add(group)
            db.commit()
            db.refresh(group)
            
            print(f"✅ Created group '{group_name}' with ID: {group.id} and explanation: {bool(explanation)}")
            
            # Create group member records
            for member_name in member_names:
                member = GroupMember(
                    group_id=group.id,
                    student_name=member_name,
                    student_text=student_lookup.get(member_name, "")
                )
                
                db.add(member)
            
            db.commit()
            print(f"Added {len(member_names)} members to group '{group_name}'")
        
        print(f"Successfully saved group assignment with {len(groups_data)} groups to database")
        return group_assignment.id
        
    except Exception as e:
        print(f"Error saving group assignment to database: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        return None


async def save_theme_assignment_to_database(
    execution_id: str,
    page_deployment_id: int,
    themes_data: List[Dict[str, Any]],
    student_data: List[Dict[str, Any]],
    metadata: Dict[str, Any],
    db: DBSession
) -> Optional[int]:
    """
    Save theme assignment results to the database.
    
    Args:
        execution_id: The behavior execution ID
        page_deployment_id: The page deployment state ID
        themes_data: List of theme dictionaries
        student_data: Original student data with names and text
        metadata: Metadata from the theme assignment
        db: Database session
        
    Returns:
        ID of the created ThemeAssignment record, or None if failed
    """
    try:
        from models.database.theme_models import (
            ThemeAssignment, Theme, ThemeKeyword, ThemeSnippet, ThemeStudentAssociation
        )
        from datetime import datetime, timezone
        
        # Create the main theme assignment record
        theme_assignment = ThemeAssignment(
            execution_id=execution_id,
            page_deployment_id=page_deployment_id,
            total_students=metadata.get("total_students", 0),  # Use metadata count since student_data may be None
            total_themes=metadata.get("total_themes", len(themes_data)),
            num_themes_target=metadata.get("requested_themes", len(themes_data)),
            clustering_method=metadata.get("clustering_method", "kmeans"),
            includes_llm_polish=metadata.get("includes_llm_polish", False),
            llm_polish_prompt=metadata.get("llm_polish_prompt"),
            created_at=datetime.now(timezone.utc)
        )
        
        db.add(theme_assignment)
        db.commit()
        db.refresh(theme_assignment)
        
        print(f"Created theme assignment record with ID: {theme_assignment.id}")
        
        # Create a lookup for student data (handle None case)
        student_lookup = {}
        if student_data:
            student_lookup = {student["name"]: student.get("text", "") for student in student_data}
        print(f"💾 STUDENT LOOKUP: {len(student_lookup)} entries")
        
        # Create theme records
        for theme_data in themes_data:
            theme = Theme(
                assignment_id=theme_assignment.id,
                title=theme_data.get('title', 'Untitled'),
                description=theme_data.get('description', ''),
                cluster_id=theme_data.get('cluster_id', 0),
                document_count=theme_data.get('document_count', 0),
                student_count=theme_data.get('student_count', 0),
                created_at=datetime.now(timezone.utc)
            )
            
            db.add(theme)
            db.commit()
            db.refresh(theme)
            
            print(f"Created theme '{theme.title}' with ID: {theme.id}")
            
            # Create keyword records
            keywords = theme_data.get('keywords', [])
            for i, keyword in enumerate(keywords[:10]):  # Limit to top 10 keywords
                theme_keyword = ThemeKeyword(
                    theme_id=theme.id,
                    keyword=keyword,
                    order_index=i,
                    created_at=datetime.now(timezone.utc)
                )
                db.add(theme_keyword)
            
            # Create snippet records
            snippets = theme_data.get('snippets', [])
            for i, snippet in enumerate(snippets[:5]):  # Limit to top 5 snippets
                theme_snippet = ThemeSnippet(
                    theme_id=theme.id,
                    text=snippet[:500],  # Truncate if too long
                    order_index=i,
                    created_at=datetime.now(timezone.utc)
                )
                db.add(theme_snippet)
            
            # Create student association records
            student_names = theme_data.get('student_names', [])
            for student_name in student_names:
                student_text = student_lookup.get(student_name, '')
                
                theme_student_association = ThemeStudentAssociation(
                    theme_id=theme.id,
                    student_name=student_name,
                    student_text=student_text[:5000] if student_text else None,  # Truncate if too long
                    created_at=datetime.now(timezone.utc)
                )
                db.add(theme_student_association)
            
            # Commit theme and related records
            db.commit()
        
        print(f"Successfully saved theme assignment with {len(themes_data)} themes")
        return theme_assignment.id
        
    except Exception as e:
        print(f"Error saving theme assignment: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        return None

def get_active_page_deployment(deployment_id: str) -> Optional[Dict[str, Any]]:
    """Get active page deployment from memory"""
    return ACTIVE_PAGE_DEPLOYMENTS.get(deployment_id)

def add_active_page_deployment(deployment_id: str, deployment_data: Dict[str, Any]) -> None:
    """Add page deployment to active deployments"""
    ACTIVE_PAGE_DEPLOYMENTS[deployment_id] = deployment_data

def remove_active_page_deployment(deployment_id: str) -> None:
    """Remove page deployment from active deployments"""
    if deployment_id in ACTIVE_PAGE_DEPLOYMENTS:
        # Also remove individual page deployments from ACTIVE_DEPLOYMENTS
        from services.deployment_manager import remove_active_deployment
        deployment_info = ACTIVE_PAGE_DEPLOYMENTS[deployment_id]
        page_deployment = deployment_info.get("page_deployment")
        
        if page_deployment:
            for page_deploy in page_deployment.get_deployment_list():
                remove_active_deployment(page_deploy.deployment_id)
        
        del ACTIVE_PAGE_DEPLOYMENTS[deployment_id]

def is_page_deployment_active(deployment_id: str) -> bool:
    """Check if page deployment is currently loaded in memory"""
    return deployment_id in ACTIVE_PAGE_DEPLOYMENTS

async def update_page_deployment_variable(
    deployment_id: str, 
    variable_name: str, 
    variable_value: Any,
    db: DBSession
) -> bool:
    """Update a specific variable in the page deployment and persist to database"""
    try:
        deployment_info = get_active_page_deployment(deployment_id)
        if not deployment_info:
            return False
        
        page_deployment = deployment_info["page_deployment"]
        
        # Update in memory
        success = page_deployment.set_variable_value(variable_name, variable_value)
        if not success:
            return False
        
        # Persist to database
        await save_page_deployment_state(page_deployment, db)
        
        return True
        
    except Exception as e:
        print(f"Error updating page deployment variable: {e}")
        return False

async def get_behavior_execution_history(
    deployment_id: str, 
    db: DBSession,
    behavior_number: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Get behavior execution history for a page deployment"""
    try:
        page_state = db.exec(
            select(PageDeploymentState).where(
                PageDeploymentState.deployment_id == deployment_id,
                PageDeploymentState.is_active == True
            )
        ).first()
        
        if not page_state:
            return []
        
        query = select(BehaviorExecutionHistory).where(
            BehaviorExecutionHistory.page_deployment_id == page_state.id
        )
        
        if behavior_number:
            query = query.where(BehaviorExecutionHistory.behavior_number == behavior_number)
        
        executions = db.exec(query.order_by(BehaviorExecutionHistory.executed_at.desc())).all()
        
        result = []
        for execution in executions:
            result.append({
                "execution_id": execution.execution_id,
                "behavior_number": execution.behavior_number,
                "behavior_type": execution.behavior_type,
                "executed_at": execution.executed_at,
                "executed_by_user_id": execution.executed_by_user_id,
                "success": execution.success,
                "execution_time_seconds": execution.execution_time_seconds,
                "input_student_count": execution.input_student_count,
                "output_groups_created": execution.output_groups_created,
                "variable_written": execution.variable_written,
                "error_message": execution.error_message,
                "execution_result": execution.execution_result
            })
        
        return result
        
    except Exception as e:
        print(f"Error getting behavior execution history: {e}")
        return []

async def cleanup_all_page_deployments():
    """Cleanup function on server shutdown"""
    from services.deployment_manager import remove_active_deployment
    
    for deployment_id, deployment in ACTIVE_PAGE_DEPLOYMENTS.items():
        try:
            page_deployment = deployment.get("page_deployment")
            if page_deployment:
                # Clean up individual page deployments from ACTIVE_DEPLOYMENTS
                for page_deploy in page_deployment.get_deployment_list():
                    remove_active_deployment(page_deploy.deployment_id)
                
                # Clean up the page deployment itself
                page_deployment.cleanup_all_pages()
        except Exception as e:
            print(f"Error cleaning up page deployment {deployment_id}: {e}")
    
    ACTIVE_PAGE_DEPLOYMENTS.clear()
    print("All page deployments cleaned up. Page deployment states remain in database for restart.")

async def set_pages_accessible(deployment_id: str, pages_accessible: int, db: DBSession) -> bool:
    """Set the number of pages accessible to students and persist to database"""
    try:
        deployment_info = get_active_page_deployment(deployment_id)
        if not deployment_info:
            return False
        
        page_deployment = deployment_info["page_deployment"]
        page_deployment.set_pages_accessible(pages_accessible)
        
        # Persist to database
        await save_page_deployment_state(page_deployment, db)
        
        return True
        
    except Exception as e:
        print(f"Error setting pages accessible: {e}")
        return False 
