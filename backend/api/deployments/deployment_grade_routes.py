from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Dict, Any, Optional, Tuple

from .deployment_shared import *

router = APIRouter()

class GradeCalculationRequest(BaseModel):
    grading_method: str  # "problem_correct" or "test_cases_correct"

class GradeResponse(BaseModel):
    deployment_id: str
    grade: Optional[Tuple[int, int]]
    grading_method: Optional[str] = None
    calculated_at: Optional[str] = None
    student_count: int = 0
    details: Optional[Dict[str, Any]] = None

@router.get("/{deployment_id}/grade", response_model=GradeResponse)
async def get_deployment_grade(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)

    return GradeResponse(
        deployment_id=deployment_id,
        grade=db_deployment.grade,
        calculated_at=db_deployment.updated_at.isoformat() if db_deployment.grade else None,
        student_count=0,  # Will be filled in if needed
        details=None
    )

@router.post("/{deployment_id}/calculate-grade", response_model=GradeResponse)
async def calculate_and_apply_grade(
    deployment_id: str,
    request: GradeCalculationRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db, require_instructor=True)
    validate_deployment_type(db_deployment, DeploymentType.CODE)

    # Validate grading method
    if request.grading_method not in ["problem_correct", "test_cases_correct"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid grading method. Must be 'problem_correct' or 'test_cases_correct'",
        )

    try:
        # Find ALL linked problems for this deployment
        linked_problems = db.exec(
            select(Problem)
            .join(DeploymentProblemLink, Problem.id == DeploymentProblemLink.problem_id)
            .where(DeploymentProblemLink.deployment_id == db_deployment.id)
            .order_by(Problem.id)  # Ensure consistent ordering
        ).all()
        
        if not linked_problems:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No problems found for this deployment",
            )
        
        # Get all students and instructors in this class (include instructors for grade calculation)
        class_members = db.exec(
            select(User)
            .join(ClassMembership, User.id == ClassMembership.user_id)
            .where(
                ClassMembership.class_id == db_deployment.class_id,
                ClassMembership.role.in_([ClassRole.STUDENT, ClassRole.INSTRUCTOR]),
                ClassMembership.is_active == True
            )
        ).all()
        
        if not class_members:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No class members found in this class",
            )
        
        deployment_mem = await ensure_deployment_loaded(deployment_id, current_user.id, db)
        all_problems_info = deployment_mem["mcp_deployment"].get_all_code_problems_info()
        problem_count = deployment_mem["mcp_deployment"].get_code_problem_count()
        
        if not all_problems_info or problem_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No problems found in deployment configuration",
            )
        
        # Calculate individual grades for each student
        individual_grades = []
        total_problems_in_deployment = problem_count
        
        if request.grading_method == "problem_correct":
            # Calculate individual grades based on problems solved per student
            for member in class_members:
                member_solved = 0
                
                for problem in linked_problems:
                    latest_submission = db.exec(
                        select(Submission)
                        .where(
                            Submission.problem_id == problem.id,
                            Submission.user_id == member.id
                        )
                        .order_by(Submission.submitted_at.desc())
                    ).first()
                    
                    if latest_submission and latest_submission.status == SubmissionStatus.PASSED:
                        member_solved += 1
                
                # Create or update individual grade record
                existing_grade = db.exec(
                    select(StudentDeploymentGrade).where(
                        StudentDeploymentGrade.user_id == member.id,
                        StudentDeploymentGrade.deployment_id == db_deployment.id,
                        StudentDeploymentGrade.grading_method == request.grading_method
                    )
                ).first()
                
                if existing_grade:
                    existing_grade.points_earned = member_solved
                    existing_grade.total_points = total_problems_in_deployment
                    existing_grade.calculated_at = datetime.now(timezone.utc)
                    db.add(existing_grade)
                else:
                    student_grade = StudentDeploymentGrade(
                        user_id=member.id,
                        deployment_id=db_deployment.id,
                        grading_method=request.grading_method,
                        points_earned=member_solved,
                        total_points=total_problems_in_deployment
                    )
                    db.add(student_grade)
                
                individual_grades.append({
                    "user_id": member.id,
                    "email": member.email,
                    "points_earned": member_solved,
                    "total_points": total_problems_in_deployment,
                    "percentage": (member_solved / total_problems_in_deployment * 100) if total_problems_in_deployment > 0 else 0
                })
            
            # Calculate class summary
            total_points_possible = len(class_members) * total_problems_in_deployment
            total_points_earned = sum(grade["points_earned"] for grade in individual_grades)
            
            grade_details = {
                "method": "problem_correct",
                "individual_grades": individual_grades,
                "class_summary": {
                    "total_students": len(class_members),
                    "total_points_possible": total_points_possible,
                    "total_points_earned": total_points_earned,
                    "class_average": (total_points_earned / total_points_possible * 100) if total_points_possible > 0 else 0
                }
            }
            
        else:  # test_cases_correct
            # Calculate individual grades based on test cases passed per student
            mcp_code_service = deployment_mem["mcp_deployment"]._code_service if hasattr(deployment_mem["mcp_deployment"], "_code_service") else None
            if not mcp_code_service:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Code service not available to compute test cases",
                )

            problem_count = mcp_code_service.get_problem_count()

            # Pre-calculate test case counts per problem
            test_case_counts = []
            total_test_cases_in_deployment = 0
            for idx in range(problem_count):
                problem_cfg = mcp_code_service.get_problem_by_index(idx)
                test_case_counts.append(len(problem_cfg.test_cases))
                total_test_cases_in_deployment += len(problem_cfg.test_cases)

            if total_test_cases_in_deployment == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No test cases found across all problems",
                )

            # Calculate individual grades for each student
            for member in class_members:
                member_tests_passed = 0
                
                for idx, problem in enumerate(linked_problems):
                    latest_submission = db.exec(
                        select(Submission)
                        .where(
                            Submission.problem_id == problem.id,
                            Submission.user_id == member.id,
                        )
                        .order_by(Submission.submitted_at.desc())
                    ).first()
                    
                    if latest_submission:
                        member_tests_passed += latest_submission.tests_passed or 0
                
                # Create or update individual grade record
                existing_grade = db.exec(
                    select(StudentDeploymentGrade).where(
                        StudentDeploymentGrade.user_id == member.id,
                        StudentDeploymentGrade.deployment_id == db_deployment.id,
                        StudentDeploymentGrade.grading_method == request.grading_method
                    )
                ).first()
                
                if existing_grade:
                    existing_grade.points_earned = member_tests_passed
                    existing_grade.total_points = total_test_cases_in_deployment
                    existing_grade.calculated_at = datetime.now(timezone.utc)
                    db.add(existing_grade)
                else:
                    student_grade = StudentDeploymentGrade(
                        user_id=member.id,
                        deployment_id=db_deployment.id,
                        grading_method=request.grading_method,
                        points_earned=member_tests_passed,
                        total_points=total_test_cases_in_deployment
                    )
                    db.add(student_grade)
                
                individual_grades.append({
                    "user_id": member.id,
                    "email": member.email,
                    "points_earned": member_tests_passed,
                    "total_points": total_test_cases_in_deployment,
                    "percentage": (member_tests_passed / total_test_cases_in_deployment * 100) if total_test_cases_in_deployment > 0 else 0
                })

            # Calculate class summary
            total_points_possible = len(class_members) * total_test_cases_in_deployment
            total_points_earned = sum(grade["points_earned"] for grade in individual_grades)

            grade_details = {
                "method": "test_cases_correct",
                "individual_grades": individual_grades,
                "class_summary": {
                    "total_students": len(class_members),
                    "total_points_possible": total_points_possible,
                    "total_points_earned": total_points_earned,
                    "class_average": (total_points_earned / total_points_possible * 100) if total_points_possible > 0 else 0
                }
            }
        
        # Commit all individual grade records
        db.commit()
        
        # Calculate overall class performance for display
        total_points_earned = sum(grade["points_earned"] for grade in individual_grades)
        total_points_possible = sum(grade["total_points"] for grade in individual_grades)
        class_grade = (total_points_earned, total_points_possible) if total_points_possible > 0 else (0, 0)
        
        return GradeResponse(
            deployment_id=deployment_id,
            grade=class_grade,
            grading_method=request.grading_method,
            calculated_at=datetime.now(timezone.utc).isoformat(),
            student_count=len(class_members),
            details=grade_details
        )
        
    except Exception as e:
        print(f"Error calculating grade for deployment {deployment_id}: {e}")
        import traceback
        print(f"Grade calculation error traceback:\n{traceback.format_exc()}")
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to calculate grade: {str(e)}"
        )

