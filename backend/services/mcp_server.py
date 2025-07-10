from pathlib import Path
import sys

# Ensure backend root is on PYTHONPATH before local imports
sys.path.append(str(Path(__file__).parent.parent))

from typing import Annotated, List, Dict, Any, Optional
from sqlmodel import Session, select
from langchain_community.vectorstores import Qdrant
from langchain_community.embeddings import FastEmbedEmbeddings
from qdrant_client import QdrantClient
from database.database import engine
from models.db_models import Deployment, DeploymentProblemLink, Problem, Submission, SubmissionStatus, DeploymentType
from fastmcp import FastMCP
from services.deployment_types.code import CodeDeployment

# server
mcp = FastMCP("agent-server")

EMBED = FastEmbedEmbeddings()

from scripts.config import load_config

# Load config
config = load_config()

# cached retriever for course
retriever_cache: dict[str, Qdrant] = {}

def get_retriever(course_id: str) -> Qdrant:
    if course_id not in retriever_cache:
        # Create Qdrant client first
        qdrant_client = QdrantClient(url=config.get("qdrant", {}).get("url", "http://localhost:6333"))
        
        # Check if collection exists
        try:
            collections = qdrant_client.get_collections()
            collection_names = [col.name for col in collections.collections]
            
            if course_id not in collection_names:
                print(f"Collection '{course_id}' does not exist in Qdrant")
                return None
        except Exception as e:
            print(f"Error checking collections in Qdrant: {e}")
            return None
        
        # Create Qdrant vector store using client
        try:
            retriever_cache[course_id] = Qdrant(
                client=qdrant_client,
                collection_name=course_id,
                embeddings=EMBED,
            )
        except Exception as e:
            print(f"Error creating Qdrant retriever for collection '{course_id}': {e}")
            return None
            
    return retriever_cache[course_id]

# document retriever
@mcp.tool()
async def search_documents(
    collection_id: Annotated[str, "Document collection name, e.g. workflow_myproject_123"],
    query:         Annotated[str, "Natural-language question to search for"],
    k:             Annotated[int, "Number of passages to return"] = 4,
) -> List[dict]:
    try:
        print(f"Searching collection '{collection_id}' for query: '{query}'")
        
        retriever = get_retriever(collection_id)
        if retriever is None:
            print(f"No retriever available for collection '{collection_id}'")
            return [{"error": f"Collection '{collection_id}' not found or unavailable"}]
        
        docs = retriever.similarity_search(query, k=k)
        # format what the LLM needs (text + citation data)
        res = [
            {
                "text": d.page_content,
                "source": d.metadata.get("source"),
                "page": d.metadata.get("page"),
            }
            for d in docs
        ]
        print(f"Document search results for '{collection_id}': {len(res)} documents found")
        return res
    except Exception as e:
        error_msg = f"Failed to search documents in collection '{collection_id}': {str(e)}"
        print(error_msg)
        return [{"error": error_msg}]

@mcp.tool()
async def get_code_deployment_info(
    deployment_id: Annotated[str, "Deployment UUID for the CODE deployment"],
) -> Dict[str, Any]:
    try:
        with Session(engine) as session:
            db_deployment: Optional[Deployment] = session.exec(
                select(Deployment).where(
                    Deployment.deployment_id == deployment_id,
                    Deployment.is_active == True,
                )
            ).first()

            if not db_deployment:
                return {"error": f"Deployment '{deployment_id}' not found"}

            if db_deployment.type != DeploymentType.CODE:
                return {"error": f"Deployment '{deployment_id}' is not of CODE type"}

            # Attempt to extract inline problem config from stored workflow nodes
            problem_info: Dict[str, Any] | None = None
            try:
                if isinstance(db_deployment.config, dict):
                    workflow_nodes = db_deployment.config.get("__workflow_nodes__", {})
                    node1 = workflow_nodes.get("1", {})
                    attachments = node1.get("attachments", {})
                    tests_list = attachments.get("tests", [])
                    if tests_list:
                        problem_config = tests_list[0].get("config", {})
                        problem_info = {
                            "function_name": problem_config.get("function_name"),
                            "description": problem_config.get("description"),
                            "parameter_names": problem_config.get("parameter_names"),
                            "test_cases_count": len(problem_config.get("test_cases", [])),
                        }
            except Exception:
                problem_info = None

            # Fallback: look for linked Problem entity
            if problem_info is None:
                linked_problem: Optional[Problem] = session.exec(
                    select(Problem)
                    .join(DeploymentProblemLink, Problem.id == DeploymentProblemLink.problem_id)
                    .where(DeploymentProblemLink.deployment_id == db_deployment.id)
                ).first()

                if linked_problem:
                    problem_info = {
                        "problem_id": linked_problem.id,
                        "title": linked_problem.title,
                        "description": linked_problem.description,
                    }

            return {
                "deployment_id": deployment_id,
                "workflow_name": db_deployment.workflow_name,
                "problem": problem_info,
            }
    except Exception as exc:
        return {"error": f"Failed to retrieve deployment info: {exc}"}


