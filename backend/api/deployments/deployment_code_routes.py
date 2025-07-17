from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Any, Optional
import time

from .deployment_shared import *

router = APIRouter()

# Request model for code submission
class CodeSubmissionRequest(BaseModel):
    code: str

# Request model for code saving
class CodeSaveRequest(BaseModel):
    code: str
    problem_index: int = 0

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
    submission_id: int | None = None
    analysis: str | None = None
    analysis_enabled: bool = False

class CodeAnalysisResponse(BaseModel):
    submission_id: int
    deployment_id: str
    analysis: str | None

@router.get("/{deployment_id}/problem-info")
async def get_code_problem_info_endpoint(
    deployment_id: str,
    problem_index: int = 0,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)
    validate_deployment_type(db_deployment, DeploymentType.CODE)
    
    deployment_mem = await ensure_deployment_loaded(deployment_id, current_user.id, db)
    problem_info = deployment_mem["mcp_deployment"].get_code_problem_info(problem_index)

    if problem_info is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Problem {problem_index} not found in deployment",
        )

    return {
        "deployment_id": deployment_id,
        "problem_info": problem_info,
    }

@router.get("/{deployment_id}/problems-info")
async def get_all_code_problems_info_endpoint(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)
    validate_deployment_type(db_deployment, DeploymentType.CODE)
    
    deployment_mem = await ensure_deployment_loaded(deployment_id, current_user.id, db)
    problems_info = deployment_mem["mcp_deployment"].get_all_code_problems_info()
    problem_count = deployment_mem["mcp_deployment"].get_code_problem_count()

    return {
        "deployment_id": deployment_id,
        "problem_count": problem_count,
        "problems": problems_info or [],
    }

@router.get("/{deployment_id}/problem-count")
async def get_code_problem_count_endpoint(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)
    validate_deployment_type(db_deployment, DeploymentType.CODE)
    
    deployment_mem = await ensure_deployment_loaded(deployment_id, current_user.id, db)
    problem_count = deployment_mem["mcp_deployment"].get_code_problem_count()

    return {
        "deployment_id": deployment_id,
        "problem_count": problem_count,
    }

# Run tests for CODE deployment
@router.post("/{deployment_id}/run-tests")
async def run_code_tests_endpoint(
    deployment_id: str,
    request: CodeSubmissionRequest,
    problem_index: int = 0,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)
    validate_deployment_type(db_deployment, DeploymentType.CODE)
    check_deployment_open(db_deployment)
    
    deployment_mem = await ensure_deployment_loaded(deployment_id, current_user.id, db)
    mcp_deployment = deployment_mem["mcp_deployment"]
    
    # Validate problem index
    problem_count = mcp_deployment.get_code_problem_count()
    if problem_index >= problem_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Problem index {problem_index} out of range (0-{problem_count-1})",
        )
    
    try:
        start_time = time.time()
        
        # Find the linked problem for this deployment at the correct index
        linked_problems = db.exec(
            select(Problem)
            .join(DeploymentProblemLink, Problem.id == DeploymentProblemLink.problem_id)
            .where(DeploymentProblemLink.deployment_id == db_deployment.id)
            .order_by(Problem.id)  # Ensure consistent ordering
        ).all()
        
        linked_problem = None
        if linked_problems and problem_index < len(linked_problems):
            linked_problem = linked_problems[problem_index]
        
        # If no linked problem found, create a minimal one for this deployment and problem index
        if not linked_problem:
            problem_info = deployment_mem["mcp_deployment"].get_code_problem_info(problem_index)
            linked_problem = Problem(
                title=f"deployment_{deployment_id}_problem_{problem_index}",
                description=problem_info.get("description", f"Code Challenge {problem_index}"),
                class_id=db_deployment.class_id,
                created_by_id=db_deployment.user_id,
            )
            db.add(linked_problem)
            db.commit()
            db.refresh(linked_problem)

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

        test_results = mcp_deployment.run_all_tests(
            request.code, 
            problem_index=problem_index, 
            database_session=db, 
            submission_id=submission.id
        )
        
        execution_time = time.time() - start_time
        
        if test_results is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Test execution failed to return results"
            )
        
        if linked_problem:
            if test_results["all_passed"]:
                status = SubmissionStatus.PASSED
            else:
                status = SubmissionStatus.FAILED
            
            submission.execution_time = execution_time
            submission.error = None if test_results["all_passed"] else f"{test_results['failed_tests']} tests failed"
            submission.status = status
            submission.tests_passed = test_results["passed_tests"]
            db.commit()
            db.refresh(submission)

            # Update deployment-level metrics asynchronously (best-effort)
            try:
                from services.summary_agent import SummaryAgent
                SummaryAgent(db).update_deployment_metrics(deployment_id)
            except Exception as metrics_exc:
                print(f"[METRICS] Warning: Failed to update metrics for deployment {deployment_id}: {metrics_exc}")

            # Queue embedding task so Qdrant is updated asynchronously
            try:
                from services.celery_tasks import celery_app as task_app
                task_app.send_task(
                    "embed_analyses_to_qdrant",
                    args=[linked_problem.id],
                )
            except Exception as cel_exc:
                print(f"[Celery] Could not queue embedding task for problem {linked_problem.id}: {cel_exc}")
            print(f"[SUBMISSION] Created submission {submission.id} for user {current_user.id} on problem {linked_problem.id} (problem_index={problem_index})")
        
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
            ],
            submission_id=submission.id,
            analysis=submission.analysis,
            analysis_enabled=(
                hasattr(mcp_deployment, "_code_service")
                and getattr(mcp_deployment._code_service, "_analysis", False)
            ),
        )
        
    except Exception as e:
        print(f"Error running tests for deployment {deployment_id}, problem {problem_index}: {e}")
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
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)
    validate_deployment_type(db_deployment, DeploymentType.CODE)
    
    deployment_mem = await ensure_deployment_loaded(deployment_id, current_user.id, db)
    problem_count = deployment_mem["mcp_deployment"].get_code_problem_count()
    
    if request.problem_index >= problem_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Problem index {request.problem_index} out of range (0-{problem_count-1})",
        )

    try:
        # First, try to find a properly linked problem at the correct index
        linked_problems = db.exec(
            select(Problem)
            .join(DeploymentProblemLink, Problem.id == DeploymentProblemLink.problem_id)
            .where(DeploymentProblemLink.deployment_id == db_deployment.id)
            .order_by(Problem.id)  # Ensure consistent ordering
        ).all()
        
        existing_problem = None
        if linked_problems and request.problem_index < len(linked_problems):
            existing_problem = linked_problems[request.problem_index]
        
        if not existing_problem:
            # Fallback: check for virtual problem by identifier with problem index
            problem_identifier = f"deployment_{deployment_id}_problem_{request.problem_index}"
            existing_problem = db.exec(
                select(Problem).where(
                    Problem.title == problem_identifier,
                    Problem.class_id == db_deployment.class_id,
                )
            ).first()
        
        if not existing_problem:
            # Create a virtual problem for this deployment and problem index as last resort
            problem_info = deployment_mem["mcp_deployment"].get_code_problem_info(request.problem_index)
            
            existing_problem = Problem(
                title=f"deployment_{deployment_id}_problem_{request.problem_index}",
                description=problem_info.get("description", f"Code Challenge {request.problem_index}"),
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
            "problem_index": request.problem_index,
            "message": f"Code saved successfully for problem {request.problem_index}",
            "saved_at": datetime.now(timezone.utc).isoformat(),
        }
        
    except Exception as e:
        print(f"Error saving code for deployment {deployment_id}, problem {request.problem_index}: {e}")
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
    problem_index: int = 0,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)
    validate_deployment_type(db_deployment, DeploymentType.CODE)
    
    deployment_mem = await ensure_deployment_loaded(deployment_id, current_user.id, db)
    problem_count = deployment_mem["mcp_deployment"].get_code_problem_count()
    
    if problem_index >= problem_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Problem index {problem_index} out of range (0-{problem_count-1})",
        )

    try:
        # Look for existing user code state
        # First, try to find a properly linked problem at the correct index
        linked_problems = db.exec(
            select(Problem)
            .join(DeploymentProblemLink, Problem.id == DeploymentProblemLink.problem_id)
            .where(DeploymentProblemLink.deployment_id == db_deployment.id)
            .order_by(Problem.id)  # Ensure consistent ordering
        ).all()
        
        existing_problem = None
        if linked_problems and problem_index < len(linked_problems):
            existing_problem = linked_problems[problem_index]
        
        if not existing_problem:
            # Fallback: check for virtual problem by identifier with problem index
            problem_identifier = f"deployment_{deployment_id}_problem_{problem_index}"
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
        print(f"Error loading code for deployment {deployment_id}, problem {problem_index}: {e}")
        import traceback
        print(f"Code load error traceback:\n{traceback.format_exc()}")
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load code: {str(e)}"
        )

