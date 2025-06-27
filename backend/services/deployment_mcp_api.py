from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session as DBSession, select
from database.db_models import User, Document, Workflow
from database.database import get_session
from services.auth import get_current_user
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import json
import uuid
import os
import asyncio
from pathlib import Path

from langchain_google_vertexai import VertexAI
from langchain.schema import HumanMessage, AIMessage, SystemMessage
from langchain.memory import ConversationBufferMemory
from langchain.schema.runnable import RunnablePassthrough
from langchain.schema.output_parser import StrOutputParser
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

router = APIRouter(prefix="/api/deploy", tags=["deployment"])

# Store active deployments with MCP sessions
ACTIVE_DEPLOYMENTS: Dict[str, Dict[str, Any]] = {}

# Debug endpoint to check authentication
@router.get("/debug/auth")
async def debug_auth(current_user: User = Depends(get_current_user)):
    return {
        "authenticated": True,
        "user_id": current_user.id,
        "user_email": current_user.email,
        "message": "Authentication is working correctly"
    }

class DeploymentRequest(BaseModel):
    workflow_name: str
    workflow_id: int
    workflow_data: Dict[str, Any]

class DeploymentResponse(BaseModel):
    deployment_id: str
    chat_url: str
    message: str
    configuration: Dict[str, Any]

class ChatRequest(BaseModel):
    message: str
    history: List[List[str]] = []

class ChatResponse(BaseModel):
    response: str
    sources: List[str] = []

