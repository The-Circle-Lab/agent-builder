from typing import Dict, Any
from sqlmodel import Session as DBSession, select
from models.db_models import Deployment
from services.deployment_service import MCPChatDeployment
from datetime import datetime, timezone

# Store active deployments with MCP sessions
ACTIVE_DEPLOYMENTS: Dict[str, Dict[str, Any]] = {}

# load deployment on demand if not already in memory
async def load_deployment_on_demand(deployment_id: str, user_id: int, db: DBSession) -> bool:
    if deployment_id in ACTIVE_DEPLOYMENTS:
        return True  # Already loaded
    
    try:
        # Get deployment from database (don't filter by user_id since permission check is done separately)
        db_deployment = db.exec(
            select(Deployment).where(
                Deployment.deployment_id == deployment_id,
                Deployment.is_active == True
            )
        ).first()
        
        if not db_deployment:
            return False
        
        # Create MCP deployment object
        mcp_deployment = MCPChatDeployment(
            db_deployment.deployment_id, 
            db_deployment.config, 
            db_deployment.collection_name
        )
        
        # Store in active deployments
        ACTIVE_DEPLOYMENTS[deployment_id] = {
            "user_id": db_deployment.user_id,
            "workflow_name": db_deployment.workflow_name,
            "config": db_deployment.config,
            "mcp_deployment": mcp_deployment,
            "created_at": db_deployment.created_at.isoformat(),
            "chat_history": []
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
    return ACTIVE_DEPLOYMENTS.get(deployment_id)

# add deployment to active deployments
def add_active_deployment(deployment_id: str, deployment_data: Dict[str, Any]) -> None:
    ACTIVE_DEPLOYMENTS[deployment_id] = deployment_data

# remove deployment from active deployments
def remove_active_deployment(deployment_id: str) -> None:
    if deployment_id in ACTIVE_DEPLOYMENTS:
        del ACTIVE_DEPLOYMENTS[deployment_id]

# check if deployment is currently loaded in memory
def is_deployment_active(deployment_id: str) -> bool:
    return deployment_id in ACTIVE_DEPLOYMENTS

# cleanup function on server shutdown
async def cleanup_all_deployments():
    for deployment_id, deployment in ACTIVE_DEPLOYMENTS.items():
        try:
            mcp_deployment = deployment.get("mcp_deployment")
            if mcp_deployment:
                await mcp_deployment.close()
        except Exception as e:
            print(f"Error cleaning up deployment {deployment_id}: {e}")
    
    ACTIVE_DEPLOYMENTS.clear()
    print("All MCP deployments cleaned up. Deployments remain active in database for restart.") 
