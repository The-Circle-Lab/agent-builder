import os
import json
import asyncio
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from enum import Enum
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.schema import HumanMessage, AIMessage, SystemMessage
from langchain.memory import ConversationBufferMemory
from langchain.schema.runnable import RunnablePassthrough
from langchain.schema.output_parser import StrOutputParser
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

class ModelProviders(Enum):
    OPENAI = "openai"
    DEEPSEEK = "deepseek"

OPENAI_MODELS = ["gpt-4o-2024-08-06", "o4-mini-2025-04-16",
                "o3-2025-04-16", "gpt-4.1-mini-2025-04-14"]
DEEPSEEK_MODELS = ["deepseek-chat", "deepseek-reasoner"]

ENDPOINTS = {ModelProviders.OPENAI: "https://api.openai.com/v1",
             ModelProviders.DEEPSEEK: "https://api.deepseek.com"}

API_KEYS = {ModelProviders.OPENAI: os.getenv("OPENAI_API_KEY"),
            ModelProviders.DEEPSEEK: os.getenv("DEEPSEEK_API_KEY")}

# Fallback response messages
FALLBACK_ERROR_RESPONSE = "I apologize, but I'm having trouble generating a response right now. Could you please try rephrasing your question or ask something else?"
FALLBACK_EXCEPTION_RESPONSE = "I'm sorry, but I encountered an error while generating a response. Please try again."
FALLBACK_GENERIC_ERROR = "I'm sorry, I encountered an error while processing your question."