# MCP Deployment
class MCPChatDeployment:
    def __init__(self, deployment_id: str, config: Dict[str, Any], collection_name: Optional[str] = None):
        self.deployment_id = deployment_id
        self.config = config
        self.collection_name = collection_name
        
        # Initialize LLM
        try:
            self.llm = VertexAI(
                model_name=config["llm_config"]["model"],
                project=os.getenv("GOOGLE_CLOUD_PROJECT"),
                location=os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1"),
                temperature=config["llm_config"]["temperature"],
                max_output_tokens=config["llm_config"]["max_tokens"],
                top_p=config["llm_config"]["top_p"],
            )
            print(f"LLM initialized for deployment {deployment_id}")
        except Exception as llm_error:
            print(f"Failed to initialize VertexAI LLM: {llm_error}")
            raise Exception(f"LLM initialization failed: {str(llm_error)}")
        
        # Initialize conversation memory
        self.memory = ConversationBufferMemory(
            memory_key="chat_history",
            return_messages=True
        )
        
        # Setup chat prompt template
        system_prompt = config["agent_config"]["system_prompt"] or ""
        
        self.prompt = ChatPromptTemplate.from_messages([
            SystemMessage(content=system_prompt),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", self._get_user_prompt_template())
        ])
        
        # No persistent MCP session - create per request
    
    def _get_user_prompt_template(self) -> str:
        base_template = self.config["agent_config"]["prompt"]
        
        # Replace {input} with {message} for LangChain compatibility
        # {input} will be replaced with the actual user message at runtime
        if "{input}" in base_template:
            # Use the template as-is, LangChain will handle the {input} replacement
            template = base_template
        else:
            # If no {input} placeholder, append the input at the end
            template = f"{base_template}\n\nUser message: {{input}}"
        
        if self.config["has_mcp"] and self.collection_name:
            # Include context for RAG-enabled workflows
            return f"Context from documents:\n{{context}}\n\nQuestion: {template}"
        else:
            # Simple prompt for non-RAG workflows
            return template
    

    # Format search results into context for LLM
    def format_context(self, search_results: List[Dict[str, Any]]) -> str:
        if not search_results:
            print(f"[{self.deployment_id}] No search results to format")
            return "No relevant documents found."
        
        # Deduplicate results based on source and page combination
        seen_sources = set()
        unique_results = []
        
        for doc in search_results:
            source = doc.get("source", "Unknown source")
            page = doc.get("page", "Unknown page")
            text = doc.get("text", "")
            
            # Create a unique key based on source and page
            unique_key = f"{source}||{page}"
            
            if unique_key not in seen_sources and text.strip():
                seen_sources.add(unique_key)
                unique_results.append(doc)
        
        # Log all unique sources being formatted
        sources = [doc.get("source", "Unknown source") for doc in unique_results]
        print(f"[{self.deployment_id}] Formatting context from {len(unique_results)} unique documents (deduplicated from {len(search_results)}):")
        for i, source in enumerate(sources, 1):
            filename = source.split('/')[-1] if '/' in source and source != "Unknown source" else source
            page = unique_results[i-1].get("page", "Unknown page")
            page_info = f" (Page {page})" if page != "Unknown page" else ""
            print(f"[{self.deployment_id}]   {i}. {filename}{page_info}")
        
        context_parts = []
        for i, doc in enumerate(unique_results, 1):
            source = doc.get("source", "Unknown source")
            page = doc.get("page", "Unknown page")
            text = doc.get("text", "")
            
            # Extract filename from source path for better readability
            if source and source != "Unknown source":
                filename = source.split('/')[-1] if '/' in source else source
                # Remove file extension for cleaner display
                filename_without_ext = filename.rsplit('.', 1)[0] if '.' in filename else filename
                doc_label = filename_without_ext
            else:
                doc_label = f"Document {i}"
            
            if page and page != "Unknown page":
                context_parts.append(f"{doc_label} (Page {page}):\n{text}")
            else:
                context_parts.append(f"{doc_label}:\n{text}")
        
        return "\n\n".join(context_parts)
    
    # Processes chat messages
    async def chat(self, message: str, history: List[List[str]] = []) -> Dict[str, Any]:
        try:
            # Restore conversation history
            self.memory.clear()
            for h in history:
                if len(h) >= 2:
                    self.memory.chat_memory.add_user_message(h[0])
                    self.memory.chat_memory.add_ai_message(h[1])
            
            # Search for relevant documents if MCP is enabled
            search_results = []
            context = ""
            
            if self.config["has_mcp"] and self.collection_name:
                # Use MCP client as a proper async context manager
                # Let the search find as many relevant results as needed, with a reasonable upper limit
                search_results = await self._search_with_mcp(message, k=15)
                context = self.format_context(search_results)
            
            # Create the chain
            chain = (
                RunnablePassthrough.assign(
                    chat_history=lambda x: self.memory.chat_memory.messages
                )
                | self.prompt
                | self.llm
                | StrOutputParser()
            )
            
            # Prepare input for the chain
            # The "input" key will replace any {input} placeholders in the prompt template
            chain_input = {"input": message}
            if context:
                chain_input["context"] = context
            
            # Log LLM call details
            llm_config = self.config["llm_config"]
            print(f"[{self.deployment_id}] CHAT REQUEST - LLM Call:")
            print(f"[{self.deployment_id}]   User Message: '{message[:100]}{'...' if len(message) > 100 else ''}'")
            print(f"[{self.deployment_id}]   Model: {llm_config['model']}")
            print(f"[{self.deployment_id}]   Temperature: {llm_config['temperature']}")
            print(f"[{self.deployment_id}]   Max Tokens: {llm_config['max_tokens']}")
            print(f"[{self.deployment_id}]   Top P: {llm_config['top_p']}")
            print(f"[{self.deployment_id}]   Context Length: {len(context)} chars" if context else f"[{self.deployment_id}]   Context: None (no RAG)")
            print(f"[{self.deployment_id}]   History Length: {len(history)} exchanges")
            
            # Get response from LLM
            response = await chain.ainvoke(chain_input)
            
            # Update memory
            self.memory.chat_memory.add_user_message(message)
            self.memory.chat_memory.add_ai_message(response)
            
            # Extract unique sources (deduplicate and remove empty ones)
            sources = set()
            
            for doc in search_results:
                source = doc.get("source")
                if source and source != "Unknown" and source not in sources:
                    sources.add(source)

            sources = sorted(list(sources))
            
            print(f"[{self.deployment_id}] Final unique sources returned: {sources}")
            
            return {
                "response": response,
                "sources": sources
            }
            
        except Exception as e:
            print(f"Error in chat: {e}")
            import traceback
            print(f"Chat error traceback:\n{traceback.format_exc()}")
            return {
                "response": "I'm sorry, I encountered an error while processing your question.",
                "sources": []
            }
    
    async def _search_with_mcp(self, query: str, k: int = 10) -> List[Dict[str, Any]]:
        """Search documents using MCP client as proper async context manager"""
        if not self.config["has_mcp"] or not self.collection_name:
            print(f"[{self.deployment_id}] MCP search skipped - MCP disabled or no collection")
            return []
        
        print(f"[{self.deployment_id}] Starting MCP search for query: '{query}' (k={k})")
        
        try:
            # Use extended MCP server with multiple tools
            server_script = "mcp_server.py" if self.config.get("use_extended_tools", True) else "retrieval_mcp_server.py"
            
            server_params = StdioServerParameters(
                command="python",
                args=[str(Path(__file__).parent / server_script)],
                env=None,
            )
            
            # Use the MCP client as a proper async context manager
            async with stdio_client(server_params) as (read_stream, write_stream):
                async with ClientSession(read_stream, write_stream) as session:
                    # Initialize the session first
                    await session.initialize()
                    
                    # Wait a moment for server to fully initialize
                    await asyncio.sleep(0.5)
                    
                    # Call the appropriate search tool
                    tool_name = "search_documents" if self.config.get("use_extended_tools", True) else "search_course"
                    collection_param = "collection_id" if tool_name == "search_documents" else "course_id"
                    
                    print(f"[{self.deployment_id}] Calling MCP tool '{tool_name}' with collection '{self.collection_name}'")
                    
                    # Add timeout to prevent hanging
                    try:
                        result = await asyncio.wait_for(
                            session.call_tool(
                                tool_name,
                                arguments={
                                    collection_param: self.collection_name,
                                    "query": query,
                                    "k": k
                                }
                            ),
                            timeout=30.0  # 30 second timeout
                        )
                    except asyncio.TimeoutError:
                        print(f"[{self.deployment_id}] MCP search timed out after 30 seconds")
                        return []
                    
                    # Parse the result
                    if result.content and len(result.content) > 0:
                        content = result.content[0]
                        if hasattr(content, 'text'):
                            # The FastMCP server returns the data directly
                            if isinstance(content.text, str):
                                try:
                                    parsed_result = json.loads(content.text)
                                    # Check if it's an error response
                                    if isinstance(parsed_result, dict) and "error" in parsed_result:
                                        error_msg = parsed_result['error']
                                        print(f"[{self.deployment_id}] MCP server error: {error_msg}")
                                        # Check if it's a missing collection error
                                        if "not found" in error_msg.lower() or "unavailable" in error_msg.lower():
                                            print(f"[{self.deployment_id}] Collection '{self.collection_name}' appears to be missing from Qdrant")
                                        return []
                                    
                                    results = parsed_result if isinstance(parsed_result, list) else [parsed_result]
                                    # Log all sources found
                                    sources = [doc.get("source", "Unknown") for doc in results if isinstance(doc, dict)]
                                    print(f"[{self.deployment_id}] MCP search found {len(results)} results from sources: {sources}")
                                    return results
                                except json.JSONDecodeError:
                                    # If not JSON, treat as plain text result
                                    print(f"[{self.deployment_id}] MCP search returned non-JSON text result")
                                    return [{"text": content.text, "source": "Unknown"}]
                            elif isinstance(content.text, list):
                                sources = [doc.get("source", "Unknown") for doc in content.text if isinstance(doc, dict)]
                                print(f"[{self.deployment_id}] MCP search found {len(content.text)} results from sources: {sources}")
                                return content.text
                            else:
                                print(f"[{self.deployment_id}] MCP search returned single result")
                                return [content.text] if content.text else []
                        else:
                            # Content is the data directly
                            if isinstance(content, list):
                                sources = [doc.get("source", "Unknown") for doc in content if isinstance(doc, dict)]
                                print(f"[{self.deployment_id}] MCP search found {len(content)} results from sources: {sources}")
                                return content
                            elif isinstance(content, dict):
                                source = content.get("source", "Unknown")
                                print(f"[{self.deployment_id}] MCP search found 1 result from source: {source}")
                                return [content]
                            else:
                                print(f"[{self.deployment_id}] MCP search returned unknown content type")
                                return [{"text": str(content), "source": "Unknown"}]
                    
                    print(f"[{self.deployment_id}] MCP search returned no results")
                    return []
                    
        except Exception as e:
            print(f"[{self.deployment_id}] Error searching documents: {e}")
            import traceback
            print(f"[{self.deployment_id}] Search error traceback:\n{traceback.format_exc()}")
            return []
    
    async def close(self):
        print(f"MCPChatDeployment {self.deployment_id} cleaned up")

