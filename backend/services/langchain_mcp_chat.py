import asyncio
import os
from typing import List, Dict, Any
from pathlib import Path

from langchain_google_vertexai import VertexAI
from langchain.schema import HumanMessage, AIMessage, SystemMessage
from langchain.memory import ConversationBufferMemory
from langchain.schema.runnable import RunnablePassthrough
from langchain.schema.output_parser import StrOutputParser
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

class LangChainMCPChat:
    def __init__(self, course_id: str):
        self.course_id = course_id
        
        self.llm = VertexAI(
            model_name="gemini-2.5-flash",
            project=os.getenv("GOOGLE_CLOUD_PROJECT"),
            location=os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1"),
            streaming=True
        )
        
        # Initialize conversation memory
        self.memory = ConversationBufferMemory(
            memory_key="chat_history",
            return_messages=True
        )
        
        self.prompt = ChatPromptTemplate.from_messages([
            SystemMessage(content="""You are a helpful assistant that answers questions about course materials. 
            Use the provided context from the course documents to answer questions accurately. 
            If the context doesn't contain enough information to answer the question, say so clearly."""),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", "Context from course materials:\n{context}\n\nQuestion: {question}")
        ])
        
        self.mcp_session = None
    
    async def _initialize_mcp_client(self):
        if self.mcp_session is None:
            # Start the MCP server as a subprocess
            server_params = StdioServerParameters(
                command="python",
                args=[str(Path(__file__).parent / "retrieval_mcp_server.py")],
                env=None,
            )
            
            self.mcp_session = await stdio_client(server_params).__aenter__()
    
    async def _search_course_documents(self, query: str, k: int = 4) -> List[Dict[str, Any]]:
        await self._initialize_mcp_client()
        
        # Call the search_course tool from the MCP server
        result = await self.mcp_session.call_tool(
            "search_course",
            arguments={
                "course_id": self.course_id,
                "query": query,
                "k": k
            }
        )
        
        return result.content[0].text if result.content else []
    
    def _format_context(self, search_results: List[Dict[str, Any]]) -> str:
        if not search_results:
            return "No relevant course materials found."
        
        context_parts = []
        for i, doc in enumerate(search_results, 1):
            source = doc.get("source", "Unknown source")
            page = doc.get("page", "Unknown page")
            text = doc.get("text", "")
            
            context_parts.append(f"Document {i} (Source: {source}, Page: {page}):\n{text}")
        
        return "\n\n".join(context_parts)
    
    async def chat(self, question: str) -> Dict[str, Any]:
        try:
            # Search for relevant documents
            search_results = await self._search_course_documents(question)
            
            # Format context
            context = self._format_context(search_results)
            
            # Create the chain
            chain = (
                RunnablePassthrough.assign(
                    chat_history=lambda x: self.memory.chat_memory.messages
                )
                | self.prompt
                | self.llm
                | StrOutputParser()
            )
            
            # Get response from LLM
            response = await chain.ainvoke({
                "question": question,
                "context": context
            })
            
            # Update memory
            self.memory.chat_memory.add_user_message(question)
            self.memory.chat_memory.add_ai_message(response)
            
            return {
                "answer": response,
                "context": search_results,
                "sources": [doc.get("source") for doc in search_results if doc.get("source")]
            }
            
        except Exception as e:
            return {
                "error": f"Error processing chat: {str(e)}",
                "answer": "I'm sorry, I encountered an error while processing your question.",
                "context": [],
                "sources": []
            }
    
    async def close(self):
        if self.mcp_session:
            await self.mcp_session.__aexit__(None, None, None)

# Example usage
async def main():
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python langchain_mcp_chat.py <course_id>")
        sys.exit(1)
    
    course_id = sys.argv[1]
    chat_client = LangChainMCPChat(course_id)
    
    print(f"LangChain MCP Chat initialized for course: {course_id}")
    print("Type 'quit' to exit\n")
    
    try:
        while True:
            question = input("You: ").strip()
            if question.lower() in ['quit', 'exit', 'q']:
                break
            
            if not question:
                continue
            
            print("Searching course materials and generating response...")
            result = await chat_client.chat(question)
            
            if "error" in result:
                print(f"{result['error']}")
            else:
                print(f"\nAssistant: {result['answer']}")
                
                if result['sources']:
                    print(f"\nSources: {', '.join(set(result['sources']))}")
                print("-" * 50)
    
    except KeyboardInterrupt:
        print("\nGoodbye!")
    
    finally:
        await chat_client.close()

if __name__ == "__main__":
    asyncio.run(main()) 
