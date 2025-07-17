from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List

from .deployment_shared import *

router = APIRouter()

# Debug endpoint to check authentication
@router.get("/debug/auth")
async def debug_auth(current_user: User = Depends(get_current_user)):
    return {
        "authenticated": True,
        "user_id": current_user.id,
        "user_email": current_user.email,
        "message": "Authentication is working correctly"
    }

# Deploy workflow to chatbot
@router.post("/", response_model=DeploymentResponse)
async def deploy_workflow(
    request: DeploymentRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    try:
        if current_user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication failed: User not found"
            )
        
        if not hasattr(current_user, 'id') or current_user.id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication failed: User ID not available"
            )
        
        print(f"User authenticated: {current_user.id} ({current_user.email})")
        
        # Check if user can create deployments (must be instructor)
        if not user_can_create_resources(current_user, db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only instructors can deploy workflows"
            )
        
        # Validate required environment variables
        required_env_vars = {
            "GOOGLE_CLOUD_PROJECT": "Google Cloud Project ID is required for Vertex AI"
        }
        
        missing_vars = []
        for var, description in required_env_vars.items():
            if not os.getenv(var):
                missing_vars.append(f"{var}: {description}")
        
        if missing_vars:
            error_msg = "Missing required environment variables:\n" + "\n".join(missing_vars)
            print(f"Error: {error_msg}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Server configuration error: {error_msg}"
            )
        
        # Generate unique deployment ID
        deployment_id = str(uuid.uuid4())
        
        # Parse workflow configuration
        if ('2' in request.workflow_data):
            config = parse_agent_config(request.workflow_data['2'])
        else:
            config = None
        print(f"[DEPLOY] Workflow data keys: {list(request.workflow_data.keys())}")
        if '1' in request.workflow_data:
            print(f"[DEPLOY] Node 1 type: {request.workflow_data['1'].get('type', 'NOT FOUND')}")
        print(f"[DEPLOY] Full workflow data: {request.workflow_data}")
        
        # Get workflow and its documents
        workflow = db.get(Workflow, request.workflow_id)
        if not workflow or not workflow.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workflow not found"
            )
        
        # Check if user can modify this workflow (must be instructor in class)
        if not user_can_modify_workflow(current_user, workflow, db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only instructors of this class can deploy workflows"
            )
        
        # Check for document collection if MCP is enabled and has documents
        collection_name = None
        rag_document_ids = []
        if config and config["has_mcp"] and config.get("mcp_has_documents", True):
            # Check if we have documents for this specific workflow (from any class member)
            try:
                print(f"[DEPLOY] Looking for documents in workflow {workflow.id}")
                stmt = select(Document).where(
                    Document.workflow_id == workflow.id,
                    Document.is_active == True
                )
                documents = db.exec(stmt).all()
                print(f"[DEPLOY] Found {len(documents)} documents for workflow {workflow.id}")
                if documents:
                    for doc in documents:
                        print(f"[DEPLOY]   - Document {doc.id}: {doc.original_filename} (uploaded by {doc.uploaded_by_id})")
            except Exception as doc_error:
                print(f"Error querying documents: {doc_error}")
                documents = []
            
            if documents:
                # Use the workflow-specific collection (should use the uploader's collection)
                # Get the first document's uploader to determine collection name
                first_doc_uploader_id = documents[0].uploaded_by_id
                collection_name = f"{workflow.workflow_collection_id}_{first_doc_uploader_id}"
                rag_document_ids = [doc.id for doc in documents]
                print(f"Using workflow collection: {collection_name}")
                print(f"Documents in workflow: {len(documents)} - IDs: {rag_document_ids}")
                print(f"Documents uploaded by user {first_doc_uploader_id}")
            else:
                print(f"[DEPLOY] No documents found for workflow {workflow.id}")
                # Debug: Check if there are any documents at all for this workflow (including inactive)
                debug_stmt = select(Document).where(Document.workflow_id == workflow.id)
                debug_docs = db.exec(debug_stmt).all()
                print(f"[DEPLOY] Total documents for workflow {workflow.id} (including inactive): {len(debug_docs)}")
                for doc in debug_docs:
                    print(f"[DEPLOY]   - Document {doc.id}: {doc.original_filename} (active: {doc.is_active}, uploaded by: {doc.uploaded_by_id})")
            
            config["collection_name"] = collection_name
        
        deployment_type = request.type if hasattr(request, "type") else DeploymentType.CHAT

        mcp_deployment = AgentDeployment(deployment_id, request.workflow_data, collection_name)

        deployment_type = mcp_deployment.get_deployment_type()
        
        print(f"[DEPLOY] Deployment type detected: {deployment_type}")
        print(f"[DEPLOY] Deployment type value: {deployment_type.value}")
        
        # Create Problem entities for CODE deployments
        created_problem_ids = []
        if deployment_type == DeploymentType.CODE:
            try:
                # Get all problems info from the deployment
                all_problems_info = mcp_deployment.get_all_code_problems_info()
                problem_count = mcp_deployment.get_code_problem_count()
                
                print(f"[DEPLOY] Creating {problem_count} problems for CODE deployment")
                
                if all_problems_info:
                    for problem_idx, problem_info in enumerate(all_problems_info):
                        # Create the problem
                        problem = Problem(
                            title=f"{request.workflow_name} - Problem {problem_idx}: {problem_info.get('function_name', f'Challenge {problem_idx}')}",
                            description=problem_info.get("description", f"Code Challenge {problem_idx}"),
                            class_id=workflow.class_id,
                            created_by_id=current_user.id,
                        )
                        db.add(problem)
                        db.commit()
                        db.refresh(problem)
                        created_problem_ids.append(problem.id)
                        
                        # Create test cases if available in the workflow data
                        if '1' in request.workflow_data and 'attachments' in request.workflow_data['1']:
                            tests = request.workflow_data['1']['attachments'].get('tests', [])
                            if problem_idx < len(tests) and 'config' in tests[problem_idx]:
                                test_cases_data = tests[problem_idx]['config'].get('test_cases', [])
                                for test_case_data in test_cases_data:
                                    test_case = TestCase(
                                        problem_id=problem.id,
                                        input=test_case_data.get('parameters', []),
                                        expected_output=str(test_case_data.get('expected', ''))
                                    )
                                    db.add(test_case)
                        
                        print(f"[DEPLOY] Created problem {problem.id} (index {problem_idx}): {problem_info.get('function_name', f'Challenge {problem_idx}')}")
                    
                    db.commit()
                    print(f"[DEPLOY] Created {len(created_problem_ids)} problems for CODE deployment")
                
            except Exception as problem_error:
                print(f"[DEPLOY] Warning: Failed to create problem entities: {problem_error}")
                import traceback
                print(f"[DEPLOY] Problem creation error traceback:\n{traceback.format_exc()}")
                # Continue with deployment even if problem creation fails
        
        # Log LLM configuration for deployment
        if config:
            llm_config = config["llm_config"]
            provider = llm_config.get("provider", "vertexai")
            print(f"[{deployment_id}] DEPLOYMENT CREATED - LLM Configuration:")
            print(f"[{deployment_id}]   Provider: {provider.upper()}")
            print(f"[{deployment_id}]   Model: {llm_config['model']}")
            print(f"[{deployment_id}]   Temperature: {llm_config['temperature']}")
            print(f"[{deployment_id}]   Max Tokens: {llm_config['max_tokens']}")
            print(f"[{deployment_id}]   Top P: {llm_config['top_p']}")
            print(f"[{deployment_id}]   Has MCP/RAG: {config['has_mcp']}")
            print(f"[{deployment_id}]   Collection: {collection_name}")
        
        if not config:
            config = {}

        combined_config = {
            **config,  # parsed agent/LLM config keys
            "__workflow_nodes__": request.workflow_data,  # raw workflow graph
        }

        # Store deployment configuration in database and memory
        try:
            # Save to database
            db_deployment = Deployment(
                deployment_id=deployment_id,
                user_id=current_user.id,
                workflow_id=workflow.id,
                class_id=workflow.class_id,
                workflow_name=request.workflow_name,
                collection_name=collection_name,
                config=combined_config,
                rag_document_ids=rag_document_ids if rag_document_ids else None,
                type=deployment_type,
                grade=request.grade
            )
            db.add(db_deployment)
            db.commit()
            db.refresh(db_deployment)
            
            # Link problem to deployment for CODE deployments
            if created_problem_ids and deployment_type == DeploymentType.CODE:
                try:
                    # Create the link between deployment and problem
                    for problem_id in created_problem_ids:
                        problem_link = DeploymentProblemLink(
                            deployment_id=db_deployment.id,
                            problem_id=problem_id
                        )
                        db.add(problem_link)
                    db.commit()
                    print(f"[DEPLOY] Linked {len(created_problem_ids)} problems to deployment {db_deployment.id}")
                    
                except Exception as link_error:
                    print(f"[DEPLOY] Warning: Failed to link problems to deployment: {link_error}")
            
            # Store in memory for active use
            add_active_deployment(deployment_id, {
                "user_id": current_user.id,
                "workflow_name": request.workflow_name,
                "config": combined_config,
                "mcp_deployment": mcp_deployment,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "chat_history": [],
                "type": deployment_type
            })
            print(f"Deployment stored successfully for user {current_user.id} (DB ID: {db_deployment.id})")
        except Exception as storage_error:
            print(f"Error storing deployment: {storage_error}")
            raise
        
        chat_url = f"/chat/{deployment_id}"
        
        return DeploymentResponse(
            deployment_id=deployment_id,
            chat_url=chat_url,
            message=f"Successfully deployed {request.workflow_name} with MCP server",
            type=deployment_type,
            grade=db_deployment.grade,
            configuration={
                "workflow_id": workflow.id,
                "workflow_collection_id": workflow.workflow_collection_id,
                "provider": config.get("llm_config", {}).get("provider", "vertexai"),
                "model": config.get("llm_config", {}).get("model", ""),
                "has_rag": config.get("has_mcp", False),
                "collection": collection_name,
                "mcp_enabled": config.get("has_mcp", False),
                "file_count": len(rag_document_ids),
                "files_url": f"/api/deploy/{deployment_id}/files" if rag_document_ids else None
            }
        )
        
    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        print(f"Full deployment error traceback:\n{error_traceback}")
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Deployment failed: {str(e)}"
        )

