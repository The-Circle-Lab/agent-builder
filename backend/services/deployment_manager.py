from typing import Dict, Any
from sqlmodel import Session as DBSession, select
from models.database.db_models import Deployment
from services.deployment_service import AgentDeployment
from services.page_service import PageDeployment
from datetime import datetime, timezone
from services.pages_manager import (
    load_page_deployment_on_demand, 
    get_active_page_deployment,
    add_active_page_deployment,
    cleanup_all_page_deployments
)

# Store active deployments with MCP sessions
ACTIVE_DEPLOYMENTS: Dict[str, Dict[str, Any]] = {}

async def load_deployment_on_demand(deployment_id: str, user_id: int, db: DBSession) -> bool:
    if deployment_id in ACTIVE_DEPLOYMENTS:
        print(f"🎤 Deployment {deployment_id} already loaded in ACTIVE_DEPLOYMENTS")
        return True  # Already loaded
    
    try:
        db_deployment = db.exec(
            select(Deployment).where(
                Deployment.deployment_id == deployment_id,
                Deployment.is_active == True,
                Deployment.is_open == True
            )
        ).first()
        
        if not db_deployment:
            return False
        

        workflow_data = db_deployment.config.get("__workflow_nodes__") if isinstance(db_deployment.config, dict) else None

        if workflow_data is None:
            from models.database.db_models import Workflow 

            workflow_record: "Workflow" | None = db.get(Workflow, db_deployment.workflow_id)

            workflow_data = (
                workflow_record.workflow_data if (workflow_record and workflow_record.is_active) else None
            )

        if workflow_data is None:
            workflow_data = db_deployment.config

        # Check if this is a page-based deployment
        if db_deployment.is_page_based and db_deployment.parent_deployment_id is None:
            # This is a main page deployment, delegate to pages_manager
            success = await load_page_deployment_on_demand(deployment_id, user_id, db)
            if not success:
                return False
            
            # Get the loaded page deployment from pages_manager
            page_deployment_info = get_active_page_deployment(deployment_id)
            if not page_deployment_info:
                return False
            
            # Also register individual page deployments in ACTIVE_DEPLOYMENTS for compatibility
            page_deployment = page_deployment_info["page_deployment"]
            for page_idx, page_deploy in enumerate(page_deployment.get_deployment_list()):
                page_deployment_id = page_deploy.deployment_id
                
                # Check if this specific page deployment is already registered
                if page_deployment_id not in ACTIVE_DEPLOYMENTS:
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
                    print(f"🎤 Registered page deployment {page_deployment_id} in ACTIVE_DEPLOYMENTS")
                else:
                    print(f"🎤 Page deployment {page_deployment_id} already registered in ACTIVE_DEPLOYMENTS")
        elif db_deployment.type == "livePresentation":
            # Handle Live Presentation deployment with persistence
            from services.deployment_types.live_presentation import LivePresentationDeployment
            
            live_presentation = LivePresentationDeployment.from_config(workflow_data, deployment_id)
            live_presentation.set_database_session(db)
            
            # Restore state from database
            await live_presentation.restore_from_database()
            
            ACTIVE_DEPLOYMENTS[deployment_id] = {
                "user_id": db_deployment.user_id,
                "workflow_name": db_deployment.workflow_name,
                "config": db_deployment.config,
                "mcp_deployment": live_presentation,
                "created_at": db_deployment.created_at.isoformat(),
                "chat_history": [],
                "type": "livePresentation",
                "is_live_presentation": True
            }
        else:
            # Regular deployment
            mcp_deployment = AgentDeployment(
                db_deployment.deployment_id,
                workflow_data,
                db_deployment.collection_name,
            )
            
            ACTIVE_DEPLOYMENTS[deployment_id] = {
                "user_id": db_deployment.user_id,
                "workflow_name": db_deployment.workflow_name,
                "config": db_deployment.config,
                "mcp_deployment": mcp_deployment,
                "created_at": db_deployment.created_at.isoformat(),
                "chat_history": [],
                "type": db_deployment.type
            }
        
        print(f"Loaded deployment {deployment_id} on-demand for user {user_id}")
        return True
        
    except Exception as e:
        print(f"Failed to load deployment {deployment_id} on-demand: {e}")
        # mark as inactive if it can't be loaded
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
            print(f"Failed to mark deployment as inactive: {update_error}")
        
        return False