# Extract workflow config from frontend
def parse_workflow_config(workflow_data: Dict[str, Any]) -> Dict[str, Any]:
    config = {
        "has_mcp": False,
        "mcp_has_documents": False,
        "collection_name": None,
        "use_extended_tools": True, 
        "llm_config": {
            "model": "gemini-2.5-flash",
            "temperature": 0.7,
            "max_tokens": 1000,
            "top_p": 0.9
        },
        "agent_config": {
            "prompt": "{input}",
            "system_prompt": ""
        }
    }
    
    # Parse workflow nodes
    for node_key, node_data in workflow_data.items():
        node_type = node_data.get("type")
        node_config = node_data.get("config", {})
        attachments = node_data.get("attachments", {})
        
        if node_type == "agent":
            # Extract agent configuration
            config["agent_config"]["prompt"] = node_config.get("prompt", "{input}")
            config["agent_config"]["system_prompt"] = node_config.get("systemPrompt", "")
            
            # Check for LLM model configuration
            llm_models = attachments.get("llmModel", [])
            if llm_models:
                llm_model = llm_models[0]  # Take first LLM
                if llm_model.get("type") == "googleCloud":
                    llm_config = llm_model.get("config", {})
                    config["llm_config"].update({
                        "model": llm_config.get("model", "gemini-2.5-flash"),
                        "temperature": llm_config.get("temperature", 0.7),
                        "max_tokens": llm_config.get("maximumOutputTokens", 1000),
                        "top_p": llm_config.get("topP", 0.9)
                    })
            
            # Check for MCP tools and extract collection info
            tools = attachments.get("tools", [])
            for tool in tools:
                if tool.get("type") == "mcp":
                    config["has_mcp"] = True
                    # Try to extract collection name from MCP config if available
                    mcp_config = tool.get("config", {})
                    if "files" in mcp_config or "collection" in mcp_config:
                        # MCP tool has documents/collection configured
                        config["mcp_has_documents"] = True
                    break
    
    return config

