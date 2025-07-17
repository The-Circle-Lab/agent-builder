import torch
import tempfile
import textwrap
import shutil
import json
import ast
import traceback
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4
from sqlmodel import Session
from celery import Celery
import docker
import os
import sys

@dataclass
class TestCase:
    id: int
    parameters: List[Any]
    expected_output: Any

@dataclass 
class ProblemConfig:
    """Configuration for a single coding problem"""
    problem_index: int
    function_name: str
    description: str
    parameter_names: List[str]
    test_cases: List[TestCase]
    analysis: bool
    analyze_correct_solutions: bool
    llm_model: str | None = None
    max_tokens: int | None = None
    temperature: float | None = None
    top_p: float | None = None

try:
    import inspect  
    from types import FunctionType
    import docker.auth as _docker_auth 

    _sig = inspect.signature(_docker_auth.load_config)
    if "config_dict" not in _sig.parameters and not hasattr(_docker_auth.load_config, "__patched__"):

        _legacy_load_config = _docker_auth.load_config 

        def _patched_load_config(config_path=None, config_dict=None, credstore_env=None): 
            return _legacy_load_config(config_path)

        _patched_load_config.__patched__ = True  

        _docker_auth.load_config = _patched_load_config

except Exception:
    pass

def _get_docker_client():
    try:
        return docker.from_env()
    except Exception as e:
        print(f"Docker client initialization failed: {e}")
        raise RuntimeError("Docker is required for code execution") from e

SEC_PROFILE = Path(__file__).parent.parent.parent / "seccomp.json"
IMG_PATH = Path(__file__).parent.parent.parent / "uploads" / "code_submissions"

IMG_PATH.mkdir(parents=True, exist_ok=True)

celery_app = Celery(__name__)