# get active deployment from memory
def get_active_deployment(deployment_id: str) -> Dict[str, Any]:
    print(f"🎤 Looking for deployment: {deployment_id}")
    print(f"🎤 Available in ACTIVE_DEPLOYMENTS: {list(ACTIVE_DEPLOYMENTS.keys())}")
    
    # Check regular deployments first
    deployment = ACTIVE_DEPLOYMENTS.get(deployment_id)
    if deployment:
        print(f"🎤 Found deployment {deployment_id} in ACTIVE_DEPLOYMENTS")
        return deployment
    
    # Check page deployments  
    page_deployment = get_active_page_deployment(deployment_id)
    if page_deployment:
        print(f"🎤 Found parent deployment {deployment_id} in ACTIVE_PAGE_DEPLOYMENTS, but need to check for specific page")
        
        # For page-based deployments, we need to check if this is requesting a specific page
        # The deployment_id might be something like "parent_deployment_id_page_2"
        if "_page_" in deployment_id:
            # This is a request for a specific page, which should be in ACTIVE_DEPLOYMENTS
            print(f"🎤 Request is for specific page {deployment_id}, should be in ACTIVE_DEPLOYMENTS")
            print(f"🎤 Available in ACTIVE_DEPLOYMENTS: {list(ACTIVE_DEPLOYMENTS.keys())}")
            return None  # Force it to fall through to "not found"
        else:
            # This is a request for the parent deployment, return PageDeployment wrapper
            print(f"🎤 Request is for parent deployment, converting format")
            return {
                "user_id": page_deployment["user_id"],
                "workflow_name": page_deployment["workflow_name"],
                "config": page_deployment["config"],
                "mcp_deployment": page_deployment["page_deployment"],  # Note: different key name
                "created_at": page_deployment["created_at"],
                "chat_history": [],
                "type": page_deployment["type"],
                "is_page_based": True,
                "page_count": page_deployment.get("page_count", 0)
            }
    
    print(f"🎤 Deployment {deployment_id} not found in either ACTIVE_DEPLOYMENTS or ACTIVE_PAGE_DEPLOYMENTS")
    return None

# add deployment to active deployments
def add_active_deployment(deployment_id: str, deployment_data: Dict[str, Any]) -> None:
    ACTIVE_DEPLOYMENTS[deployment_id] = deployment_data
    print(f"🎤 Added deployment {deployment_id} to ACTIVE_DEPLOYMENTS")
    print(f"🎤 Type: {deployment_data.get('type', 'unknown')}")
    print(f"🎤 MCP deployment type: {type(deployment_data.get('mcp_deployment', None))}")
    print(f"🎤 Total active deployments: {len(ACTIVE_DEPLOYMENTS)}")

# remove deployment from active deployments
def remove_active_deployment(deployment_id: str) -> None:
    if deployment_id in ACTIVE_DEPLOYMENTS:
        del ACTIVE_DEPLOYMENTS[deployment_id]

# check if deployment is currently loaded in memory
def is_deployment_active(deployment_id: str) -> bool:
    return deployment_id in ACTIVE_DEPLOYMENTS

# cleanup function on server shutdown
async def cleanup_all_deployments():
    # Cleanup regular deployments
    for deployment_id, deployment in ACTIVE_DEPLOYMENTS.items():
        try:
            mcp_deployment = deployment.get("mcp_deployment")
            if mcp_deployment:
                await mcp_deployment.close()
        except Exception as e:
            print(f"Error cleaning up deployment {deployment_id}: {e}")
    
    ACTIVE_DEPLOYMENTS.clear()
    
    # Cleanup page deployments
    await cleanup_all_page_deployments()
    
    # Clear live presentation cache
    from services.deployment_service import clear_live_presentation_cache
    clear_live_presentation_cache()
    
    print("All MCP deployments and page deployments cleaned up. Deployments remain active in database for restart.") 
