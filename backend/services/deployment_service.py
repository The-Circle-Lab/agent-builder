from typing import Dict, Any, List, Optional
import ast
from models.deployment_models import AgentNode, AgentNodeList
from services.deployment_types.chat import Chat
from models.db_models import DeploymentType
from services.config_service import parse_agent_config
from services.deployment_types.code import CodeDeployment

class AgentDeployment:
    _services: AgentNodeList
    _deployment_type: DeploymentType
    _contains_chat: bool
    _code_service: "CodeDeployment | None" = None

    def __init__(
        self,
        deployment_id: str,
        config: Dict[str, Any],
        collection_name: Optional[str] = None,
    ) -> None:
        self._contains_chat = True
        self.deployment_id = deployment_id
        self._services = AgentNodeList() 
        
        if (config['1']['type'] == 'chat'):
            self._deployment_type = DeploymentType.CHAT
        elif (config['1']['type'] == 'code'):
            self._deployment_type = DeploymentType.CODE
            self._code_service = CodeDeployment(
                problem_config=config['1']
            )
            self._services.append(AgentNode(self._code_service))
        else:
            raise ValueError(f"Invalid deployment type: {config['1']['type']}")
        
        i = 2
        while (str(i) in config):
            if (config[str(i)]['type'] == "result"):
                break
            elif (config[str(i)]['type'] == "agent"):
                agent_config = parse_agent_config(config[str(i)])
                chat_service = Chat(
                    config=agent_config,
                    rag_used=agent_config.get("has_mcp", False),
                    collection_name=collection_name,
                    is_code_mode=(self._deployment_type == DeploymentType.CODE),
                    deployment_id=self.deployment_id,
                )
                self._services.append(AgentNode(chat_service))
            i += 1
        
        if (self._services.count == 0):
            if (self._deployment_type == DeploymentType.CHAT):
                raise ValueError("No agents found in the workflow")
        if (self._services.count == 1 and self._deployment_type == DeploymentType.CODE):
            self._contains_chat = False
        print("contains chat: ", self._contains_chat)

    def get_contains_chat(self) -> bool:
        return self._contains_chat

    def get_deployment_type(self) -> DeploymentType:
        return self._deployment_type

    def get_code_problem_info(self) -> Optional[Dict[str, Any]]:
        if self._deployment_type != DeploymentType.CODE or self._code_service is None:
            return None
        return self._code_service.get_problem_info()

    def run_all_tests(self, code: str, database_session=None, submission_id=None):
        if self._deployment_type != DeploymentType.CODE or self._code_service is None:
            return None

        try:
            return self._code_service.run_all_tests(code, database_session=database_session, submission_id=submission_id)
        except Exception as exc:
            print(f"[AgentDeployment] Code test execution failed: {exc}")
            raise

    @staticmethod
    def _convert_value(value: Any) -> Any:
        if isinstance(value, str):
            try:
                return ast.literal_eval(value)
            except (ValueError, SyntaxError):
                # Fallback: return the original string if it cannot be parsed
                return value
        return value

    async def chat(
        self,
        message: str,
        history: List[List[str]] | None = None,
        user_id: int | None = None,
    ) -> Dict[str, Any]:
        history = history or []
        if (self._services.count == 0):
            return None
        return await self._services.back.current_agent.chat(message, history, user_id=user_id, stream=False)

    async def chat_streaming(
        self,
        message: str,
        history: List[List[str]] | None = None,
        stream_callback=None,
        user_id: int | None = None,
    ) -> Dict[str, Any]:
        history = history or []
        if (self._services.count == 0):
            return None
        return await self._services.back.current_agent.chat(
            message,
            history,
            stream=True,
            stream_callback=stream_callback,
            user_id=user_id,
        )

    async def _prepare_context(self, message: str, k: int = 15):  
        return await self._services.back.current_agent._prepare_context(message, k)  

    def _extract_unique_sources(self, search_results):  
        return self._services.back.current_agent._extract_unique_sources(search_results) 

    async def close(self) -> None:
        print(f"AgentDeployment {self.deployment_id} cleaned up")


def get_deployment_files_info(
    deployment_id: str,
    db_deployment,
    db_session,
) -> Dict[str, Any]:
    try:
        from sqlmodel import select
        from models.db_models import Document
        
        rag_document_ids: list[int] = db_deployment.rag_document_ids or []
        if not rag_document_ids:
            return {
                "deployment_id": deployment_id,
                "file_count": 0,
                "files": [],
                "has_rag_files": False,
            }

        documents = (
            db_session.exec(
                select(Document)
                .where(Document.id.in_(rag_document_ids), Document.is_active == True)  # noqa: E712 – keep comparison with literal True for SQLModel
                .order_by(Document.uploaded_at.desc())
            )
        ).all()
        
        file_list: list[Dict[str, Any]] = []
        for doc in documents:
            file_list.append(
                {
                "id": doc.id,
                "filename": doc.original_filename,
                "file_size": doc.file_size,
                "file_type": doc.file_type,
                "chunk_count": doc.chunk_count,
                "uploaded_at": doc.uploaded_at.isoformat(),
                "has_stored_file": doc.storage_path is not None,
                    "can_view": doc.storage_path is not None,
            }
            )
        
        return {
            "deployment_id": deployment_id,
            "file_count": len(file_list),
            "files": file_list,
            "has_rag_files": bool(file_list),
            "total_chunks": sum(doc.chunk_count for doc in documents),
            "total_file_size": sum(doc.file_size for doc in documents),
        }
        
    except Exception as exc:  
        print(f"Error getting deployment files info: {exc}")
        return {
            "deployment_id": deployment_id,
            "file_count": 0,
            "files": [],
            "has_rag_files": False,
            "error": str(exc),
        } 