# Get active deployments
@router.get("/active")
async def list_active_deployments(
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    try:
        # Get all deployments accessible to user (based on class membership)
        accessible_deployments = get_accessible_deployments(current_user, db)
        
        user_deployments = []
        
        for deployment in accessible_deployments:
            # Get file count for this deployment
            rag_document_ids = deployment.rag_document_ids or []
            file_count = 0
            
            if rag_document_ids:
                # Count active documents for this deployment
                active_docs = db.exec(
                    select(Document).where(
                        Document.id.in_(rag_document_ids),
                        Document.is_active == True
                    )
                ).all()
                file_count = len(active_docs)
            
            # Just list the deployment info without loading it into memory
            user_deployments.append({
                "deployment_id": deployment.deployment_id,
                "workflow_name": deployment.workflow_name,
                "created_at": deployment.created_at.isoformat(),
                "chat_url": f"/chat/{deployment.deployment_id}",
                "files_url": f"/api/deploy/{deployment.deployment_id}/files",
                "is_loaded": is_deployment_active(deployment.deployment_id),  # Show if currently loaded
                "is_open": deployment.is_open,  # Show deployment open/closed status
                "file_count": file_count,
                "has_files": file_count > 0,
                "type": deployment.type.value,
                "grade": deployment.grade,
                "configuration": {
                    "provider": deployment.config.get("llm_config", {}).get("provider", "vertexai"),
                    "model": deployment.config.get("llm_config", {}).get("model", ""),
                    "has_rag": deployment.config.get("has_mcp", False),
                    "mcp_enabled": deployment.config.get("has_mcp", False)
                }
            })
        
        return {"deployments": user_deployments}
        
    except Exception as e:
        print(f"Error listing active deployments: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list deployments: {str(e)}"
        )

@router.get("/{deployment_id}/type")
async def get_deployment_type_endpoint(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)

    return {
        "deployment_id": deployment_id,
        "type": db_deployment.type.value,
    }

@router.get("/{deployment_id}/contains-chat")
async def deployment_contains_chat_endpoint(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)
    deployment_mem = await ensure_deployment_loaded(deployment_id, current_user.id, db)
    contains_chat: bool = deployment_mem["mcp_deployment"].get_contains_chat()

    return {
        "deployment_id": deployment_id,
        "contains_chat": contains_chat,
    }

# Delete and cleanup deployment
@router.delete("/{deployment_id}")
async def delete_deployment(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    # Check if deployment exists in database and user can modify it
    db_deployment = db.exec(
        select(Deployment).where(
            Deployment.deployment_id == deployment_id,
            Deployment.is_active == True
        )
    ).first()
    
    if not db_deployment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found"
        )
    
    # Check if user can modify this deployment (must be instructor in class)
    if not user_can_modify_deployment(current_user, db_deployment, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only instructors of this class can delete deployments"
        )
    
    # Clean up MCP server if loaded in memory
    if is_deployment_active(deployment_id):
        deployment = get_active_deployment(deployment_id)
        
        try:
            mcp_deployment = deployment.get("mcp_deployment")
            if mcp_deployment:
                await mcp_deployment.close()
        except Exception as e:
            print(f"Error cleaning up MCP deployment: {e}")
        
        remove_active_deployment(deployment_id)
    
    # Mark deployment as inactive in database
    db_deployment.is_active = False
    db_deployment.updated_at = datetime.now(timezone.utc)
    db.add(db_deployment)
    db.commit()
    
    return {"message": f"Deployment {deployment_id} deleted successfully"}

# Test streaming functionality for a deployment
@router.post("/{deployment_id}/test-streaming")
async def test_deployment_streaming(
    deployment_id: str,
    test_message: str = "Hello, this is a test message for streaming functionality.",
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    deployment = await ensure_deployment_loaded(deployment_id, current_user.id, db)
    mcp_deployment = deployment.get("mcp_deployment")
    
    if not mcp_deployment:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="MCP deployment not available"
        )
    
    try:
        # Test streaming functionality
        result = await mcp_deployment.test_streaming(test_message)
        
        return {
            "deployment_id": deployment_id,
            "test_message": test_message,
            "streaming_test_result": result,
            "provider": deployment["config"]["llm_config"].get("provider", "vertexai"),
            "model": deployment["config"]["llm_config"]["model"]
        }
        
    except Exception as e:
        print(f"Error testing streaming for deployment {deployment_id}: {e}")
        import traceback
        print(f"Streaming test error traceback:\n{traceback.format_exc()}")
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to test streaming: {str(e)}"
        )

