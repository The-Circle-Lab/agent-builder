from typing import List, Dict, Any, Optional
from services.deployment_service import AgentDeployment
import uuid

class PageDeployment:
    deployment_list: List[AgentDeployment]
    page_count: int
    deployment_id: str

    def __init__(self, deployment_id: str, config: Dict[str, Any], collection_name: Optional[str] = None):
        if not config.get("pagesExist", False):
            raise ValueError("Pages are necessary in this workflow")
        
        self.deployment_id = deployment_id
        self.deployment_list = []
        self.page_count = 0
        
        pages = config.get("pages", {})
        
        # Sort pages by page number to maintain order
        sorted_pages = sorted(pages.items(), key=lambda x: int(x[0]))
        
        for page_number, page_config in sorted_pages:
            # Create unique deployment ID for each page
            page_deployment_id = f"{deployment_id}_page_{page_number}"
            
            # Convert page config back to the expected format
            page_workflow_config = {
                "pagesExist": False,  # Individual pages don't have nested pages
                "nodes": page_config
            }
            
            page_deployment = AgentDeployment(
                deployment_id=page_deployment_id,
                config=page_workflow_config,
                collection_name=collection_name,
                coming_from_page=True
            )
            
            self.deployment_list.append(page_deployment)
            self.page_count += 1

    def get_deployment_list(self) -> List[AgentDeployment]:
        return self.deployment_list
    
    def get_deployment_by_index(self, index: int) -> AgentDeployment:
        return self.deployment_list[index]

    def get_page_count(self) -> int:
        return len(self.deployment_list)

    def get_deployment_by_id(self, deployment_id: str) -> AgentDeployment:
        return next((deployment for deployment in self.deployment_list if deployment.deployment_id == deployment_id), None)
    
    def get_primary_deployment_type(self):
        """Get the deployment type from the first page (all pages should have same type)"""
        if self.deployment_list:
            return self.deployment_list[0].get_deployment_type()
        return None
    
    def get_contains_chat(self) -> bool:
        """Check if any page contains chat functionality"""
        return any(deployment.get_contains_chat() for deployment in self.deployment_list)
    
    def cleanup_all_pages(self):
        """Cleanup all page deployments"""
        for deployment in self.deployment_list:
            if hasattr(deployment, 'cleanup'):
                deployment.cleanup()
    
    def get_page_deployment_ids(self) -> List[str]:
        """Get all page deployment IDs"""
        return [deployment.deployment_id for deployment in self.deployment_list]
    