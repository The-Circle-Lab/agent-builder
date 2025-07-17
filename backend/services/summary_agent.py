from typing import List, Dict, Any
from sqlmodel import Session as DBSession, select

from models.db_models import Problem, Submission, SubmissionStatus, TestCase


class SummaryAgent:
    def __init__(self, db: DBSession):
        self.db = db

    def standardize_problem_submissions(self, problem_id: int) -> List[Dict[str, Any]]:
        """
        Return a list of standardized submission dictionaries for the given problem.

        Each object follows this template:
            {
                "student_id": int,
                "attempt_num": int,
                "verdict": "pass" | "fail",
                "error_type": str | None,  # "failed_tests", "runtime_error", or other explanatory tag
                "cause": str | None,        # Human-readable description of failure (None if pass)
                "analysis": str | None,
                "total_tests": int | None,
                "tests_passed": int | None,
            }
        """
        problem: Problem | None = self.db.get(Problem, problem_id)
        if not problem:
            raise ValueError(f"Problem {problem_id} not found")

        try:
            total_tests_count = len(problem.test_cases)
        except Exception:
            total_tests_count = None

        submissions = self.db.exec(
            select(Submission).where(Submission.problem_id == problem_id).order_by(Submission.submitted_at.asc())
        ).all()

        attempt_counters: dict[int, int] = {}

        standardized: List[Dict[str, Any]] = []
        for submission in submissions:
            user_id: int = submission.user_id  # type: ignore
            attempt_num = attempt_counters.get(user_id, 0) + 1
            attempt_counters[user_id] = attempt_num

            verdict = "pass" if submission.status == SubmissionStatus.PASSED else "fail"

            # Determine error type & cause
            if verdict == "pass":
                error_type = None
                cause = None
            else:
                if submission.status == SubmissionStatus.FAILED:
                    error_type = "failed_tests"
                elif submission.status == SubmissionStatus.ERROR:
                    error_type = "runtime_error"
                else:
                    error_type = submission.status.value

                cause = submission.error or (
                    "Some tests failed" if error_type == "failed_tests" else "Execution error"
                )

            if total_tests_count is None:
                tests_passed = None
            else:
                tests_passed = total_tests_count if verdict == "pass" else None

            standardized.append(
                {
                    "student_id": user_id,
                    "attempt_num": attempt_num,
                    "verdict": verdict,
                    "error_type": error_type,
                    "cause": cause,
                    "analysis": submission.analysis,
                    "total_tests": total_tests_count,
                    "tests_passed": tests_passed,
                }
            )

        return standardized

    def update_deployment_metrics(self, deployment_id: str) -> None:
        from models.db_models import Deployment, Problem, DeploymentProblemLink, Submission
        from models.db_models import DeploymentType

        db = self.db

        deployment: Deployment | None = db.exec(
            select(Deployment).where(Deployment.deployment_id == deployment_id)
        ).first()

        if not deployment or deployment.type != DeploymentType.CODE:
            raise ValueError("Deployment not found or not of CODE type")

        # Locate linked problem
        linked_problem = db.exec(
            select(Problem)
            .join(DeploymentProblemLink, Problem.id == DeploymentProblemLink.problem_id)
            .where(DeploymentProblemLink.deployment_id == deployment.id)  # type: ignore[arg-type]
        ).first()

        if not linked_problem:
            return  # Nothing to update yet

        submissions: list[Submission] = db.exec(
            select(Submission).where(Submission.problem_id == linked_problem.id)
        ).all()

        if not submissions:
            deployment.solve_rate = 0.0
            deployment.attempts = 0
            deployment.avg_tests_passed = 0.0
            db.add(deployment)
            db.commit()
            return

        attempts = len(submissions)

        # Distinct students counts
        students = {}
        passed_students_set = set()
        total_tests_passed_sum = 0
        tests_passed_count = 0

        for sub in submissions:
            students[sub.user_id] = True  # type: ignore[index]
            if sub.status == SubmissionStatus.PASSED:
                passed_students_set.add(sub.user_id)

            if sub.tests_passed is not None:
                total_tests_passed_sum += sub.tests_passed
                tests_passed_count += 1

        total_students = len(students)
        solve_rate = len(passed_students_set) / total_students if total_students else 0.0

        avg_tests_passed = (
            total_tests_passed_sum / tests_passed_count if tests_passed_count else 0.0
        )

        deployment.solve_rate = round(solve_rate, 3)
        deployment.attempts = attempts
        deployment.avg_tests_passed = round(avg_tests_passed, 2)

        db.add(deployment)
        db.commit()

    def compute_median_attempts(self, problem_id: int) -> float:
        from statistics import median
        from models.db_models import Submission

        submissions = self.db.exec(
            select(Submission).where(Submission.problem_id == problem_id).order_by(Submission.submitted_at.asc())
        ).all()

        # Map user -> attempts until first pass
        attempts_per_user: dict[int, int] = {}
        counters: dict[int, int] = {}

        for sub in submissions:
            uid = sub.user_id  # type: ignore
            counters[uid] = counters.get(uid, 0) + 1

            if sub.status == SubmissionStatus.PASSED and uid not in attempts_per_user:
                attempts_per_user[uid] = counters[uid]

        if not attempts_per_user:
            return 0.0

        return float(median(attempts_per_user.values()))

    def embed_analyses_to_qdrant(self, problem_id: int) -> None:
        from langchain_community.embeddings import FastEmbedEmbeddings
        from langchain_community.vectorstores import Qdrant
        from langchain.docstore.document import Document
        from qdrant_client import QdrantClient
        from uuid import uuid4

        from scripts.config import load_config
        from models.db_models import Submission

        cfg = load_config()
        qdrant_url = cfg.get("qdrant", {}).get("url", "http://localhost:6333")

        submissions: list[Submission] = self.db.exec(
            select(Submission).where(
                Submission.problem_id == problem_id,
                Submission.analysis.is_not(None),
            )
        ).all()

        if not submissions:
            print(f"[SummaryAgent] No analyses to embed for problem {problem_id}")
            return

        docs: list[Document] = []
        for sub in submissions:
            meta = {
                "student_id": sub.user_id,
                "submission_id": sub.id,
                "verdict": sub.status.value,
                "tests_passed": sub.tests_passed,
                "problem_id": problem_id,
            }
            docs.append(Document(page_content=sub.analysis, metadata=meta))  # type: ignore[arg-type]

        embeddings = FastEmbedEmbeddings()

        client = QdrantClient(url=qdrant_url)
        collection_name = f"problem_{problem_id}_analyses"

        # If collection doesn't exist, create via from_documents; else add
        existing = False
        try:
            colls = client.get_collections()
            existing = any(c.name == collection_name for c in colls.collections)
        except Exception:
            pass

        if not existing:
            Qdrant.from_documents(
                docs,
                embeddings,
                url=qdrant_url,
                prefer_grpc=False,
                collection_name=collection_name,
            )
            print(f"[SummaryAgent] Created collection '{collection_name}' with {len(docs)} docs")
        else:
            vs = Qdrant(client, collection_name, embeddings)
            vs.add_documents(docs)
            print(f"[SummaryAgent] Added {len(docs)} docs to existing collection '{collection_name}'")

    async def generate_llm_summary(self, problem_id: int, llm_model: str = "gpt-3.5-turbo") -> str:

        from langchain_community.vectorstores import Qdrant
        from langchain_community.embeddings import FastEmbedEmbeddings
        from langchain_openai import ChatOpenAI
        from langchain.chains.summarize import load_summarize_chain
        from scripts.config import load_config
        from qdrant_client import QdrantClient

        self.embed_analyses_to_qdrant(problem_id)

        cfg = load_config()
        qdrant_url = cfg.get("qdrant", {}).get("url", "http://localhost:6333")

        collection_name = f"problem_{problem_id}_analyses"
        embeddings = FastEmbedEmbeddings()
        client = QdrantClient(url=qdrant_url)

        try:
            vs = Qdrant(client, collection_name, embeddings)
        except Exception as exc:
            raise RuntimeError(f"Qdrant collection '{collection_name}' not available: {exc}")

        try:
            docs = vs.similarity_search(" ", k=1000)  # blank query to fetch many docs
        except Exception:
            docs = []

        if not docs:
            return "No analyses available for summarisation."

        llm = ChatOpenAI(model=llm_model, temperature=0.2, max_tokens=512)

        # Custom teacher-oriented prompts
        from langchain.prompts import PromptTemplate

        map_prompt = PromptTemplate(
            input_variables=["text"],
            template=(
                "You are analyzing excerpt(s) from AI-generated reviews of individual student submissions "
                "for a programming assignment. Identify notable mistakes, misconceptions, or patterns "
                "that would be useful for the instructor to know. Do NOT give code fixes; instead, list "
                "observations about what the students did wrong. \n\n"
                "Excerpt:\n{text}\n\n"
                "Write 2-4 concise bullet points (start each with '•')."
            ),
        )

        combine_prompt = PromptTemplate(
            input_variables=["text"],
            template=(
                "You are preparing a brief report for a teacher summarising class performance on a coding "
                "exercise. Using the aggregated bullet points below, craft a cohesive summary (5-8 bullet "
                "points) that highlights common errors, misconceptions, and areas where students struggled. "
                "Write in third-person and address the instructor (e.g., 'Students frequently ...').\n\n"
                "Aggregated notes:\n{text}\n\nTeacher-facing summary:"
            ),
        )

        summary_chain = load_summarize_chain(
            llm,
            chain_type="map_reduce",
            map_prompt=map_prompt,
            combine_prompt=combine_prompt,
        )

        llm_summary = await summary_chain.arun(docs)

        # ---------------- Cohort-level statistics ----------------
        try:
            submissions_std = self.standardize_problem_submissions(problem_id)
            student_ids = {rec["student_id"] for rec in submissions_std}
            total_students = len(student_ids)
            passed_students = len({rec["student_id"] for rec in submissions_std if rec["verdict"] == "pass"})
            solve_rate_pct = (passed_students / total_students * 100.0) if total_students else 0.0

            median_attempts = self.compute_median_attempts(problem_id)

            header_lines = [
                f"Performance report for Problem #{problem_id}",
                "",
                f"• Total students attempted: {total_students}",
                f"• Students passed: {passed_students} ({solve_rate_pct:.1f}% pass rate)",
                f"• Median attempts to first pass: {median_attempts:.1f}",
                "",
                "Common issues and insights (LLM-generated):",
                "-------------------------------------------------------------------",
            ]

            report = "\n".join(header_lines) + "\n" + llm_summary.strip()
        except Exception:
            report = llm_summary

        return report


__all__ = ["SummaryAgent"]
