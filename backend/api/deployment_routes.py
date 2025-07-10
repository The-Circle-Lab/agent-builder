from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session as DBSession, select
from models.db_models import User, Document, Workflow, ChatConversation, ChatMessage, Deployment, AuthSession, ClassRole, DeploymentType
from database.database import get_session, engine
from api.auth import get_current_user
from scripts.permission_helpers import (
    user_can_modify_workflow, user_can_access_workflow, user_can_modify_deployment,
    user_can_access_deployment, user_has_role_in_class, user_can_create_resources
)
from models.deployment_models import (
    DeploymentRequest, DeploymentResponse, ChatRequest, ChatResponse,
    ConversationCreateRequest, ConversationResponse, MessageResponse
)
from pydantic import BaseModel
from services.deployment_manager import (
    load_deployment_on_demand, get_active_deployment, add_active_deployment,
    remove_active_deployment, is_deployment_active
)
from services.deployment_service import AgentDeployment
from typing import List, Dict, Any, Tuple
import uuid
import os
from fastapi import WebSocket, WebSocketDisconnect
from datetime import datetime, timezone
from services.config_service import parse_agent_config

# Import extracted helper utilities
from scripts.deployment_helpers import (
    _extract_sid_from_websocket,
    _send_error_and_close,
    _authenticate_websocket_user,
    _save_chat_to_db,
    _load_deployment_for_user,
)

router = APIRouter(prefix="/api/deploy", tags=["deployment"])

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
        
        # Create Problem entity for CODE deployments
        created_problem_id = None
        if deployment_type == DeploymentType.CODE:
            try:
                from models.db_models import Problem, TestCase
                
                # Get problem info from the deployment
                problem_info = mcp_deployment.get_code_problem_info()
                if problem_info:
                    # Create the problem
                    problem = Problem(
                        title=f"{request.workflow_name} - Code Challenge",
                        description=problem_info.get("description", "Code Challenge"),
                        class_id=workflow.class_id,
                        created_by_id=current_user.id,
                    )
                    db.add(problem)
                    db.commit()
                    db.refresh(problem)
                    created_problem_id = problem.id
                    
                    # Create test cases if available in the workflow data
                    if '1' in request.workflow_data and 'attachments' in request.workflow_data['1']:
                        tests = request.workflow_data['1']['attachments'].get('tests', [])
                        if tests and 'config' in tests[0]:
                            test_cases_data = tests[0]['config'].get('test_cases', [])
                            for test_case_data in test_cases_data:
                                test_case = TestCase(
                                    problem_id=problem.id,
                                    input=test_case_data.get('parameters', []),
                                    expected_output=str(test_case_data.get('expected', ''))
                                )
                                db.add(test_case)
                    
                    db.commit()
                    print(f"[DEPLOY] Created problem {problem.id} for CODE deployment")
                
            except Exception as problem_error:
                print(f"[DEPLOY] Warning: Failed to create problem entity: {problem_error}")
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
                type=deployment_type
            )
            db.add(db_deployment)
            db.commit()
            db.refresh(db_deployment)
            
            # Link problem to deployment for CODE deployments
            if created_problem_id and deployment_type == DeploymentType.CODE:
                try:
                    from models.db_models import DeploymentProblemLink
                    
                    # Create the link between deployment and problem
                    problem_link = DeploymentProblemLink(
                        deployment_id=db_deployment.id,
                        problem_id=created_problem_id
                    )
                    db.add(problem_link)
                    db.commit()
                    print(f"[DEPLOY] Linked problem {created_problem_id} to deployment {db_deployment.id}")
                    
                except Exception as link_error:
                    print(f"[DEPLOY] Warning: Failed to link problem to deployment: {link_error}")
            
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

# Chat with a deployed agent
@router.post("/chat/{deployment_id}", response_model=ChatResponse)
async def chat_with_deployment(
    deployment_id: str,
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    deployment = await _load_deployment_for_user(deployment_id, current_user, db)

    try:
        mcp_deployment = deployment["mcp_deployment"]

        if (not mcp_deployment.get_contains_chat()):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Deployment does not contain a chat agent"
            )

        result = await mcp_deployment.chat(request.message, request.history, user_id=current_user.id)

        # Keep history in memory
        deployment["chat_history"].append([request.message, result["response"]])

        # Persist conversation if requested
        if request.conversation_id:
            _save_chat_to_db(
                db,
                current_user.id,
                deployment_id,
                request.conversation_id,
                request.message,
                result,
            )

        return ChatResponse(
            response=result["response"],
            sources=result["sources"],
            conversation_id=request.conversation_id,
        )

    except Exception as exc:
        print(f"Chat failed for deployment {deployment_id}: {exc}")
        import traceback, sys
        print("Chat error traceback:\n" + traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Chat failed: {str(exc)}",
        )