# Get student submissions for CODE deployment (instructors only)
@router.get("/{deployment_id}/submissions")
async def get_deployment_submissions(
    deployment_id: str,
    problem_index: int = 0,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db, require_instructor=True)
    validate_deployment_type(db_deployment, DeploymentType.CODE)

    try:
        # Find the linked problem for this deployment at the correct index
        linked_problems = db.exec(
            select(Problem)
            .join(DeploymentProblemLink, Problem.id == DeploymentProblemLink.problem_id)
            .where(DeploymentProblemLink.deployment_id == db_deployment.id)
            .order_by(Problem.id)  # Ensure consistent ordering
        ).all()
        
        linked_problem = None
        if linked_problems and problem_index < len(linked_problems):
            linked_problem = linked_problems[problem_index]
        
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
            select(Submission, User)
            .join(User, Submission.user_id == User.id)
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
    problem_index: int = 0,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db, require_instructor=True)
    validate_deployment_type(db_deployment, DeploymentType.CODE)

    try:
        # Get the submission with user info
        submission_query = (
            select(Submission, User)
            .join(User, Submission.user_id == User.id)
            .where(Submission.id == submission_id)
        )
        
        submission_result = db.exec(submission_query).first()
        
        if not submission_result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Submission not found"
            )
        
        submission, user = submission_result
        
        deployment_mem = await ensure_deployment_loaded(deployment_id, current_user.id, db)
        mcp_deployment = deployment_mem["mcp_deployment"]
        
        # Re-run tests on submitted code to get detailed results
        test_results = mcp_deployment.run_all_tests(submission.code, problem_index=problem_index)
        
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
                ],
                submission_id=submission.id,
                analysis=submission.analysis,
                analysis_enabled=(
                    hasattr(mcp_deployment, "_code_service")
                    and getattr(mcp_deployment._code_service, "_analysis", False)
                ),
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

@router.get("/{deployment_id}/submissions/{submission_id}/analysis", response_model=CodeAnalysisResponse)
async def get_submission_analysis(
    deployment_id: str,
    submission_id: int,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    # Validate deployment exists
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)

    submission: Submission | None = db.get(Submission, submission_id)
    if not submission or submission.problem_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    if (
        submission.user_id != current_user.id
        and not user_has_role_in_class(current_user, db_deployment.class_id, ClassRole.INSTRUCTOR, db)
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return CodeAnalysisResponse(
        submission_id=submission.id,
        deployment_id=deployment_id,
        analysis=submission.analysis,
    ) 