class CodeDeployment:
    _problems: List[ProblemConfig]

    def __init__(self, problem_config: Dict[str, Any]):
        """Initialize with multiple test configurations from the workflow data"""
        self._problems = []
        self._parse_problems(problem_config)

    def _parse_problems(self, problem_config: Dict[str, Any]):
        """Parse multiple test configurations from the workflow data"""
        attachments = problem_config.get('attachments', {})
        tests_list = attachments.get('tests', [])
        
        if not tests_list:
            raise ValueError("No test configurations found in problem config")
        
        for idx, test_attachment in enumerate(tests_list):
            test_config = test_attachment.get('config', {})
            
            # Parse test cases
            test_cases = self._load_test_cases(test_config.get('test_cases', []))
            
            # Parse analysis configuration if present
            analysis = 'attachments' in test_attachment
            analyze_correct_solutions = False
            llm_model = None
            max_tokens = None
            temperature = None
            top_p = None
            
            if analysis:
                analyzer_attachments = test_attachment.get('attachments', {})
                analyzers = analyzer_attachments.get('codeAnalyzers', [])
                if analyzers:
                    analyzer_node = analyzers[0]
                    analyzer_config = analyzer_node.get('config', {})
                    analyze_correct_solutions = analyzer_config.get('analyzeGoodSubmissions', False)
                    
                    llm_models = analyzer_node.get('attachments', {}).get('llmModel', [])
                    if llm_models:
                        llm_config = llm_models[0].get('config', {})
                        llm_model = llm_config.get('model')
                        max_tokens = llm_config.get('maximumOutputTokens')
                        temperature = llm_config.get('temperature')
                        top_p = llm_config.get('topP')
            
            problem = ProblemConfig(
                problem_index=idx,
                function_name=test_config.get('function_name', ''),
                description=test_config.get('description', ''),
                parameter_names=test_config.get('parameter_names', []),
                test_cases=test_cases,
                analysis=analysis,
                analyze_correct_solutions=analyze_correct_solutions,
                llm_model=llm_model,
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p
            )
            
            self._problems.append(problem)
            print(f"[CodeDeployment] Loaded problem {idx}: {problem.function_name} - {problem.description}")

    def get_problem_count(self) -> int:
        """Get the total number of problems in this deployment"""
        return len(self._problems)

    def get_problem_info(self, problem_index: int = 0) -> Dict[str, Any]:
        """Get problem info for a specific problem by index"""
        if problem_index >= len(self._problems):
            raise ValueError(f"Problem index {problem_index} out of range (0-{len(self._problems)-1})")
        
        problem = self._problems[problem_index]
        return {
            "problem_index": problem.problem_index,
            "function_name": problem.function_name,
            "description": problem.description,
            "parameter_names": problem.parameter_names,
        }

    def get_all_problems_info(self) -> List[Dict[str, Any]]:
        """Get info for all problems in this deployment"""
        return [self.get_problem_info(i) for i in range(len(self._problems))]

    def get_problem_by_index(self, problem_index: int) -> ProblemConfig:
        """Get a specific problem configuration by index"""
        if problem_index >= len(self._problems):
            raise ValueError(f"Problem index {problem_index} out of range (0-{len(self._problems)-1})")
        return self._problems[problem_index]

    @staticmethod
    def _convert_value(value: Any) -> Any:
        if isinstance(value, str):
            try:
                return ast.literal_eval(value)
            except (ValueError, SyntaxError):
                return value
        return value

    def _load_test_cases(self, test_case_list: List[Dict[str, Any]]) -> List[TestCase]:
        test_cases = []

        for idx, raw_case in enumerate(test_case_list, start=1):
            raw_params = raw_case.get("parameters", [])
            parsed_params = [self._convert_value(p) for p in raw_params]

            raw_expected = raw_case.get("expected")
            parsed_expected = self._convert_value(raw_expected)

            test_cases.append(
                TestCase(
                    id=idx,
                    parameters=parsed_params,
                    expected_output=parsed_expected,
                )
            )
        return test_cases

    def run_test_case(
        self,
        code: str,
        test_case: TestCase,
        problem_index: int = 0,
        *,
        container=None,
        submission_dir: Path | None = None,
        docker_image: str | None = None,
    ) -> Dict[str, Any]:
        """Run a specific test case for a specific problem"""
        problem = self.get_problem_by_index(problem_index)
        
        print(
            f"[CodeDeployment] Running test case {test_case.id} for problem {problem_index} ({problem.function_name}) "
            f"with parameters={test_case.parameters} (expected={test_case.expected_output})"
        )
        
        test_result = {
            "test_id": test_case.id,
            "parameters": test_case.parameters,
            "expected_output": test_case.expected_output,
            "actual_output": None,
            "passed": False,
            "error": None,
            "execution_time": None
        }
        
        if container is not None and submission_dir is not None:
            (submission_dir / "params.json").write_text(
                json.dumps(test_case.parameters), encoding="utf-8"
            )

            exit_code, logs = container.exec_run(
                ["python", "/workspace/main.py"],
                demux=False,
            )

            logs = logs.decode("utf-8").strip()

            if exit_code != 0:
                test_result["error"] = f"Execution failed with exit code {exit_code}. Output: {logs}"
                print(f"[CodeDeployment] Test case {test_case.id} failed with exit code {exit_code}")
                return test_result

            try:
                actual_output = json.loads(logs)
            except json.JSONDecodeError:
                actual_output = logs

            processed_actual = self._convert_value(actual_output)
            processed_expected = self._convert_value(test_case.expected_output)
            test_result["actual_output"] = actual_output
            passed = processed_actual == processed_expected
            test_result["passed"] = passed
            
            print(
                f"[CodeDeployment] Test case {test_case.id} result => output={actual_output} "
                f"expected={test_case.expected_output} passed={passed}"
            )
            return test_result

        submission_dir = Path(tempfile.mkdtemp(dir=IMG_PATH, prefix="sub_"))
        submission_dir.chmod(0o755)

        try:
            (submission_dir / "solution.py").write_text(code, encoding="utf-8")

            (submission_dir / "params.json").write_text(
                json.dumps(test_case.parameters), encoding="utf-8"
            )

            runner_code = f"""
import json, sys, traceback
from solution import {problem.function_name} as _fn

with open('params.json') as fp:
    _params = json.load(fp)

try:
    _result = _fn(*_params)
    print(json.dumps(_result))
except Exception as exc:
    traceback.print_exc()
    sys.exit(1)
"""
            (submission_dir / "main.py").write_text(textwrap.dedent(runner_code), encoding="utf-8")

            client = _get_docker_client()

            container = client.containers.run(
                image=docker_image or "judge-python:3.12-slim",
                command=["/workspace/main.py"],
                name=f"sub-{uuid4()}",
                detach=True,
                remove=False,
                network_disabled=True,
                mem_limit="256m",
                pids_limit=128,
                nano_cpus=1_000_000_000,  # 1 CPU
                cap_drop=["ALL"],
                security_opt=[
                    "no-new-privileges",
                    "seccomp=unconfined",
                ],
                read_only=True,
                volumes={str(submission_dir): {"bind": "/workspace", "mode": "ro"}},
                tmpfs={"/tmp": "rw,size=16m"},
            )

            result = container.wait(timeout=15)
            exit_code = result.get("StatusCode", 1)
            logs = container.logs().decode("utf-8").strip()

        finally:
            try:
                container.remove(force=True)
            except Exception:
                pass

            shutil.rmtree(submission_dir, ignore_errors=True)

        if exit_code != 0:
            test_result["error"] = f"Execution failed with exit code {exit_code}. Output: {logs}"
            print(
                f"[CodeDeployment] Test case {test_case.id} failed inside container "
                f"(exit_code={exit_code}). Raw output:\n{logs}"
            )
            return test_result

        try:
            actual_output = json.loads(logs)
        except json.JSONDecodeError:
            actual_output = logs

        processed_actual = self._convert_value(actual_output)
        processed_expected = self._convert_value(test_case.expected_output)
        test_result["actual_output"] = actual_output
        passed = processed_actual == processed_expected
        test_result["passed"] = passed
        
        print(
            f"[CodeDeployment] Test case {test_case.id} result => output={actual_output} "
            f"expected={test_case.expected_output} passed={passed}"
        )
        return test_result

    def run_all_tests(
        self,
        code: str,
        problem_index: int = 0,
        docker_image: str | None = None,
        database_session: Session | None = None,
        submission_id: int | None = None,
    ) -> Dict[str, Any]:
        """Run all tests for a specific problem"""
        problem = self.get_problem_by_index(problem_index)
        
        print(f"[CodeDeployment] Running all test cases for problem {problem_index} ({problem.function_name}) with code: {code}\n\n")
        
        test_results = []
        all_passed = True
        
        for tc in problem.test_cases:
            result = self.run_test_case(code, tc, problem_index, docker_image=docker_image)
            test_results.append(result)
            if not result["passed"]:
                all_passed = False

        print(f"[CodeDeployment] Test execution complete for problem {problem_index}. All passed: {all_passed}")
        
        if (problem.analysis and (not all_passed or problem.analyze_correct_solutions)):
            prompt = self._build_analysis_prompt(code, test_results, all_passed, problem)
            self._launch_analysis_async(prompt, database_session, submission_id, problem)

        return {
            "all_passed": all_passed,
            "test_results": test_results,
            "total_tests": len(problem.test_cases),
            "passed_tests": sum(1 for r in test_results if r["passed"]),
            "failed_tests": sum(1 for r in test_results if not r["passed"]),
            "problem_index": problem_index
        }

    def _build_analysis_prompt(self, code: str, test_results: List[Dict[str, Any]], all_passed: bool, problem: ProblemConfig) -> str:
        summary = "All tests passed." if all_passed else "Some tests failed."
        prompt = (
            f"You are an expert programming analyst. Analyse the following student submission to a coding "
            f"challenge and find the flaws in the code and topics the student is struggling with.\n\n"
            f"Problem description:\n{problem.description}\n\n"
            f"Function signature: {problem.function_name}({', '.join(problem.parameter_names)})\n\n"
            f"Student code:\n```python\n{code}\n```\n\n"
            f"Test execution summary: {summary}\n\n"
            f"Detailed test results (JSON):\n{json.dumps(test_results, indent=2)}\n\n"
            "Please explain why tests failed (if any), highlight logical or stylistic issues, and suggest "
            "specific improvements. If all tests passed, praise the solution but still point out potential "
            "optimisations or edge cases the student should consider."
        )
        return prompt

    async def _run_llm_analysis(self, prompt: str, problem: ProblemConfig, database_session: Session | None = None, submission_id: int | None = None) -> str:
        try:
            from langchain_openai import ChatOpenAI
            from langchain.schema import HumanMessage, SystemMessage
            from sqlmodel import select
            from models.db_models import Submission
            
            chat = ChatOpenAI(
                model=problem.llm_model,
                temperature=problem.temperature,
                max_tokens=problem.max_tokens,
                top_p=problem.top_p,
            )
            result = await chat.ainvoke([SystemMessage(
                content="You are a helpful assistant for code feedback speaking directly to a student. Use personal pronouns like 'you' and 'your' when addressing the student." 
                    "If the student's code is correct, praise them for their work. If the student's code is incorrect, find the flaws in the code and topics the student is struggling with. "
                    "Keep it short and concise. Stick to plain text, no pointformating or markdown. Don't type any code in your response."
                    "Stick to hints on how to improve the code and don't make up any information. "
                    "If the student's code is correct, praise them for their work WITHOUT ANALYSIS. Only correct bad coding practices like bad naming, using indexing instead of iteration when not necessary."
                    "If the student's code is incorrect, find the flaws in the code and topics the student is struggling with. "
                    "Stick to hints on how to improve the code and don't make up any information. "), 
                HumanMessage(content=prompt)])
            analysis_text = result.content if hasattr(result, "content") else str(result)
            print(f"[CodeDeployment] LLM analysis completed for problem {problem.problem_index} (length={len(analysis_text)} chars)")
            
            if database_session is not None and submission_id is not None:
                try:
                    submission = database_session.exec(select(Submission).where(Submission.id == submission_id)).first()
                    if submission:
                        submission.analysis = analysis_text
                        database_session.commit()
                        database_session.refresh(submission)
                        print(f"[CodeDeployment] Analysis saved to submission {submission_id}")
                    else:
                        print(f"[CodeDeployment] Warning: Submission {submission_id} not found for analysis update")
                except Exception as db_exc:
                    print(f"[CodeDeployment] Error saving analysis to database: {db_exc}")
            else:
                print(f"[CodeDeployment] Analysis not saved - missing database_session={database_session is not None} or submission_id={submission_id}")
                
            return analysis_text
        except Exception as exc:
            print(f"[CodeDeployment] LLM analysis failed: {exc}")
            return ""

    def _launch_analysis_async(self, prompt: str, database_session: Session | None = None, submission_id: int | None = None, problem: ProblemConfig | None = None):
        if not problem:
            print("[CodeDeployment] Cannot launch analysis without problem configuration")
            return
            
        async def _runner():
            await self._run_llm_analysis(prompt, problem, database_session, submission_id)

        try:
            import asyncio
            loop = asyncio.get_running_loop()
            loop.create_task(_runner())
            print(f"[CodeDeployment] LLM analysis scheduled in existing event loop for problem {problem.problem_index}.")
        except RuntimeError:
            import threading
            import asyncio

            def _thread_target():
                asyncio.run(_runner())

            threading.Thread(target=_thread_target, daemon=True).start()
            print(f"[CodeDeployment] LLM analysis launched in background thread for problem {problem.problem_index}.")

# Backward compatibility methods for single-problem deployments
    def get_problem_info_legacy(self) -> Dict[str, Any]:
        """Legacy method for backward compatibility - returns first problem info"""
        if not self._problems:
            raise ValueError("No problems configured in this deployment")
        return self.get_problem_info(0)

    def run_all_tests_legacy(
        self,
        code: str,
        docker_image: str | None = None,
        database_session: Session | None = None,
        submission_id: int | None = None,
    ) -> Dict[str, Any]:
        """Legacy method for backward compatibility - runs tests on first problem"""
        return self.run_all_tests(code, 0, docker_image, database_session, submission_id)