# WebSocket chat
@router.websocket("/ws/{deployment_id}")
async def websocket_chat(
    websocket: WebSocket,
    deployment_id: str,
):
    await websocket.accept()
    db: DBSession = DBSession(engine)

    try:
        user, _ = await _authenticate_websocket_user(websocket, deployment_id, db)

        if not await load_deployment_on_demand(deployment_id, user.id, db):
            await _send_error_and_close(
                websocket,
                "Deployment not found or failed to initialize",
                "Deployment not available",
            )
            return

        deployment = get_active_deployment(deployment_id)

        if (not deployment["mcp_deployment"].get_contains_chat()):
            await _send_error_and_close(
                websocket,
                "Deployment does not contain a chat agent",
                "Deployment does not contain a chat agent",
            )
            return
        
        await websocket.send_json({"type": "auth_success", "message": "Authenticated successfully"})

        while True:
            try:
                data = await websocket.receive_json()
            except WebSocketDisconnect:
                break

            msg_type = data.get("type")
            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue
            if msg_type != "chat":
                continue 

            message: str = data.get("message", "")
            history = data.get("history", [])
            conversation_id = data.get("conversation_id")

            mcp_deployment = deployment["mcp_deployment"]

            await websocket.send_json({"type": "typing", "message": "Assistant is typing..."})

            async def stream_callback(chunk: str) -> None:
                await websocket.send_json({"type": "stream", "chunk": chunk})

            result = await mcp_deployment.chat_streaming(message, history, stream_callback, user_id=user.id)

            await websocket.send_json({
                "type": "response",
                "response": result["response"],
                "sources": result["sources"],
            })

            deployment["chat_history"].append([message, result["response"]])

            if conversation_id:
                _save_chat_to_db(db, user.id, deployment_id, conversation_id, message, result)

    except WebSocketDisconnect:
        pass  # Normal client disconnect
    finally:
        try:
            db.close()
        except Exception:
            pass
        try:
            await websocket.close()
        except Exception:
            pass

# Get active deployments
@router.get("/active")
async def list_active_deployments(
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    try:
        # Get all deployments accessible to user (based on class membership)
        from scripts.permission_helpers import get_accessible_deployments
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
                "file_count": file_count,
                "has_files": file_count > 0,
                "type": deployment.type.value,
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

    db_deployment = db.exec(
        select(Deployment).where(
            Deployment.deployment_id == deployment_id,
            Deployment.is_active == True,
        )
    ).first()

    if not db_deployment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found",
        )

    if not user_can_access_deployment(current_user, db_deployment, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You must be a member of this class to view deployment info.",
        )

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
    db_deployment = db.exec(
        select(Deployment).where(
            Deployment.deployment_id == deployment_id,
            Deployment.is_active == True,
        )
    ).first()

    if not db_deployment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found",
        )

    if not user_can_access_deployment(current_user, db_deployment, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You must be a member of this class to view deployment info.",
        )

    if not await load_deployment_on_demand(deployment_id, current_user.id, db):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found or failed to initialize",
        )

    deployment_mem = get_active_deployment(deployment_id)
    contains_chat: bool = deployment_mem["mcp_deployment"].get_contains_chat()

    return {
        "deployment_id": deployment_id,
        "contains_chat": contains_chat,
    }


@router.get("/{deployment_id}/problem-info")
async def get_code_problem_info_endpoint(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    db_deployment = db.exec(
        select(Deployment).where(
            Deployment.deployment_id == deployment_id,
            Deployment.is_active == True,
        )
    ).first()

    if not db_deployment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found",
        )

    if not user_can_access_deployment(current_user, db_deployment, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You must be a member of this class to view deployment info.",
        )

    if db_deployment.type != DeploymentType.CODE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Deployment is not of CODE type",
        )

    # Ensure deployment is loaded and obtain problem info
    if not await load_deployment_on_demand(deployment_id, current_user.id, db):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found or failed to initialize",
        )

    deployment_mem = get_active_deployment(deployment_id)
    problem_info = deployment_mem["mcp_deployment"].get_code_problem_info()

    return {
        "deployment_id": deployment_id,
        "problem_info": problem_info,
    }


