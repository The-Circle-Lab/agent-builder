from typing import Dict, Any

# workflow config parser
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
                if llm_model.get("type") == "openAI":
                    llm_config = llm_model.get("config", {})
                    config["llm_config"].update({
                        "model": llm_config.get("model", "gpt-4o-2024-08-06"),
                        "temperature": llm_config.get("temperature", 0.6),
                        "max_tokens": llm_config.get("maximumOutputTokens", 200),
                        "top_p": llm_config.get("topP", 0.5),
                        "provider": "openai"
                    })
                else:
                    llm_config = llm_model.get("config", {})
                    config["llm_config"].update({
                        "model": llm_config.get("model", "gemini-2.5-flash"),
                        "temperature": llm_config.get("temperature", 0.7),
                        "max_tokens": llm_config.get("maximumOutputTokens", 1000),
                        "top_p": llm_config.get("topP", 0.9),
                        "provider": "vertexai"
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