class Chat:
    _rag_used: bool
    _collection_name: str

    _model_provider: ModelProviders
    _model: str 
    _model_object: ChatOpenAI

    _temperature: float
    _max_tokens: int
    _top_p: float

    _memory: ConversationBufferMemory
    _prompt_template: ChatPromptTemplate
    _config: Dict[str, Any]
    
    def __init__(self, config: Dict[str, Any], rag_used: bool, collection_name: str):
        try:
            self._config = config
            self._model = config["llm_config"]["model"]

            if self._model in OPENAI_MODELS:
                self._model_provider = ModelProviders.OPENAI
            elif self._model in DEEPSEEK_MODELS:
                self._model_provider = ModelProviders.DEEPSEEK
            else:
                raise ValueError(f"Invalid model name: {self._model}")
            
            self._max_tokens = config["llm_config"]["max_tokens"]
            self._temperature = config["llm_config"]["temperature"]
            self._top_p = config["llm_config"]["top_p"]

            self._rag_used = rag_used
            self._collection_name = collection_name

            _user_prompt_template = self._get_user_prompt_template(config["agent_config"]["prompt"])
            _system_prompt = config["agent_config"]["system_prompt"] or ""

            self._prompt_template = ChatPromptTemplate.from_messages([
                SystemMessage(content=_system_prompt),
                MessagesPlaceholder(variable_name="chat_history"),
                ("human", _user_prompt_template)
            ])

            self._memory = ConversationBufferMemory(
                memory_key="chat_history",
                return_messages=True
            )
        except Exception as e:
            print(f"Error initializing chat object with config: {config}")
            raise e

        try:
            self._model_object = ChatOpenAI(
                model=self._model,
                api_key=API_KEYS[self._model_provider],
                base_url=ENDPOINTS[self._model_provider],
                temperature=self._temperature,
                max_tokens=self._max_tokens,
                top_p=self._top_p
            )
        except Exception as e:
            print(f"Error initializing model object: {e}")
            raise e


    def _get_user_prompt_template(self, prompt: str) -> str:
        base_template = prompt
        
        if "{input}" in base_template:
            template = base_template
        else:
            # If no {input} placeholder, append the input at the end
            template = f"{base_template}\n\nUser message: {{input}}"
        
        # Include context for RAG-enabled workflows
        if self._rag_used:
            return f"Context from documents:\n{{context}}\n\nQuestion: {template}"
        else:
            return template
    
    def _format_search_results(self, search_results: List[Dict[str, Any]]) -> str:
        if not search_results:
            return "No relevant documents found."
        
        seen_sources = set()
        unique_results = []

        for doc in search_results:
            source = doc.get("source", "Unknown source")
            page = doc.get("page", "Unknown page")
            text = doc.get("text", "")
            
            unique_key = f"{source}||{page}"
            
            if unique_key not in seen_sources and text.strip():
                seen_sources.add(unique_key)
                unique_results.append(doc)
        
        context_parts = []
        for i, doc in enumerate(unique_results, 1):
            source = doc.get("source", "Unknown source")
            page = doc.get("page", "Unknown page")
            text = doc.get("text", "")
            
            if source and source != "Unknown source":
                # Extract filename from source path for better readability
                filename = source.split('/')[-1] if '/' in source else source
                filename_without_ext = filename.rsplit('.', 1)[0] if '.' in filename else filename
                doc_label = filename_without_ext
            else:
                doc_label = f"Document {i}"
            
            if page and page != "Unknown page":
                context_parts.append(f"{doc_label} (Page {page}):\n{text}")
            else:
                context_parts.append(f"{doc_label}:\n{text}")
        
        return "\n\n".join(context_parts)

    def _build_prompt_messages(self, message: str, context: str) -> List[Any]:
        messages = []
        
        
        try:
            sys_prompt_msg = next(
                m for m in self._prompt_template.messages if isinstance(m, SystemMessage)
            )
            system_prompt_text = sys_prompt_msg.content
        except StopIteration:
            system_prompt_text = ""

        if system_prompt_text:
            messages.append(SystemMessage(content=system_prompt_text))
        
        messages.extend(self._memory.chat_memory.messages)
        
        raw_user_template = self._get_user_prompt_template(self._config["agent_config"]["prompt"])

        if context:
            user_prompt_text = raw_user_template.format(context=context, input=message)
        else:
            user_prompt_text = raw_user_template.format(input=message)

        messages.append(HumanMessage(content=user_prompt_text))
        
        return messages
    
    async def _restore_conversation_history(self, history: List[List[str]]) -> None:
        if not history:
            return

        # Build a set of (user, ai) message tuples already in memory to avoid
        # inserting duplicates.
        existing_pairs: set[tuple[str, str]] = set()
        msgs = self._memory.chat_memory.messages
        for i in range(0, len(msgs), 2):
            try:
                user_content = msgs[i].content  # type: ignore[attr-defined]
                ai_content = msgs[i + 1].content  # type: ignore[attr-defined]
                existing_pairs.add((user_content, ai_content))
            except IndexError:
                break

        for h in history:
            if len(h) < 2:
                continue

            user_msg, ai_msg = h[0].strip(), h[1].strip()
            if not user_msg or not ai_msg:
                continue

            if (user_msg, ai_msg) in existing_pairs:
                continue  # already stored

            self._memory.chat_memory.add_user_message(user_msg)
            self._memory.chat_memory.add_ai_message(ai_msg)

    async def _prepare_context(self, message: str, k: int = 15) -> Tuple[List[Dict[str, Any]], str]:
        search_results = []
        context = ""
        
        if self._rag_used and self._collection_name:
            search_results = await self._search_with_mcp(message, k=k)
            context = self._format_search_results(search_results)
        
        return search_results, context

    def _extract_unique_sources(self, search_results: List[Dict[str, Any]]) -> List[str]:
        sources = set()
        
        for doc in search_results:
            source = doc.get("source")
            if source and source != "Unknown" and source not in sources:
                sources.add(source)
        
        sources_list = sorted(list(sources))
        print(f"Final unique sources returned: {sources_list}")
        return sources_list

    def _update_memory(self, user_message: str, ai_response: str) -> None:
        self._memory.chat_memory.add_user_message(user_message)
        self._memory.chat_memory.add_ai_message(ai_response)

    async def chat(self, message: str, history: List[List[str]] = [], stream: bool = False, stream_callback: Optional[callable] = None) -> Dict[str, Any]:
        try:
            await self._restore_conversation_history(history)
            
            search_results, context = await self._prepare_context(message)
            
            full_response = ""
            max_retries = 3

            if stream:
                if not stream_callback:
                    raise ValueError("stream_callback must be provided when stream is True")
                
                for attempt in range(max_retries + 1):
                    try:
                        response_chunks = []
                        prompt_messages = self._build_prompt_messages(message, context)
                        async for chunk in self._model_object.astream(prompt_messages):
                            chunk_text = chunk.content if hasattr(chunk, 'content') else str(chunk)
                            response_chunks.append(chunk_text)
                            await stream_callback(chunk_text)
                        
                        full_response = "".join(response_chunks)
                        if full_response and full_response.strip():
                            break
                        
                        if attempt == max_retries:
                           full_response = self.FALLBACK_ERROR_RESPONSE
                           await stream_callback(full_response)
                        else:
                            await asyncio.sleep(0.5)

                    except Exception as e:
                        print(f"Streaming error on attempt {attempt + 1}: {e}")
                        if attempt == max_retries:
                            full_response = FALLBACK_EXCEPTION_RESPONSE
                            await stream_callback(full_response)
                            break
                        await asyncio.sleep(0.5)

            else: # Non-streaming
                chain = (
                    RunnablePassthrough.assign(
                        chat_history=lambda x: self._memory.chat_memory.messages
                    )
                    | self._prompt_template
                    | self._model_object
                    | StrOutputParser()
                )
                
                chain_input = {"input": message}
                if context:
                    chain_input["context"] = context

                for attempt in range(max_retries + 1):
                    try:
                        response = await chain.ainvoke(chain_input)
                        if response and response.strip():
                            full_response = response
                            break

                        if attempt == max_retries:
                            full_response = self.FALLBACK_ERROR_RESPONSE
                        else:
                             await asyncio.sleep(0.5)

                    except Exception as e:
                        print(f"LLM error on attempt {attempt + 1}: {e}")
                        if attempt == max_retries:
                            full_response = FALLBACK_EXCEPTION_RESPONSE
                            break
                        await asyncio.sleep(0.5)

            if not full_response or not full_response.strip():
                full_response = self.FALLBACK_ERROR_RESPONSE
            
            self._update_memory(message, full_response)
            sources = self._extract_unique_sources(search_results)

            print(f"Final response length: {len(full_response)} characters")

            return {"response": full_response, "sources": sources}

        except Exception as e:
            print(f"Error in chat: {e}")
            import traceback
            print(f"Chat error traceback:\n{traceback.format_exc()}")
            return {"response": self.FALLBACK_GENERIC_ERROR, "sources": []}

    async def _search_with_mcp(self, query: str, k: int = 10) -> List[Dict[str, Any]]:
        if not self._rag_used or not self._collection_name:
            print(f"MCP search skipped - RAG disabled or no collection")
            return []
        
        print(f"Starting MCP search for query: '{query}' (k={k})")
        
        try:
            server_script = str(Path(__file__).parent / "mcp_server.py")
            
            server_params = StdioServerParameters(
                command="python",
                args=[server_script],
                env=None,
            )
            
            async with stdio_client(server_params) as (read_stream, write_stream):
                async with ClientSession(read_stream, write_stream) as session:
                    await session.initialize()
                    await asyncio.sleep(0.5)
                    
                    tool_name = "search_documents"
                    collection_param = "collection_id"
                    
                    print(f"Calling MCP tool '{tool_name}' with collection '{self._collection_name}'")
                    
                    try:
                        result = await asyncio.wait_for(
                            session.call_tool(
                                tool_name,
                                arguments={
                                    collection_param: self._collection_name,
                                    "query": query,
                                    "k": k
                                }
                            ),
                            timeout=30.0
                        )
                    except asyncio.TimeoutError:
                        print(f"MCP search timed out after 30 seconds")
                        return []
                    
                    if result.content and len(result.content) > 0:
                        content = result.content[0]
                        if hasattr(content, 'text'):
                            if isinstance(content.text, str):
                                try:
                                    parsed_result = json.loads(content.text)
                                    if isinstance(parsed_result, dict) and "error" in parsed_result:
                                        error_msg = parsed_result['error']
                                        print(f"MCP server error: {error_msg}")
                                        if "not found" in error_msg.lower() or "unavailable" in error_msg.lower():
                                            print(f"Collection '{self._collection_name}' appears to be missing from Qdrant")
                                        return []
                                    
                                    results = parsed_result if isinstance(parsed_result, list) else [parsed_result]
                                    sources = [doc.get("source", "Unknown") for doc in results if isinstance(doc, dict)]
                                    print(f"MCP search found {len(results)} results from sources: {sources}")
                                    return results
                                except json.JSONDecodeError:
                                    print(f"MCP search returned non-JSON text result")
                                    return [{"text": content.text, "source": "Unknown"}]
                            elif isinstance(content.text, list):
                                sources = [doc.get("source", "Unknown") for doc in content.text if isinstance(doc, dict)]
                                print(f"MCP search found {len(content.text)} results from sources: {sources}")
                                return content.text
                            else:
                                print(f"MCP search returned single result")
                                return [content.text] if content.text else []
                        else:
                            if isinstance(content, list):
                                sources = [doc.get("source", "Unknown") for doc in content if isinstance(doc, dict)]
                                print(f"MCP search found {len(content)} results from sources: {sources}")
                                return content
                            elif isinstance(content, dict):
                                source = content.get("source", "Unknown")
                                print(f"MCP search found 1 result from source: {source}")
                                return [content]
                            else:
                                print(f"MCP search returned unknown content type")
                                return [{"text": str(content), "source": "Unknown"}]
                    
                    print(f"MCP search returned no results")
                    return []
                    
        except Exception as e:
            print(f"Error searching documents: {e}")
            import traceback
            print(f"Search error traceback:\n{traceback.format_exc()}")
            return []