# Request model for code submission
class CodeSubmissionRequest(BaseModel):
    code: str

# Request model for code saving
class CodeSaveRequest(BaseModel):
    code: str

# Response model for code loading
class CodeLoadResponse(BaseModel):
    deployment_id: str
    code: str
    last_saved: str

# Response models for detailed test results
class TestCaseResult(BaseModel):
    test_id: int
    parameters: List[Any]
    expected_output: Any
    actual_output: Any | None
    passed: bool
    error: str | None
    execution_time: float | None

class DetailedCodeTestResult(BaseModel):
    deployment_id: str
    all_passed: bool
    message: str
    total_tests: int
    passed_tests: int
    failed_tests: int
    test_results: List[TestCaseResult]

# Run tests for CODE deployment
@router.post("/{deployment_id}/run-tests")
async def run_code_tests_endpoint(
    deployment_id: str,
    request: CodeSubmissionRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    # Validate deployment exists and user has access
    db_deployment = db.exec(
        select(Deployment).where(
            Deployment.deployment_id == deployment_id,
            Deployment.is_active == True,
        )
    ).first()

    if not db_deployment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found",
        )

    if not user_can_access_deployment(current_user, db_deployment, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You must be a member of this class to run tests.",
        )

    if db_deployment.type != DeploymentType.CODE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Deployment is not of CODE type",
        )

    # Load deployment and run tests
    if not await load_deployment_on_demand(deployment_id, current_user.id, db):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found or failed to initialize",
        )

    deployment_mem = get_active_deployment(deployment_id)
    mcp_deployment = deployment_mem["mcp_deployment"]
    
    try:
        import time
        start_time = time.time()
        
        # Find the linked problem for this deployment
        from models.db_models import Problem, DeploymentProblemLink, Submission, SubmissionStatus
        

        linked_problem = db.exec(
            select(Problem)
            .join(DeploymentProblemLink, Problem.id == DeploymentProblemLink.problem_id)
            .where(DeploymentProblemLink.deployment_id == db_deployment.id)
        ).first()

        submission = Submission(
                user_id=current_user.id,
                code=request.code,
                problem_id=linked_problem.id,
                status=SubmissionStatus.QUEUED,
                execution_time=0,
                error=None,
                analysis=None
            )
        db.add(submission)
        db.commit()
        db.refresh(submission)

        # Run all tests - now returns detailed results with analysis support
        test_results = mcp_deployment.run_all_tests(request.code, database_session=db, submission_id=submission.id)
        
        execution_time = time.time() - start_time
        
        if test_results is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Test execution failed to return results"
            )
        
        
        # Create submission record if we have a linked problem
        if linked_problem:
            # Determine submission status
            if test_results["all_passed"]:
                status = SubmissionStatus.PASSED
            else:
                status = SubmissionStatus.FAILED
            
            # Create submission record
            submission.execution_time = execution_time
            submission.error = None if test_results["all_passed"] else f"{test_results['failed_tests']} tests failed"
            submission.status = status
            db.commit()
            db.refresh(submission)
            print(f"[SUBMISSION] Created submission {submission.id} for user {current_user.id} on problem {linked_problem.id}")
        
        # Format the response
        all_passed = test_results["all_passed"]
        message = "All tests passed!" if all_passed else f"{test_results['failed_tests']} out of {test_results['total_tests']} tests failed"
        
        return DetailedCodeTestResult(
            deployment_id=deployment_id,
            all_passed=all_passed,
            message=message,
            total_tests=test_results["total_tests"],
            passed_tests=test_results["passed_tests"],
            failed_tests=test_results["failed_tests"],
            test_results=[
                TestCaseResult(
                    test_id=result["test_id"],
                    parameters=result["parameters"],
                    expected_output=result["expected_output"],
                    actual_output=result["actual_output"],
                    passed=result["passed"],
                    error=result["error"],
                    execution_time=result["execution_time"]
                )
                for result in test_results["test_results"]
            ]
        )
        
    except Exception as e:
        print(f"Error running tests for deployment {deployment_id}: {e}")
        import traceback
        print(f"Test execution error traceback:\n{traceback.format_exc()}")
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to run tests: {str(e)}"
        )