# --- Endpoints to open / close deployments ---
class DeploymentStateResponse(BaseModel):
    deployment_id: str
    is_open: bool
    message: str

@router.post("/{deployment_id}/close", response_model=DeploymentStateResponse)
async def close_deployment_endpoint(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db, require_instructor=True)

    if not db_deployment.is_open:
        return DeploymentStateResponse(deployment_id=deployment_id, is_open=False, message="Deployment already closed")

    # Remove from active memory
    if is_deployment_active(deployment_id):
        deployment_mem = get_active_deployment(deployment_id)
        try:
            mcp_dep = deployment_mem.get("mcp_deployment")
            if mcp_dep:
                await mcp_dep.close()
        except Exception:
            pass
        remove_active_deployment(deployment_id)

    db_deployment.is_open = False
    db.add(db_deployment)
    db.commit()

    return DeploymentStateResponse(deployment_id=deployment_id, is_open=False, message="Deployment closed successfully")

@router.post("/{deployment_id}/open", response_model=DeploymentStateResponse)
async def open_deployment_endpoint(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db, require_instructor=True)

    if db_deployment.is_open:
        return DeploymentStateResponse(deployment_id=deployment_id, is_open=True, message="Deployment already open")

    db_deployment.is_open = True
    db.add(db_deployment)
    db.commit()

    return DeploymentStateResponse(deployment_id=deployment_id, is_open=True, message="Deployment opened successfully") 
