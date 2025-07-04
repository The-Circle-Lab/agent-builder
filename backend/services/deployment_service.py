import json
import asyncio
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import os
import subprocess

from langchain_google_vertexai import VertexAI
from langchain_openai import ChatOpenAI
from langchain.schema import HumanMessage, AIMessage, SystemMessage
from langchain.memory import ConversationBufferMemory
from langchain.schema.runnable import RunnablePassthrough
from langchain.schema.output_parser import StrOutputParser
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

class MCPChatDeployment:
    # Fallback response messages
    FALLBACK_ERROR_RESPONSE = "I apologize, but I'm having trouble generating a response right now. Could you please try rephrasing your question or ask something else?"
    FALLBACK_EXCEPTION_RESPONSE = "I'm sorry, but I encountered an error while generating a response. Please try again."
    FALLBACK_GENERIC_ERROR = "I'm sorry, I encountered an error while processing your question."
    
    def __init__(self, deployment_id: str, config: Dict[str, Any], collection_name: Optional[str] = None):
        self.deployment_id = deployment_id
        self.config = config
        self.collection_name = collection_name
        
        # Initialize LLM
        try:
            from pathlib import Path
            import sys
            
            # Add parent directory to path to import from config
            sys.path.append(str(Path(__file__).parent.parent))
            from scripts.config import load_config
            
            app_config = load_config()
            
            # Check provider type
            provider = config["llm_config"].get("provider", "vertexai")
            model = config["llm_config"].get("model", "unknown")
            
            print(f"DEBUG: Starting LLM initialization for deployment {deployment_id}")
            print(f"DEBUG: Provider from config: '{provider}'")
            print(f"DEBUG: Model from config: '{model}'")
            print(f"DEBUG: Full LLM config: {config['llm_config']}")
            
            if provider == "openai":
                # Initialize OpenAI
                openai_api_key = os.getenv("OPENAI_API_KEY")
                if not openai_api_key:
                    raise Exception("OPENAI_API_KEY environment variable is not set")
                
                self.llm = ChatOpenAI(
                    model=config["llm_config"]["model"],
                    temperature=config["llm_config"]["temperature"],
                    max_tokens=config["llm_config"]["max_tokens"],
                    top_p=config["llm_config"]["top_p"],
                    api_key=openai_api_key
                )
                print(f"OpenAI LLM initialized for deployment {deployment_id} with model {config['llm_config']['model']}")
            elif provider == "meta":
                # Initialize Alternative Models via Google Cloud Vertex AI MaaS
                print(f"DEBUG: Initializing Google Cloud Vertex AI MaaS provider for deployment {deployment_id}")
                
                project = app_config.get("google_cloud", {}).get("project")
                # Meta models are currently served only from us-central1
                location_cfg = app_config.get("google_cloud", {}).get("location", "us-east5")
                location = "us-central1" if location_cfg != "us-central1" else location_cfg
                
                if not project:
                    raise Exception("Google Cloud project not configured. Please set GOOGLE_CLOUD_PROJECT environment variable.")
                
                print(f"DEBUG: Using Google Cloud project: {project}, location: {location}")
                
                # Get Google Cloud access token
                def get_access_token():
                    try:
                        result = subprocess.run(
                            ["gcloud", "auth", "print-access-token"],
                            capture_output=True,
                            text=True,
                            check=True
                        )
                        token = result.stdout.strip()
                        print(f"DEBUG: Successfully obtained access token (length: {len(token)})")
                        return token
                    except subprocess.CalledProcessError as e:
                        error_msg = f"Failed to get Google Cloud access token. Make sure you're authenticated with 'gcloud auth login': {e}"
                        if e.stderr:
                            error_msg += f". Error output: {e.stderr}"
                        raise Exception(error_msg)
                
                access_token = get_access_token()
                
                # Meta models use OpenAI-compatible API format via Google Cloud
                base_url = f"https://{location}-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/endpoints/openapi"
                
                print(f"DEBUG: Google Cloud Vertex AI MaaS base URL: {base_url}")
                print(f"DEBUG: Google Cloud Vertex AI MaaS model: {config['llm_config']['model']}")
                
                # Store token refresh function for later use
                self._get_access_token = get_access_token
                
                self.llm = ChatOpenAI(
                    model=config["llm_config"]["model"],
                    temperature=config["llm_config"]["temperature"],
                    max_tokens=config["llm_config"]["max_tokens"],
                    top_p=config["llm_config"]["top_p"],
                    api_key=access_token,  # Use Google Cloud access token
                    base_url=base_url,     # Use Google Cloud Vertex AI endpoint
                    default_headers={
                        "Authorization": f"Bearer {access_token}"
                    }
                )
                print(f"Google Cloud Vertex AI MaaS LLM initialized for deployment {deployment_id} with model {config['llm_config']['model']} via Google Cloud MaaS")
                print(f"Google Cloud Vertex AI MaaS endpoint: {base_url}")
            elif provider == "deepseek":
                # Initialize DeepSeek API
                deepseek_api_key = os.getenv("DEEPSEEK_API_KEY")
                if not deepseek_api_key:
                    raise Exception("DEEPSEEK_API_KEY environment variable is not set")
                
                # DeepSeek uses OpenAI-compatible API
                self.llm = ChatOpenAI(
                    model=config["llm_config"]["model"],
                    temperature=config["llm_config"]["temperature"],
                    max_tokens=config["llm_config"]["max_tokens"],
                    top_p=config["llm_config"]["top_p"],
                    api_key=deepseek_api_key,
                    base_url="https://api.deepseek.com"  # DeepSeek API endpoint
                )
                print(f"DeepSeek LLM initialized for deployment {deployment_id} with model {config['llm_config']['model']}")
            else: # As of right now, anthropic works through google cloud only
                # Initialize VertexAI (default)
                self.llm = VertexAI(
                    model_name=config["llm_config"]["model"],
                    project=app_config.get("google_cloud", {}).get("project"),
                    location=app_config.get("google_cloud", {}).get("location"),
                    temperature=config["llm_config"]["temperature"],
                    max_output_tokens=config["llm_config"]["max_tokens"],
                    top_p=config["llm_config"]["top_p"],
                )
                print(f"VertexAI LLM initialized for deployment {deployment_id} with model {config['llm_config']['model']}")
        except Exception as llm_error:
            print(f"Failed to initialize LLM: {llm_error}")
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
    
    # Refresh the Google Cloud access token for Meta if needed (DeepSeek uses its own API)
    def _refresh_google_cloud_maas_token(self):
        provider = self.config["llm_config"].get("provider")
        if hasattr(self, '_get_access_token') and provider == "meta":
            try:
                new_token = self._get_access_token()
                
                # Recreate the LLM client with new token
                # ChatOpenAI doesn't allow updating api_key after initialization
                from pathlib import Path
                import sys
                sys.path.append(str(Path(__file__).parent.parent))
                from scripts.config import load_config
                
                app_config = load_config()
                location_cfg = app_config.get("google_cloud", {}).get("location", "us-east5")
                location = "us-central1" if location_cfg != "us-central1" else location_cfg
                project = app_config.get("google_cloud", {}).get("project")
                
                base_url = f"https://{location}-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/endpoints/openapi"
                
                self.llm = ChatOpenAI(
                    model=self.config["llm_config"]["model"],
                    temperature=self.config["llm_config"]["temperature"],
                    max_tokens=self.config["llm_config"]["max_tokens"],
                    top_p=self.config["llm_config"]["top_p"],
                    api_key=new_token,
                    base_url=base_url,
                    default_headers={
                        "Authorization": f"Bearer {new_token}"
                    }
                )
                
                print(f"[{self.deployment_id}] DEBUG: Refreshed {provider} access token")
                return True
            except Exception as e:
                print(f"[{self.deployment_id}] ERROR: Failed to refresh {provider} token: {e}")
                return False
        return False

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
    
    # Helper method to restore conversation history
    async def _restore_conversation_history(self, history: List[List[str]]) -> None:
        self.memory.clear()
        for h in history:
            if len(h) >= 2:
                # Only add messages if they have non-empty content
                # This prevents 400 errors from empty assistant messages
                user_msg = h[0].strip()
                ai_msg = h[1].strip()
                
                if user_msg and ai_msg:
                    self.memory.chat_memory.add_user_message(h[0])
                    self.memory.chat_memory.add_ai_message(h[1])
                elif user_msg and not ai_msg:
                    # Skip this exchange if assistant message is empty
                    print(f"[{self.deployment_id}] Skipping history entry with empty assistant response")
    
    # Helper method to search and format context
    async def _prepare_context(self, message: str, k: int = 15) -> Tuple[List[Dict[str, Any]], str]:
        search_results = []
        context = ""
        
        if self.config["has_mcp"] and self.collection_name:
            search_results = await self._search_with_mcp(message, k=k)
            context = self.format_context(search_results)
        
        return search_results, context
    
    # Helper method to log LLM call details
    def _log_llm_call(self, message: str, context: str, history_length: int, is_streaming: bool = False) -> None:
        llm_config = self.config["llm_config"]
        provider = llm_config.get("provider", "vertexai")
        request_type = "STREAMING CHAT REQUEST" if is_streaming else "CHAT REQUEST"
        
        print(f"[{self.deployment_id}] {request_type} - LLM Call:")
        print(f"[{self.deployment_id}]   User Message: '{message[:100]}{'...' if len(message) > 100 else ''}'")
        print(f"[{self.deployment_id}]   Provider: {provider.upper()}")
        print(f"[{self.deployment_id}]   Model: {llm_config['model']}")
        print(f"[{self.deployment_id}]   Temperature: {llm_config['temperature']}")
        print(f"[{self.deployment_id}]   Max Tokens: {llm_config['max_tokens']}")
        print(f"[{self.deployment_id}]   Top P: {llm_config['top_p']}")
        print(f"[{self.deployment_id}]   Context Length: {len(context)} chars" if context else f"[{self.deployment_id}]   Context: None (no RAG)")
        if not is_streaming:
            print(f"[{self.deployment_id}]   History Length: {history_length} exchanges")
    
    # Helper method to extract unique sources
    def _extract_unique_sources(self, search_results: List[Dict[str, Any]]) -> List[str]:
        sources = set()
        
        for doc in search_results:
            source = doc.get("source")
            if source and source != "Unknown" and source not in sources:
                sources.add(source)
        
        sources_list = sorted(list(sources))
        print(f"[{self.deployment_id}] Final unique sources returned: {sources_list}")
        return sources_list
    
    # Helper method to update conversation memory
    def _update_memory(self, user_message: str, ai_response: str) -> None:
        self.memory.chat_memory.add_user_message(user_message)
        self.memory.chat_memory.add_ai_message(ai_response)
    
    # Helper method to build prompt messages for streaming
    def _build_prompt_messages(self, message: str, context: str) -> List[Any]:
        messages = []
        
        # Add system message
        system_prompt = self.config["agent_config"]["system_prompt"] or ""
        if system_prompt:
            messages.append(SystemMessage(content=system_prompt))
        
        # Add chat history
        messages.extend(self.memory.chat_memory.messages)
        
        # Add current message with context
        if context:
            user_prompt = self._get_user_prompt_template().format(context=context, input=message)
        else:
            user_prompt = self._get_user_prompt_template().format(input=message)
        messages.append(HumanMessage(content=user_prompt))
        
        return messages
    
    # Process chat messages
    async def chat(self, message: str, history: List[List[str]] = []) -> Dict[str, Any]:
        try:
            # Restore conversation history
            await self._restore_conversation_history(history)
            
            # Search for relevant documents if MCP is enabled
            search_results, context = await self._prepare_context(message)
            
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
            self._log_llm_call(message, context, len(history))
            
            # Get response from LLM with retry logic for empty responses
            response = None
            max_retries = 3
            
            for attempt in range(max_retries + 1):  # 0, 1, 2, 3 (4 total attempts)
                try:
                    if attempt > 0:
                        print(f"[{self.deployment_id}] LLM Response Retry {attempt}/{max_retries}: Previous response was empty")
                    
                    response = await chain.ainvoke(chain_input)
                    
                    # Check if response is empty or just whitespace
                    if response and response.strip():
                        if attempt > 0:
                            print(f"[{self.deployment_id}] LLM Response Retry {attempt} succeeded with non-empty response")
                        break
                    else:
                        print(f"[{self.deployment_id}] LLM returned empty response on attempt {attempt + 1}")
                        if attempt == max_retries:
                            print(f"[{self.deployment_id}] All {max_retries + 1} attempts failed, using fallback response")
                            response = self.FALLBACK_ERROR_RESPONSE
                        else:
                            # Brief delay before retry
                            await asyncio.sleep(0.5)
                            
                except Exception as llm_error:
                    error_str = str(llm_error).lower()
                    print(f"[{self.deployment_id}] LLM error on attempt {attempt + 1}: {llm_error}")
                    
                    # Check if this is an authentication error that might be resolved by token refresh
                    provider = self.config["llm_config"].get("provider")
                    if (provider == "meta" and 
                        ("invalid" in error_str or "unauthorized" in error_str or "authentication" in error_str or "token" in error_str)):
                        
                        print(f"[{self.deployment_id}] Detected potential auth error for {provider}, attempting token refresh")
                        if self._refresh_google_cloud_maas_token():
                            print(f"[{self.deployment_id}] Token refreshed successfully, will retry")
                            continue  # Retry the request with fresh token
                        else:
                            print(f"[{self.deployment_id}] Token refresh failed")
                    
                    if attempt == max_retries:
                        response = self.FALLBACK_EXCEPTION_RESPONSE
                        break
                    else:
                        await asyncio.sleep(0.5)
            
            # Log final response status
            if response and response.strip():
                print(f"[{self.deployment_id}] LLM Response FINAL: Success - Generated {len(response)} characters")
            else:
                print(f"[{self.deployment_id}] LLM Response FINAL: Used fallback response")
            
            # Update memory
            self._update_memory(message, response)
            
            # Extract unique sources (deduplicate and remove empty ones)
            sources = self._extract_unique_sources(search_results)
            
            return {
                "response": response,
                "sources": sources
            }
            
        except Exception as e:
            print(f"Error in chat: {e}")
            import traceback
            print(f"Chat error traceback:\n{traceback.format_exc()}")
            return {
                "response": self.FALLBACK_GENERIC_ERROR,
                "sources": []
            }
    
    # Process chat messages with streaming support
    async def chat_streaming(self, message: str, history: List[List[str]] = [], stream_callback=None) -> Dict[str, Any]:
        try:
            # Restore conversation history
            await self._restore_conversation_history(history)
            
            # Search for relevant documents if MCP is enabled
            search_results, context = await self._prepare_context(message)
            
            # Prepare input for the chain
            chain_input = {"input": message}
            if context:
                chain_input["context"] = context
            
            # Log LLM call details
            self._log_llm_call(message, context, len(history), is_streaming=True)
            
            # Build prompt with history
            messages = self._build_prompt_messages(message, context)
            
            # Stream response
            response_chunks = []
            
            max_retries = 3
            for attempt in range(max_retries + 1):
                try:
                    # Use streaming if supported
                    if hasattr(self.llm, 'astream'):
                        async for chunk in self.llm.astream(messages):
                            if hasattr(chunk, 'content'):
                                chunk_text = chunk.content
                            else:
                                chunk_text = str(chunk)
                            
                            response_chunks.append(chunk_text)
                            
                            # Call stream callback if provided
                            if stream_callback:
                                await stream_callback(chunk_text)
                    else:
                        # Fallback to non-streaming for models that don't support it
                        response = await self.llm.ainvoke(messages)
                        if hasattr(response, 'content'):
                            full_response = response.content
                        else:
                            full_response = str(response)
                        
                        response_chunks = [full_response]
                        
                        # Simulate streaming by sending the full response
                        if stream_callback:
                            await stream_callback(full_response)
                    
                    # If we got here, the streaming worked
                    break
                    
                except Exception as stream_error:
                    error_str = str(stream_error).lower()
                    print(f"[{self.deployment_id}] Streaming error on attempt {attempt + 1}: {stream_error}")
                    
                    # Check if this is an authentication error that might be resolved by token refresh
                    provider = self.config["llm_config"].get("provider")
                    if (provider == "meta" and 
                        ("invalid" in error_str or "unauthorized" in error_str or "authentication" in error_str or "token" in error_str)):
                        
                        print(f"[{self.deployment_id}] Detected potential auth error for {provider} streaming, attempting token refresh")
                        if self._refresh_google_cloud_maas_token():
                            print(f"[{self.deployment_id}] Token refreshed successfully, will retry streaming")
                            continue  # Retry the request with fresh token
                        else:
                            print(f"[{self.deployment_id}] Token refresh failed")
                    
                    if attempt == max_retries:
                        # On final failure, set fallback response
                        response_chunks = [self.FALLBACK_EXCEPTION_RESPONSE]
                        break
                    else:
                        await asyncio.sleep(0.5)
            
            # Combine all chunks
            full_response = ''.join(response_chunks)
            
            # Handle empty response with retry
            if not full_response or not full_response.strip():
                print(f"[{self.deployment_id}] Empty streaming response, using fallback")
                full_response = self.FALLBACK_ERROR_RESPONSE
            
            # Update memory
            self._update_memory(message, full_response)
            
            # Extract unique sources
            sources = self._extract_unique_sources(search_results)
            
            print(f"[{self.deployment_id}] Streaming response complete: {len(full_response)} characters")
            
            return {
                "response": full_response,
                "sources": sources
            }
            
        except Exception as e:
            print(f"Error in streaming chat: {e}")
            import traceback
            print(f"Streaming chat error traceback:\n{traceback.format_exc()}")
            return {
                "response": self.FALLBACK_GENERIC_ERROR,
                "sources": []
            }
    
    # search with mcp
    async def _search_with_mcp(self, query: str, k: int = 10) -> List[Dict[str, Any]]:
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
    
    # Clean up resources
    async def close(self):
        print(f"MCPChatDeployment {self.deployment_id} cleaned up")