# Save user code for CODE deployment
@router.post("/{deployment_id}/save-code")
async def save_user_code(
    deployment_id: str,
    request: CodeSaveRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    # Validate deployment exists and user has access
    db_deployment = db.exec(
        select(Deployment).where(
            Deployment.deployment_id == deployment_id,
            Deployment.is_active == True,
        )
    ).first()

    if not db_deployment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found",
        )

    if not user_can_access_deployment(current_user, db_deployment, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You must be a member of this class to save code.",
        )

    if db_deployment.type != DeploymentType.CODE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Deployment is not of CODE type",
        )

    try:
        # For now, we'll use a simple approach: store code in a new model or extend existing one
        # Let's use a deployment-based approach for UserProblemState
        from models.db_models import UserProblemState, Problem, DeploymentProblemLink
        
        # First, try to find a properly linked problem
        linked_problem = db.exec(
            select(Problem)
            .join(DeploymentProblemLink, Problem.id == DeploymentProblemLink.problem_id)
            .where(DeploymentProblemLink.deployment_id == db_deployment.id)
        ).first()
        
        existing_problem = linked_problem
        
        if not existing_problem:
            # Fallback: check for virtual problem by identifier
            problem_identifier = f"deployment_{deployment_id}"
            existing_problem = db.exec(
                select(Problem).where(
                    Problem.title == problem_identifier,
                    Problem.class_id == db_deployment.class_id,
                )
            ).first()
        
        if not existing_problem:
            # Create a virtual problem for this deployment as last resort
            problem_info = {}
            if await load_deployment_on_demand(deployment_id, current_user.id, db):
                deployment_mem = get_active_deployment(deployment_id)
                problem_info = deployment_mem["mcp_deployment"].get_code_problem_info() or {}
            
            existing_problem = Problem(
                title=f"deployment_{deployment_id}",
                description=problem_info.get("description", "Code Challenge"),
                class_id=db_deployment.class_id,
                created_by_id=db_deployment.user_id,
            )
            db.add(existing_problem)
            db.commit()
            db.refresh(existing_problem)
        
        # Check if user already has a state for this problem
        user_state = db.exec(
            select(UserProblemState).where(
                UserProblemState.user_id == current_user.id,
                UserProblemState.problem_id == existing_problem.id,
            )
        ).first()
        
        if user_state:
            # Update existing state
            user_state.current_code = request.code
            db.add(user_state)
        else:
            # Create new state
            user_state = UserProblemState(
                user_id=current_user.id,
                problem_id=existing_problem.id,
                current_code=request.code,
            )
            db.add(user_state)
        
        db.commit()
        
        return {
            "deployment_id": deployment_id,
            "message": "Code saved successfully",
            "saved_at": datetime.now(timezone.utc).isoformat(),
        }
        
    except Exception as e:
        print(f"Error saving code for deployment {deployment_id}: {e}")
        import traceback
        print(f"Code save error traceback:\n{traceback.format_exc()}")
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save code: {str(e)}"
        )

# Load user code for CODE deployment
@router.get("/{deployment_id}/load-code", response_model=CodeLoadResponse)
async def load_user_code(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    # Validate deployment exists and user has access
    db_deployment = db.exec(
        select(Deployment).where(
            Deployment.deployment_id == deployment_id,
            Deployment.is_active == True,
        )
    ).first()

    if not db_deployment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found",
        )

    if not user_can_access_deployment(current_user, db_deployment, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You must be a member of this class to load code.",
        )

    if db_deployment.type != DeploymentType.CODE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Deployment is not of CODE type",
        )

    try:
        # Look for existing user code state
        from models.db_models import UserProblemState, Problem, DeploymentProblemLink
        
        # First, try to find a properly linked problem
        linked_problem = db.exec(
            select(Problem)
            .join(DeploymentProblemLink, Problem.id == DeploymentProblemLink.problem_id)
            .where(DeploymentProblemLink.deployment_id == db_deployment.id)
        ).first()
        
        existing_problem = linked_problem
        
        if not existing_problem:
            # Fallback: check for virtual problem by identifier
            problem_identifier = f"deployment_{deployment_id}"
            existing_problem = db.exec(
                select(Problem).where(
                    Problem.title == problem_identifier,
                    Problem.class_id == db_deployment.class_id,
                )
            ).first()
        
        if not existing_problem:
            # No saved code, return empty
            return CodeLoadResponse(
                deployment_id=deployment_id,
                code="",
                last_saved="",
            )
        
        # Check if user has saved code for this problem
        user_state = db.exec(
            select(UserProblemState).where(
                UserProblemState.user_id == current_user.id,
                UserProblemState.problem_id == existing_problem.id,
            )
        ).first()
        
        if user_state:
            return CodeLoadResponse(
                deployment_id=deployment_id,
                code=user_state.current_code,
                last_saved=existing_problem.created_at.isoformat(),
            )
        else:
            # No saved code for this user
            return CodeLoadResponse(
                deployment_id=deployment_id,
                code="",
                last_saved="",
            )
        
    except Exception as e:
        print(f"Error loading code for deployment {deployment_id}: {e}")
        import traceback
        print(f"Code load error traceback:\n{traceback.format_exc()}")
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load code: {str(e)}"
        )