@mcp.tool()
async def get_last_code_submission(
    deployment_id: Annotated[str, "Deployment UUID for the CODE deployment"],
    user_id: Annotated[int, "User ID whose last submission should be fetched"],
) -> Dict[str, Any]:
    try:
        with Session(engine) as session:
            db_deployment: Optional[Deployment] = session.exec(
                select(Deployment).where(
                    Deployment.deployment_id == deployment_id,
                    Deployment.is_active == True,
                )
            ).first()

            if not db_deployment:
                return {"error": f"Deployment '{deployment_id}' not found"}

            if db_deployment.type != DeploymentType.CODE:
                return {"error": f"Deployment '{deployment_id}' is not of CODE type"}

            # Resolve linked problem
            linked_problem: Optional[Problem] = session.exec(
                select(Problem)
                .join(DeploymentProblemLink, Problem.id == DeploymentProblemLink.problem_id)
                .where(DeploymentProblemLink.deployment_id == db_deployment.id)
            ).first()

            if not linked_problem:
                return {"error": f"No problem linked with deployment '{deployment_id}'"}

            # Fetch most recent submission by user
            submission: Optional[Submission] = session.exec(
                select(Submission)
                .where(
                    Submission.problem_id == linked_problem.id,
                    Submission.user_id == user_id,
                )
                .order_by(Submission.submitted_at.desc())
            ).first()

            if not submission:
                return {
                    "deployment_id": deployment_id,
                    "user_id": user_id,
                    "message": "No submissions found for this user and deployment.",
                }

            # ------------------------------------------------------------------
            # Re-run tests on the submitted code to gather detailed pass/fail
            # ------------------------------------------------------------------
            detailed_results: Dict[str, Any] | None = None
            try:
                # Attempt to build problem_config from stored workflow nodes
                problem_config: Dict[str, Any] | None = None
                if isinstance(db_deployment.config, dict):
                    wf_nodes = db_deployment.config.get("__workflow_nodes__", {})
                    node1 = wf_nodes.get("1", {})
                    attachments = node1.get("attachments", {})
                    tests_list = attachments.get("tests", [])
                    if tests_list and tests_list[0].get("config"):
                        problem_config = tests_list[0]["config"]

                if problem_config:
                    code_dep = CodeDeployment(problem_config=problem_config)
                    detailed_results = code_dep.run_all_tests(submission.code)
            except Exception as exc_det:
                # Log but do not fail the tool
                print(f"[MCP] Failed to compute detailed test results: {exc_det}")

            # Build test case summary if available
            test_summary: Dict[str, Any] | None = None
            passed_case_ids: List[int] = []
            failed_case_ids: List[int] = []
            if detailed_results:
                test_summary = {
                    "all_passed": detailed_results.get("all_passed"),
                    "total_tests": detailed_results.get("total_tests"),
                    "passed_tests": detailed_results.get("passed_tests"),
                    "failed_tests": detailed_results.get("failed_tests"),
                }
                for tr in detailed_results.get("test_results", []):
                    if tr.get("passed"):
                        passed_case_ids.append(tr.get("test_id"))
                    else:
                        failed_case_ids.append(tr.get("test_id"))

            return {
                "deployment_id": deployment_id,
                "user_id": user_id,
                "problem_id": linked_problem.id,
                "submission": {
                    "id": submission.id,
                    "code": submission.code,
                    "status": submission.status.value,
                    "execution_time": submission.execution_time,
                    "error": submission.error,
                    "submitted_at": submission.submitted_at.isoformat(),
                    "passed": submission.status == SubmissionStatus.PASSED,
                    "test_summary": test_summary,
                    "test_results": detailed_results.get("test_results") if detailed_results else None,
                    "passed_test_ids": passed_case_ids,
                    "failed_test_ids": failed_case_ids,
                },
            }
    except Exception as exc:
        return {"error": f"Failed to retrieve submission: {exc}"}

if __name__ == "__main__":
    mcp.run(transport="stdio") 