# Deploy workflow to chatbot
@router.post("/", response_model=DeploymentResponse)
async def deploy_workflow(
    request: DeploymentRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    try:
        # Debug: Check if current_user is valid
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
        
        # Check required environment variables
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
        config = parse_workflow_config(request.workflow_data)
        
        # Get workflow and its documents
        workflow = db.get(Workflow, request.workflow_id)
        if not workflow:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workflow not found"
            )
        
        if workflow.created_by_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to this workflow"
            )
        
        # Check for document collection if MCP is enabled and has documents
        collection_name = None
        if config["has_mcp"] and config.get("mcp_has_documents", True):
            # Check if we have documents for this specific workflow
            try:
                stmt = select(Document).where(
                    Document.workflow_id == workflow.id,
                    Document.uploaded_by_id == current_user.id,
                    Document.is_active == True
                )
                documents = db.exec(stmt).all()
            except Exception as doc_error:
                print(f"Error querying documents: {doc_error}")
                documents = []
            
            if documents:
                # Use the workflow-specific collection
                collection_name = f"{workflow.workflow_collection_id}_{current_user.id}"
                print(f"Using workflow collection: {collection_name}")
                print(f"Documents in workflow: {len(documents)}")
            else:
                print(f"No documents found for workflow {workflow.id}")
            
            config["collection_name"] = collection_name
        
        # Create MCP chat deployment
        mcp_deployment = MCPChatDeployment(deployment_id, config, collection_name)
        
        # Log LLM configuration for deployment
        llm_config = config["llm_config"]
        print(f"[{deployment_id}] DEPLOYMENT CREATED - LLM Configuration:")
        print(f"[{deployment_id}]   Model: {llm_config['model']}")
        print(f"[{deployment_id}]   Temperature: {llm_config['temperature']}")
        print(f"[{deployment_id}]   Max Tokens: {llm_config['max_tokens']}")
        print(f"[{deployment_id}]   Top P: {llm_config['top_p']}")
        print(f"[{deployment_id}]   Has MCP/RAG: {config['has_mcp']}")
        print(f"[{deployment_id}]   Collection: {collection_name}")
        
        # Store deployment configuration
        try:
            ACTIVE_DEPLOYMENTS[deployment_id] = {
                "user_id": current_user.id,
                "workflow_name": request.workflow_name,
                "config": config,
                "mcp_deployment": mcp_deployment,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "chat_history": []
            }
            print(f"Deployment stored successfully for user {current_user.id}")
        except Exception as storage_error:
            print(f"Error storing deployment: {storage_error}")
            raise
        
        chat_url = f"/chat/{deployment_id}"
        
        return DeploymentResponse(
            deployment_id=deployment_id,
            chat_url=chat_url,
            message=f"Successfully deployed {request.workflow_name} with MCP server",
            configuration={
                "workflow_id": workflow.id,
                "workflow_collection_id": workflow.workflow_collection_id,
                "model": config["llm_config"]["model"],
                "has_rag": config["has_mcp"],
                "collection": collection_name,
                "mcp_enabled": config["has_mcp"]
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
    current_user: User = Depends(get_current_user)
):
    if deployment_id not in ACTIVE_DEPLOYMENTS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found"
        )
    
    deployment = ACTIVE_DEPLOYMENTS[deployment_id]
    
    # Check user permission
    if deployment["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    try:
        print(f"🔄 Processing chat request for deployment {deployment_id}: {request.message}")
        mcp_deployment = deployment["mcp_deployment"]
        
        # Use MCP chat deployment
        result = await mcp_deployment.chat(request.message, request.history)
        
        # Store conversation in deployment history
        deployment["chat_history"].append([request.message, result["response"]])
        
        print(f"✅ Chat request completed for deployment {deployment_id}")
        return ChatResponse(
            response=result["response"],
            sources=result["sources"]
        )
        
    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        print(f"❌ Full chat error traceback for deployment {deployment_id}:\n{error_traceback}")
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Chat failed: {str(e)}"
        )