# Create new conversation for a deployment
@router.post("/{deployment_id}/conversations", response_model=ConversationResponse)
async def create_conversation(
    deployment_id: str,
    request: ConversationCreateRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    # Get deployment from database to check permissions
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
    
    # Check if user can access this deployment (class membership based)
    if not user_can_access_deployment(current_user, db_deployment, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You must be a member of this class to create conversations."
        )
    
    # Load deployment on-demand if not in memory
    if not await load_deployment_on_demand(deployment_id, current_user.id, db):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found or failed to initialize"
        )
    
    deployment = get_active_deployment(deployment_id)
    
    # Generate title if not provided
    title = request.title or "New Conversation"
    
    conversation = ChatConversation(
        deployment_id=deployment_id,
        user_id=current_user.id,
        title=title,
        workflow_name=deployment["workflow_name"]
    )
    
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    
    return ConversationResponse(
        id=conversation.id,
        deployment_id=conversation.deployment_id,
        title=conversation.title,
        workflow_name=conversation.workflow_name,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        message_count=0
    )

# Get all conversations for a deployment
@router.get("/{deployment_id}/conversations", response_model=List[ConversationResponse])
async def get_conversations(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    # Get deployment from database to check permissions
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
    
    # Check if user can access this deployment (class membership based)
    if not user_can_access_deployment(current_user, db_deployment, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You must be a member of this class to view conversations."
        )
    
    # Get conversations with message counts (only user's own conversations)
    conversations = db.exec(
        select(ChatConversation).where(
            ChatConversation.deployment_id == deployment_id,
            ChatConversation.user_id == current_user.id,
            ChatConversation.is_active == True
        ).order_by(ChatConversation.updated_at.desc())
    ).all()
    
    result = []
    for conv in conversations:
        # Count messages for this conversation
        message_count = db.exec(
            select(ChatMessage).where(ChatMessage.conversation_id == conv.id)
        ).all()
        
        result.append(ConversationResponse(
            id=conv.id,
            deployment_id=conv.deployment_id,
            title=conv.title,
            workflow_name=conv.workflow_name,
            created_at=conv.created_at,
            updated_at=conv.updated_at,
            message_count=len(message_count)
        ))
    
    return result

# Get all student conversations for a deployment (instructors only)
@router.get("/{deployment_id}/all-conversations", response_model=List[ConversationResponse])
async def get_all_student_conversations(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    # Get deployment from database to check permissions
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
    
    # Check if user is instructor in this class
    if not user_has_role_in_class(current_user, db_deployment.class_id, ClassRole.INSTRUCTOR, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only instructors can view all student conversations"
        )
    
    # Get all conversations for this deployment
    conversations = db.exec(
        select(ChatConversation).where(
            ChatConversation.deployment_id == deployment_id,
            ChatConversation.is_active == True
        ).order_by(ChatConversation.updated_at.desc())
    ).all()
    
    result = []
    for conv in conversations:
        # Count messages for this conversation
        message_count = db.exec(
            select(ChatMessage).where(ChatMessage.conversation_id == conv.id)
        ).all()
        
        # Get user info for the conversation owner
        conv_user = db.get(User, conv.user_id)
        user_email = conv_user.email if conv_user else "Unknown"
        
        result.append(ConversationResponse(
            id=conv.id,
            deployment_id=conv.deployment_id,
            title=f"{conv.title} (by {user_email})",
            workflow_name=conv.workflow_name,
            created_at=conv.created_at,
            updated_at=conv.updated_at,
            message_count=len(message_count)
        ))
    
    return result

# Get messages for a specific conversation
@router.get("/{deployment_id}/conversations/{conversation_id}/messages", response_model=List[MessageResponse])
async def get_conversation_messages(
    deployment_id: str,
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    # Get deployment from database to check permissions
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
    
    # Verify conversation exists
    conversation = db.get(ChatConversation, conversation_id)
    if not conversation or conversation.deployment_id != deployment_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
    
    # Check permissions - user can view their own conversations or instructors can view any
    user_can_view = (
        conversation.user_id == current_user.id or 
        user_has_role_in_class(current_user, db_deployment.class_id, ClassRole.INSTRUCTOR, db)
    )
    
    if not user_can_view:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You can only view your own conversations or be an instructor of this class."
        )
    
    messages = db.exec(
        select(ChatMessage).where(
            ChatMessage.conversation_id == conversation_id
        ).order_by(ChatMessage.created_at.asc())
    ).all()
    
    return [
        MessageResponse(
            id=msg.id,
            message_text=msg.message_text,
            is_user_message=msg.is_user_message,
            sources=msg.sources,
            created_at=msg.created_at
        )
        for msg in messages
    ]

# Delete a conversation
@router.delete("/{deployment_id}/conversations/{conversation_id}")
async def delete_conversation(
    deployment_id: str,
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    # Get deployment from database to check permissions
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
    
    # Verify conversation exists and belongs to user
    conversation = db.get(ChatConversation, conversation_id)
    if not conversation or conversation.deployment_id != deployment_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
    
    # Check permissions - user can delete their own conversations or instructors can delete any
    user_can_delete = (
        conversation.user_id == current_user.id or 
        user_has_role_in_class(current_user, db_deployment.class_id, ClassRole.INSTRUCTOR, db)
    )
    
    if not user_can_delete:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You can only delete your own conversations or be an instructor of this class."
        )
    
    # Soft delete the conversation
    conversation.is_active = False
    db.add(conversation)
    db.commit()
    
    return {"message": f"Conversation {conversation_id} deleted successfully"}

# Delete and cleanup deployment
@router.delete("/{deployment_id}")
async def delete_deployment(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    # Check if deployment exists in database
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

# Get files used for RAG in a deployment
@router.get("/{deployment_id}/files")
async def get_deployment_files(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    try:
        print(f"[FILES] Getting files for deployment {deployment_id} requested by user {current_user.id}")
        
        # Get deployment from database to check permissions
        db_deployment = db.exec(
            select(Deployment).where(
                Deployment.deployment_id == deployment_id,
                Deployment.is_active == True
            )
        ).first()
        
        if not db_deployment:
            print(f"[FILES] Deployment {deployment_id} not found in database")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deployment not found"
            )
        
        print(f"[FILES] Found deployment: ID={db_deployment.id}, workflow_id={db_deployment.workflow_id}, class_id={db_deployment.class_id}")
        print(f"[FILES] RAG document IDs: {db_deployment.rag_document_ids}")
        print(f"[FILES] Collection name: {db_deployment.collection_name}")
        
        # Check if user can access this deployment (class membership based)
        if not user_can_access_deployment(current_user, db_deployment, db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. You must be a member of this class to view deployment files."
            )
        
        # Get RAG document IDs from deployment
        rag_document_ids = db_deployment.rag_document_ids or []
        print(f"[FILES] RAG document IDs from deployment: {rag_document_ids}")
        
        if not rag_document_ids:
            print(f"[FILES] No RAG document IDs found for deployment {deployment_id}")
            print(f"[FILES] Has MCP enabled: {db_deployment.config.get('has_mcp', False)}")
            return {
                "deployment_id": deployment_id,
                "workflow_name": db_deployment.workflow_name,
                "has_rag": db_deployment.config.get("has_mcp", False),
                "file_count": 0,
                "files": [],
                "message": "No files used for RAG in this deployment"
            }
        
        # Get documents by IDs
        documents = db.exec(
            select(Document).where(
                Document.id.in_(rag_document_ids),
                Document.is_active == True
            ).order_by(Document.uploaded_at.desc())
        ).all()
        
        print(f"[FILES] Found {len(documents)} documents in database for IDs: {rag_document_ids}")
        
        # Get the backend base URL from environment or default
        backend_host = os.getenv("BACKEND_HOST", "localhost")
        backend_port = os.getenv("BACKEND_PORT", "8000")
        backend_scheme = os.getenv("BACKEND_SCHEME", "http")
        backend_base_url = f"{backend_scheme}://{backend_host}:{backend_port}"
        
        # Prepare file list with viewing information
        file_list = []
        for doc in documents:
            file_info = {
                "id": doc.id,
                "filename": doc.original_filename,
                "file_size": doc.file_size,
                "file_type": doc.file_type,
                "chunk_count": doc.chunk_count,
                "upload_id": doc.upload_id,
                "uploaded_at": doc.uploaded_at.isoformat(),
                "uploaded_by_id": doc.uploaded_by_id,
                "has_stored_file": doc.storage_path is not None,
                "can_view": doc.storage_path is not None,
                "can_download": doc.storage_path is not None,
                "view_url": f"{backend_base_url}/api/files/view/{doc.id}" if doc.storage_path else None,
                "download_url": f"{backend_base_url}/api/files/download/{doc.id}" if doc.storage_path else None
            }
            
            # Get uploader info for display
            if doc.uploaded_by_id:
                uploader = db.get(User, doc.uploaded_by_id)
                file_info["uploaded_by_email"] = uploader.email if uploader else "Unknown"
            
            file_list.append(file_info)
        
        return {
            "deployment_id": deployment_id,
            "workflow_name": db_deployment.workflow_name,
            "workflow_id": db_deployment.workflow_id,
            "class_id": db_deployment.class_id,
            "collection_name": db_deployment.collection_name,
            "has_rag": db_deployment.config.get("has_mcp", False),
            "rag_enabled": len(rag_document_ids) > 0,
            "file_count": len(file_list),
            "files": file_list,
            "created_at": db_deployment.created_at.isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting deployment files: {e}")
        import traceback
        print(f"Deployment files error traceback:\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get deployment files: {str(e)}"
        )

# Test streaming functionality for a deployment
@router.post("/{deployment_id}/test-streaming")
async def test_deployment_streaming(
    deployment_id: str,
    test_message: str = "Hello, this is a test message for streaming functionality.",
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    
    # Load deployment on-demand if not in memory
    if not await load_deployment_on_demand(deployment_id, current_user.id, db):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found or failed to initialize"
        )
    
    deployment = get_active_deployment(deployment_id)
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

# Get student submissions for CODE deployment (instructors only)
@router.get("/{deployment_id}/submissions")
async def get_deployment_submissions(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    # Validate deployment exists and user has access
    db_deployment = db.exec(
        select(Deployment).where(
            Deployment.deployment_id == deployment_id,
            Deployment.is_active == True,
        )
    ).first()

    if not db_deployment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found",
        )

    # Check if user is instructor in this class
    if not user_has_role_in_class(current_user, db_deployment.class_id, ClassRole.INSTRUCTOR, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only instructors can view student submissions"
        )

    if db_deployment.type != DeploymentType.CODE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Deployment is not of CODE type",
        )

    try:
        from models.db_models import Problem, DeploymentProblemLink, Submission, User as DbUser, SubmissionStatus
        
        # Find the linked problem for this deployment
        linked_problem = db.exec(
            select(Problem)
            .join(DeploymentProblemLink, Problem.id == DeploymentProblemLink.problem_id)
            .where(DeploymentProblemLink.deployment_id == db_deployment.id)
        ).first()
        
        if not linked_problem:
            return {
                "deployment_id": deployment_id,
                "deployment_name": db_deployment.workflow_name,
                "problem_id": None,
                "submissions": [],
                "student_count": 0,
                "total_submissions": 0
            }
        
        # Get all submissions for this problem with user information
        submissions_query = (
            select(Submission, DbUser)
            .join(DbUser, Submission.user_id == DbUser.id)
            .where(Submission.problem_id == linked_problem.id)
            .order_by(Submission.submitted_at.desc())
        )
        
        submission_results = db.exec(submissions_query).all()
        
        # Group submissions by user (latest submission per user)
        user_submissions = {}
        all_submissions = []
        
        for submission, user in submission_results:
            submission_data = {
                "id": submission.id,
                "user_id": user.id,
                "user_email": user.email,
                "code": submission.code,
                "status": submission.status.value,
                "execution_time": submission.execution_time,
                "error": submission.error,
                "submitted_at": submission.submitted_at.isoformat(),
                "passed": submission.status == SubmissionStatus.PASSED
            }
            
            all_submissions.append(submission_data)
            
            # Keep track of latest submission per user
            if user.id not in user_submissions or submission.submitted_at > user_submissions[user.id]["submitted_at_dt"]:
                user_submissions[user.id] = {
                    **submission_data,
                    "submitted_at_dt": submission.submitted_at
                }
        
        # Remove the datetime object used for comparison
        for user_sub in user_submissions.values():
            del user_sub["submitted_at_dt"]
        
        # Get problem info for context
        problem_info = None
        if await load_deployment_on_demand(deployment_id, current_user.id, db):
            deployment_mem = get_active_deployment(deployment_id)
            problem_info = deployment_mem["mcp_deployment"].get_code_problem_info()
        
        return {
            "deployment_id": deployment_id,
            "deployment_name": db_deployment.workflow_name,
            "problem_id": linked_problem.id,
            "problem_title": linked_problem.title,
            "problem_description": linked_problem.description,
            "problem_info": problem_info,
            "latest_submissions": list(user_submissions.values()),
            "all_submissions": all_submissions,
            "student_count": len(user_submissions),
            "total_submissions": len(all_submissions),
            "passed_students": sum(1 for sub in user_submissions.values() if sub["passed"]),
            "failed_students": sum(1 for sub in user_submissions.values() if not sub["passed"])
        }
        
    except Exception as e:
        print(f"Error getting submissions for deployment {deployment_id}: {e}")
        import traceback
        print(f"Submissions error traceback:\n{traceback.format_exc()}")
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get submissions: {str(e)}"
        )

# Get detailed test results for a specific submission (instructors only)
@router.get("/{deployment_id}/submissions/{submission_id}/test-results")
async def get_submission_test_results(
    deployment_id: str,
    submission_id: int,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    # Validate deployment exists and user has access
    db_deployment = db.exec(
        select(Deployment).where(
            Deployment.deployment_id == deployment_id,
            Deployment.is_active == True,
        )
    ).first()

    if not db_deployment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found",
        )

    # Check if user is instructor in this class
    if not user_has_role_in_class(current_user, db_deployment.class_id, ClassRole.INSTRUCTOR, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only instructors can view submission details"
        )

    if db_deployment.type != DeploymentType.CODE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Deployment is not of CODE type",
        )

    try:
        from models.db_models import Submission, User as DbUser
        
        # Get the submission with user info
        submission_query = (
            select(Submission, DbUser)
            .join(DbUser, Submission.user_id == DbUser.id)
            .where(Submission.id == submission_id)
        )
        
        submission_result = db.exec(submission_query).first()
        
        if not submission_result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Submission not found"
            )
        
        submission, user = submission_result
        
        # Load deployment and run tests on the submitted code to get detailed results
        if not await load_deployment_on_demand(deployment_id, current_user.id, db):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deployment not found or failed to initialize",
            )

        deployment_mem = get_active_deployment(deployment_id)
        mcp_deployment = deployment_mem["mcp_deployment"]
        
        # Re-run tests on submitted code to get detailed results
        test_results = mcp_deployment.run_all_tests(submission.code)
        
        if test_results is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to run tests on submitted code"
            )
        
        return {
            "submission_id": submission.id,
            "deployment_id": deployment_id,
            "user_email": user.email,
            "user_id": user.id,
            "submitted_at": submission.submitted_at.isoformat(),
            "status": submission.status.value,
            "execution_time": submission.execution_time,
            "code": submission.code,
            "analysis": submission.analysis,
            "test_results": DetailedCodeTestResult(
                deployment_id=deployment_id,
                all_passed=test_results["all_passed"],
                message="All tests passed!" if test_results["all_passed"] else f"{test_results['failed_tests']} out of {test_results['total_tests']} tests failed",
                total_tests=test_results["total_tests"],
                passed_tests=test_results["passed_tests"],
                failed_tests=test_results["failed_tests"],
                test_results=[
                    TestCaseResult(
                        test_id=result["test_id"],
                        parameters=result["parameters"],
                        expected_output=result["expected_output"],
                        actual_output=result["actual_output"],
                        passed=result["passed"],
                        error=result["error"],
                        execution_time=result["execution_time"]
                    )
                    for result in test_results["test_results"]
                ]
            )
        }
        
    except Exception as e:
        print(f"Error getting test results for submission {submission_id}: {e}")
        import traceback
        print(f"Submission test results error traceback:\n{traceback.format_exc()}")
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get test results: {str(e)}"
        )

# Load user code for CODE deployment 
