from typing import Dict, Any, List, Optional
import ast
from models.object_types import AgentNode, AgentNodeList
from services.deployment_types.chat import Chat
from models.database.db_models import DeploymentType
from services.config_service import parse_agent_config
from services.deployment_types.code_executor import CodeDeployment
from services.deployment_types.mcq import MCQDeployment
from services.deployment_types.prompt import PromptDeployment
from services.deployment_types.live_presentation import LivePresentationDeployment
from services.deployment_types.video import VideoDeployment

# Global cache for live presentation services to ensure single instance per deployment
_LIVE_PRESENTATION_CACHE: Dict[str, "LivePresentationDeployment"] = {}

def clear_live_presentation_cache(deployment_id: str = None):
    """Clear live presentation cache for specific deployment or all deployments"""
    global _LIVE_PRESENTATION_CACHE
    if deployment_id:
        if deployment_id in _LIVE_PRESENTATION_CACHE:
            print(f"🎤 Clearing live presentation cache for deployment {deployment_id}")
            del _LIVE_PRESENTATION_CACHE[deployment_id]
    else:
        print(f"🎤 Clearing all live presentation cache ({len(_LIVE_PRESENTATION_CACHE)} items)")
        _LIVE_PRESENTATION_CACHE.clear()

class AgentDeployment:
    _services: AgentNodeList
    _deployment_type: DeploymentType
    _contains_chat: bool
    _code_service: "CodeDeployment | None" = None
    _mcq_service: "MCQDeployment | None" = None
    _prompt_service: "PromptDeployment | None" = None
    _live_presentation_service: "LivePresentationDeployment | None" = None
    _video_service: "VideoDeployment | None" = None

    def __init__(
        self,
        deployment_id: str,
        config: Dict[str, Any],
        collection_name: Optional[str] = None,
        coming_from_page: bool = False,
    ) -> None:
        self._contains_chat = True
        self.deployment_id = deployment_id
        self._services = AgentNodeList() 

        if not coming_from_page:
            if config['pagesExist']:
                raise ValueError("Pages are not supported in this workflow")

        config = config['nodes']

        # Starting node configuration
        match config['1']['type']:
            case 'chat':
                self._deployment_type = DeploymentType.CHAT
            case 'code':
                self._deployment_type = DeploymentType.CODE
                self._code_service = CodeDeployment(
                    problem_config=config['1']
                )
                self._services.append(AgentNode(self._code_service))
            case 'mcq':
                self._deployment_type = DeploymentType.MCQ
                mcq_node = config['1']
                self._mcq_service = MCQDeployment.from_config(mcq_node)
                self._services.append(AgentNode(self._mcq_service))
                self._contains_chat = False
            case 'prompt':
                self._deployment_type = DeploymentType.PROMPT
                self._prompt_service = PromptDeployment.from_config(config)
                self._services.append(AgentNode(self._prompt_service))
            case 'livePresentation':
                self._deployment_type = DeploymentType.LIVE_PRESENTATION
                # Use cached instance to ensure single live presentation service per deployment
                if deployment_id not in _LIVE_PRESENTATION_CACHE:
                    print(f"🎤 Creating NEW live presentation service for deployment {deployment_id}")
                    _LIVE_PRESENTATION_CACHE[deployment_id] = LivePresentationDeployment.from_config(config, deployment_id)
                else:
                    print(f"🎤 Using CACHED live presentation service for deployment {deployment_id}")
                
                self._live_presentation_service = _LIVE_PRESENTATION_CACHE[deployment_id]
                self._services.append(AgentNode(self._live_presentation_service))
            case 'video':
                self._deployment_type = DeploymentType.VIDEO
                self._video_service = VideoDeployment.from_config(config, deployment_id)
                self._contains_chat = False
            case _:
                raise ValueError(f"Invalid deployment type: {config['1']['type']}")
        
        i = 2
        print(config)
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
        if (
            self._services.count == 1
            and (
                self._deployment_type == DeploymentType.CODE
                or self._deployment_type == DeploymentType.PROMPT
                or self._deployment_type == DeploymentType.LIVE_PRESENTATION
            )
        ):
            self._contains_chat = False
        print("contains chat: ", self._contains_chat)

    def get_contains_chat(self) -> bool:
        return self._contains_chat

    def get_deployment_type(self) -> DeploymentType:
        return self._deployment_type

    def get_code_problem_info(self, problem_index: int = 0) -> Optional[Dict[str, Any]]:
        """Get problem info for a specific problem by index"""
        if self._deployment_type != DeploymentType.CODE or self._code_service is None:
            return None
        try:
            return self._code_service.get_problem_info(problem_index)
        except (ValueError, IndexError):
            return None

    def get_all_code_problems_info(self) -> Optional[List[Dict[str, Any]]]:
        """Get info for all problems in this CODE deployment"""
        if self._deployment_type != DeploymentType.CODE or self._code_service is None:
            return None
        return self._code_service.get_all_problems_info()

    def get_code_problem_count(self) -> int:
        """Get the number of problems in this CODE deployment"""
        if self._deployment_type != DeploymentType.CODE or self._code_service is None:
            return 0
        return self._code_service.get_problem_count()

    def run_all_tests(self, code: str, problem_index: int = 0, database_session=None, submission_id=None):
        if self._deployment_type != DeploymentType.CODE or self._code_service is None:
            return None

        try:
            return self._code_service.run_all_tests(
                code, 
                problem_index=problem_index, 
                database_session=database_session, 
                submission_id=submission_id
            )
        except Exception as exc:
            print(f"[AgentDeployment] Code test execution failed for problem {problem_index}: {exc}")
            raise

    def get_code_problem_info_legacy(self) -> Optional[Dict[str, Any]]:
        return self.get_code_problem_info(0)

    # MCQ related methods
    def get_mcq_service(self) -> Optional["MCQDeployment"]:
        if self._deployment_type != DeploymentType.MCQ:
            return None
        return self._mcq_service

    def get_mcq_question_count(self) -> int:
        if self._deployment_type != DeploymentType.MCQ or self._mcq_service is None:
            return 0
        return len(self._mcq_service.questions)

    def create_mcq_question_set(self, question_count: int = -1, randomize: bool = True) -> List[int]:
        if self._deployment_type != DeploymentType.MCQ or self._mcq_service is None:
            return []
        return self._mcq_service.create_question_set(question_count, randomize)

    # Prompt related methods
    def get_prompt_service(self) -> Optional["PromptDeployment"]:
        if self._deployment_type != DeploymentType.PROMPT:
            return None
        return self._prompt_service

    def get_prompt_info(self) -> Optional[Dict[str, Any]]:
        if self._deployment_type != DeploymentType.PROMPT or self._prompt_service is None:
            return None
        return self._prompt_service.to_dict()

    def validate_prompt_submission(self, index: int, response: str) -> Dict[str, Any]:
        if self._deployment_type != DeploymentType.PROMPT or self._prompt_service is None:
            return {"valid": False, "error": "Not a prompt deployment"}
        return self._prompt_service.validate_submission(index, response)

    # Live Presentation related methods
    def get_live_presentation_service(self) -> Optional["LivePresentationDeployment"]:
        if self._deployment_type != DeploymentType.LIVE_PRESENTATION:
            return None
        return self._live_presentation_service

    def get_video_service(self) -> Optional["VideoDeployment"]:
        if self._deployment_type != DeploymentType.VIDEO:
            return None
        return self._video_service
    
    def set_database_session(self, db_session):
        """Set database session for persistence - used for page-based deployments"""
        if self._live_presentation_service:
            self._live_presentation_service.set_database_session(db_session)
    
    async def restore_live_presentation_state(self):
        """Restore live presentation state from database - used for page-based deployments"""
        if self._live_presentation_service:
            await self._live_presentation_service.restore_from_database()

    def get_live_presentation_info(self) -> Optional[Dict[str, Any]]:
        if self._deployment_type != DeploymentType.LIVE_PRESENTATION or self._live_presentation_service is None:
            return None
        return {
            "deployment_id": self._live_presentation_service.deployment_id,
            "title": self._live_presentation_service.title,
            "description": self._live_presentation_service.description,
            "saved_prompts": [prompt.to_dict() for prompt in self._live_presentation_service.saved_prompts]
        }

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
        from models.database.db_models import Document
        
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