# Get individual student grades for a deployment
@router.get("/{deployment_id}/student-grades")
async def get_student_grades(
    deployment_id: str,
    grading_method: str = "problem_correct",
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)

    # Check if user is instructor (can see all grades) or student (can see only their own)
    is_instructor = user_has_role_in_class(current_user, db_deployment.class_id, ClassRole.INSTRUCTOR, db)

    # Get individual grades for this deployment and grading method
    if is_instructor:
        # Instructors can see all student grades
        grades_query = (
            select(StudentDeploymentGrade, User)
            .join(User, StudentDeploymentGrade.user_id == User.id)
            .where(
                StudentDeploymentGrade.deployment_id == db_deployment.id,
                StudentDeploymentGrade.grading_method == grading_method
            )
            .order_by(User.email)
        )
    else:
        # Students can only see their own grade
        grades_query = (
            select(StudentDeploymentGrade, User)
            .join(User, StudentDeploymentGrade.user_id == User.id)
            .where(
                StudentDeploymentGrade.deployment_id == db_deployment.id,
                StudentDeploymentGrade.grading_method == grading_method,
                StudentDeploymentGrade.user_id == current_user.id
            )
        )
    
    grade_results = db.exec(grades_query).all()
    
    student_grades = []
    for grade, user in grade_results:
        student_grades.append({
            "user_id": user.id,
            "email": user.email if is_instructor else current_user.email,  # Only show email to instructors or own email
            "points_earned": grade.points_earned,
            "total_points": grade.total_points,
            "percentage": (grade.points_earned / grade.total_points * 100) if grade.total_points > 0 else 0,
            "calculated_at": grade.calculated_at.isoformat()
        })
    
    # Calculate class summary based on what the user can see
    if student_grades:
        total_points_earned = sum(g["points_earned"] for g in student_grades)
        total_points_possible = sum(g["total_points"] for g in student_grades)
        
        if is_instructor:
            # For instructors, show full class summary
            class_average = (total_points_earned / total_points_possible * 100) if total_points_possible > 0 else 0
            summary = {
                "total_students": len(student_grades),
                "total_points_earned": total_points_earned,
                "total_points_possible": total_points_possible,
                "class_average": class_average
            }
        else:
            # For students, show only their individual performance as "summary"
            summary = {
                "total_students": 1,  # Just themselves
                "total_points_earned": total_points_earned,
                "total_points_possible": total_points_possible,
                "class_average": (total_points_earned / total_points_possible * 100) if total_points_possible > 0 else 0
            }
    else:
        summary = {
            "total_students": 0,
            "total_points_earned": 0,
            "total_points_possible": 0,
            "class_average": 0
        }
    
    return {
        "deployment_id": deployment_id,
        "grading_method": grading_method,
        "student_grades": student_grades,
        "class_summary": summary,
        "is_instructor_view": is_instructor
    } 
