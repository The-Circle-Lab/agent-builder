import json
import asyncio
from pathlib import Path
from typing import Dict, Any, List, Optional
import os

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
    
    # Process chat messages
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
            provider = llm_config.get("provider", "vertexai")
            print(f"[{self.deployment_id}] CHAT REQUEST - LLM Call:")
            print(f"[{self.deployment_id}]   User Message: '{message[:100]}{'...' if len(message) > 100 else ''}'")
            print(f"[{self.deployment_id}]   Provider: {provider.upper()}")
            print(f"[{self.deployment_id}]   Model: {llm_config['model']}")
            print(f"[{self.deployment_id}]   Temperature: {llm_config['temperature']}")
            print(f"[{self.deployment_id}]   Max Tokens: {llm_config['max_tokens']}")
            print(f"[{self.deployment_id}]   Top P: {llm_config['top_p']}")
            print(f"[{self.deployment_id}]   Context Length: {len(context)} chars" if context else f"[{self.deployment_id}]   Context: None (no RAG)")
            print(f"[{self.deployment_id}]   History Length: {len(history)} exchanges")
            
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
                            response = "I apologize, but I'm having trouble generating a response right now. Could you please try rephrasing your question or ask something else?"
                        else:
                            # Brief delay before retry
                            await asyncio.sleep(0.5)
                            
                except Exception as llm_error:
                    print(f"[{self.deployment_id}] LLM error on attempt {attempt + 1}: {llm_error}")
                    if attempt == max_retries:
                        response = "I'm sorry, but I encountered an error while generating a response. Please try again."
                        break
                    else:
                        await asyncio.sleep(0.5)
            
            # Log final response status
            if response and response.strip():
                print(f"[{self.deployment_id}] LLM Response FINAL: Success - Generated {len(response)} characters")
            else:
                print(f"[{self.deployment_id}] LLM Response FINAL: Used fallback response")
            
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