# Helper function to get file information for a deployment
def get_deployment_files_info(deployment_id: str, db_deployment, db_session) -> Dict[str, Any]:
    try:
        from sqlmodel import select
        from models.db_models import Document
        
        # Get RAG document IDs from deployment
        rag_document_ids = db_deployment.rag_document_ids or []
        
        if not rag_document_ids:
            return {
                "deployment_id": deployment_id,
                "file_count": 0,
                "files": [],
                "has_rag_files": False
            }
        
        # Get documents by IDs
        documents = db_session.exec(
            select(Document).where(
                Document.id.in_(rag_document_ids),
                Document.is_active == True
            ).order_by(Document.uploaded_at.desc())
        ).all()
        
        # Prepare simplified file list
        file_list = []
        for doc in documents:
            file_info = {
                "id": doc.id,
                "filename": doc.original_filename,
                "file_size": doc.file_size,
                "file_type": doc.file_type,
                "chunk_count": doc.chunk_count,
                "uploaded_at": doc.uploaded_at.isoformat(),
                "has_stored_file": doc.storage_path is not None,
                "can_view": doc.storage_path is not None
            }
            file_list.append(file_info)
        
        return {
            "deployment_id": deployment_id,
            "file_count": len(file_list),
            "files": file_list,
            "has_rag_files": len(file_list) > 0,
            "total_chunks": sum(doc.chunk_count for doc in documents),
            "total_file_size": sum(doc.file_size for doc in documents)
        }
        
    except Exception as e:
        print(f"Error getting deployment files info: {e}")
        return {
            "deployment_id": deployment_id,
            "file_count": 0,
            "files": [],
            "has_rag_files": False,
            "error": str(e)
        } 