# Get active deployments
@router.get("/active")
async def list_active_deployments(
    current_user: User = Depends(get_current_user)
):
    user_deployments = {
        dep_id: {
            "deployment_id": dep_id,
            "workflow_name": dep_data["workflow_name"],
            "created_at": dep_data["created_at"],
            "chat_url": f"/chat/{dep_id}",
            "configuration": {
                "model": dep_data["config"]["llm_config"]["model"],
                "has_rag": dep_data["config"]["has_mcp"],
                "mcp_enabled": dep_data["config"]["has_mcp"]
            }
        }
        for dep_id, dep_data in ACTIVE_DEPLOYMENTS.items()
        if dep_data["user_id"] == current_user.id
    }
    
    return {"deployments": list(user_deployments.values())}

# Delete and cleanup deployment
@router.delete("/{deployment_id}")
async def delete_deployment(
    deployment_id: str,
    current_user: User = Depends(get_current_user)
):
    
    if deployment_id not in ACTIVE_DEPLOYMENTS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found"
        )
    
    deployment = ACTIVE_DEPLOYMENTS[deployment_id]
    
    if deployment["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    # Clean up MCP server
    try:
        mcp_deployment = deployment.get("mcp_deployment")
        if mcp_deployment:
            await mcp_deployment.close()
    except Exception as e:
        print(f"Error cleaning up MCP deployment: {e}")
    
    del ACTIVE_DEPLOYMENTS[deployment_id]
    
    return {"message": f"Deployment {deployment_id} deleted successfully"}

# Cleanup function on server shutdown
async def cleanup_all_deployments():
    for deployment_id, deployment in ACTIVE_DEPLOYMENTS.items():
        try:
            mcp_deployment = deployment.get("mcp_deployment")
            if mcp_deployment:
                await mcp_deployment.close()
        except Exception as e:
            print(f"Error cleaning up deployment {deployment_id}: {e}")
    
    ACTIVE_DEPLOYMENTS.clear() 
 