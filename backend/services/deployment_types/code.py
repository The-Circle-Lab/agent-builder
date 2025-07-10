import ast
from typing import Any, List, Dict

from tomlkit import boolean
from models.deployment_models import TestCase
from uuid import uuid4
import celery
import docker
from pathlib import Path
import json, shutil, tempfile, textwrap
from celery import Celery
import requests
from docker.errors import DockerException
import json as _json
import asyncio
from langchain_openai import ChatOpenAI
from langchain.schema import HumanMessage, SystemMessage
from sqlmodel import Session, select
from models.db_models import Submission

try:
    import inspect  # Standard library
    from types import FunctionType
    import docker.auth as _docker_auth  # type: ignore

    _sig = inspect.signature(_docker_auth.load_config)
    if "config_dict" not in _sig.parameters and not hasattr(_docker_auth.load_config, "__patched__"):

        _legacy_load_config = _docker_auth.load_config 

        def _patched_load_config(config_path=None, config_dict=None, credstore_env=None): 
            return _legacy_load_config(config_path)

        _patched_load_config.__patched__ = True  

        # Monkey-patch the module-level function *in-place*.
        _docker_auth.load_config = _patched_load_config

except Exception:
    pass

def _get_docker_client():
    last_exc: Exception | None = None

    for use_legacy in (False, True):
        try:
            client = (
                docker.from_env()
                if use_legacy
                else docker.DockerClient.from_env()
            )

            # Verify daemon reachability (this also populates version cache).
            client.ping()
            return client
        except (DockerException, FileNotFoundError, requests.exceptions.ConnectionError) as exc:
            last_exc = exc
            continue

    raise RuntimeError(
        "Docker daemon is not reachable. Ensure Docker is installed and running."
    ) from last_exc

SEC_PROFILE = Path(__file__).parent.parent.parent / "seccomp.json"
IMG_PATH = Path(__file__).parent.parent.parent / "uploads" / "code_submissions"

celery_app = Celery(__name__)

class CodeDeployment:
    _function_name: str
    _test_cases: List[TestCase]
    _description: str
    _parameter_names: List[str]
    _analysis: bool
    _analyze_correct_solutions: bool
    _llm_model: str
    _max_tokens: int
    _temperature: float
    _top_p: float

    def __init__(self, problem_config: Dict[str, Any]):
        code_attachments = problem_config['attachments']['tests'][0]
        test_config = code_attachments['config']
        self._load_test_cases(test_config['test_cases'])
        self._function_name = test_config['function_name']
        self._description = test_config['description']
        self._parameter_names = test_config['parameter_names']
        print("Function name: ", self._function_name)
        print("Description: ", self._description)
        print("Parameter names: ", self._parameter_names)
        self._analysis = ('attachments' in code_attachments)
        print("analysis: ", self._analysis)
        print("json: ", code_attachments['attachments'])
        if (self._analysis):
            attachments = code_attachments['attachments']
            analyzer_node = attachments['codeAnalyzers'][0]
            self._analyze_correct_solutions = analyzer_node['config']['analyzeGoodSubmissions']
            llm_config = analyzer_node['attachments']['llmModel'][0]
            self._llm_model = llm_config['config']['model']
            self._max_tokens = llm_config['config']['maximumOutputTokens']
            self._temperature = llm_config['config']['temperature']
            self._top_p = llm_config['config']['topP']
        

    def get_problem_info(self) -> Dict[str, Any]:
        return {
            "function_name": self._function_name,
            "description": self._description,
            "parameter_names": self._parameter_names,
        }

    @staticmethod
    def _convert_value(value: Any) -> Any:
        if isinstance(value, str):
            try:
                return ast.literal_eval(value)
            except (ValueError, SyntaxError):
                return value
        return value

    def _load_test_cases(self, test_case_list: List[Dict[str, Any]]):
        self._test_cases = []

        for idx, raw_case in enumerate(test_case_list, start=1):
            raw_params = raw_case.get("parameters", [])
            parsed_params = [self._convert_value(p) for p in raw_params]

            raw_expected = raw_case.get("expected")
            parsed_expected = self._convert_value(raw_expected)

            self._test_cases.append(
                TestCase(
                    id=idx,
                    parameters=parsed_params,
                    expected_output=parsed_expected,
                )
            )
        return self._test_cases

    def run_test_case(
        self,
        code: str,
        test_case: TestCase,
        *,
        container=None,
        submission_dir: Path | None = None,
        docker_image: str | None = None,
    ) -> Dict[str, Any]:
        # ------------------------------------------------------------------
        # Debug: announce test case execution
        # ------------------------------------------------------------------
        print(
            f"[CodeDeployment] Running test case {test_case.id} "
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
        
        # Fast path: reuse existing container
        if container is not None and submission_dir is not None:
            # Update parameters file that the runner will read.
            (submission_dir / "params.json").write_text(
                json.dumps(test_case.parameters), encoding="utf-8"
            )

            # Execute the runner inside the already-running container.
            exit_code, logs = container.exec_run(
                ["python", "/workspace/main.py"],
                demux=False,
            )

            logs = logs.decode("utf-8").strip()

            # Early exit if script failed
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

        # ------------------------------------------------------------------
        # Stand-alone execution path (create container per test case)
        # ------------------------------------------------------------------

        # 1. Prepare submission directory
        submission_dir = Path(tempfile.mkdtemp(dir=IMG_PATH, prefix="sub_"))

        try:
            # --- write user solution ---
            (submission_dir / "solution.py").write_text(code, encoding="utf-8")

            # --- write parameters file ---
            (submission_dir / "params.json").write_text(
                json.dumps(test_case.parameters), encoding="utf-8"
            )

            # --- write runner ---
            runner_code = f"""
import json, sys, traceback
from solution import {self._function_name} as _fn

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

                # 2. Run container
                # Try the modern high-level client first.  If that fails due to
                # an outdated system package we fall back to the low-level client
                # and our own thin wrapper.
            client = _get_docker_client()

            # Use the image's default entrypoint (python3) and just pass the
            # script path – otherwise we end up with an argument mismatch
            # (python3 python /workspace/main.py) which fails.
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
                    # Use an unconfined seccomp profile to avoid issues with
                    # modern runtimes inside the slim python image. The
                    # container is still locked down via read-only rootfs,
                    # dropped capabilities, memory/CPU limits, and disabled
                    # networking, so this remains safe while ensuring runc can
                    # start.
                    "seccomp=unconfined",
                ],
                read_only=True,
                volumes={str(submission_dir): {"bind": "/workspace", "mode": "ro"}},
                tmpfs={"/tmp": "rw,size=16m"},
            )

            # 3. Wait for completion and collect logs
            result = container.wait(timeout=15)
            exit_code = result.get("StatusCode", 1)
            logs = container.logs().decode("utf-8").strip()

        finally:
            # Ensure resources are cleaned up
            try:
                container.remove(force=True)
            except Exception:
                pass

            # Remove the temporary directory
            shutil.rmtree(submission_dir, ignore_errors=True)

        # Early exit if script failed — show container output for debugging
        if exit_code != 0:
            test_result["error"] = f"Execution failed with exit code {exit_code}. Output: {logs}"
            print(
                f"[CodeDeployment] Test case {test_case.id} failed inside container "
                f"(exit_code={exit_code}). Raw output:\n{logs}"
            )
            return test_result

        # 4. Compare output
        try:
            actual_output = json.loads(logs)
        except json.JSONDecodeError:
            # treat raw string as output
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
        docker_image: str | None = None,
        database_session: Session | None = None,
        submission_id: int | None = None,
    ) -> Dict[str, Any]:
        print(f"[CodeDeployment] Running all test cases with code: {code}\n\n")
        
        test_results = []
        all_passed = True
        
        for tc in self._test_cases:
            result = self.run_test_case(code, tc, docker_image=docker_image)
            test_results.append(result)
            if not result["passed"]:
                all_passed = False

        print(f"[CodeDeployment] Test execution complete. All passed: {all_passed}")
        
        if (self._analysis and (not all_passed or self._analyze_correct_solutions)):
            prompt = self._build_analysis_prompt(code, test_results, all_passed)
            self._launch_analysis_async(prompt, database_session, submission_id)

        return {
            "all_passed": all_passed,
            "test_results": test_results,
            "total_tests": len(self._test_cases),
            "passed_tests": sum(1 for r in test_results if r["passed"]),
            "failed_tests": sum(1 for r in test_results if not r["passed"])
        }

    def _build_analysis_prompt(self, code: str, test_results: List[Dict[str, Any]], all_passed: bool) -> str:
        summary = "All tests passed." if all_passed else "Some tests failed."
        prompt = (
            f"You are an expert programming analyst. Analyse the following student submission to a coding "
            f"challenge and find the flaws in the code and topics the student is struggling with.\n\n"
            f"Problem description:\n{self._description}\n\n"
            f"Function signature: {self._function_name}({', '.join(self._parameter_names)})\n\n"
            f"Student code:\n```python\n{code}\n```\n\n"
            f"Test execution summary: {summary}\n\n"
            f"Detailed test results (JSON):\n{json.dumps(test_results, indent=2)}\n\n"
            "Please explain why tests failed (if any), highlight logical or stylistic issues, and suggest "
            "specific improvements. If all tests passed, praise the solution but still point out potential "
            "optimisations or edge cases the student should consider."
        )
        return prompt

    async def _run_llm_analysis(self, prompt: str, database_session: Session | None = None, submission_id: int | None = None) -> str:
        try:
            chat = ChatOpenAI(
                model=self._llm_model,
                temperature=self._temperature,
                max_tokens=self._max_tokens,
                top_p=self._top_p,
            )
            result = await chat.ainvoke([SystemMessage(content="You are a helpful assistant for code feedback."), HumanMessage(content=prompt)])
            # Depending on LangChain version, result may be just a string or a message object
            analysis_text = result.content if hasattr(result, "content") else str(result)
            print(f"[CodeDeployment] LLM analysis completed (length={len(analysis_text)} chars)")
            
            # Save analysis to database if both session and submission_id are provided
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

    def _launch_analysis_async(self, prompt: str, database_session: Session | None = None, submission_id: int | None = None):
        async def _runner():
            await self._run_llm_analysis(prompt, database_session, submission_id)

        try:
            loop = asyncio.get_running_loop()
            # If we are already inside an event loop, schedule a background task.
            loop.create_task(_runner())
            print("[CodeDeployment] LLM analysis scheduled in existing event loop.")
        except RuntimeError:
            import threading

            def _thread_target():
                asyncio.run(_runner())

            threading.Thread(target=_thread_target, daemon=True).start()
            print("[CodeDeployment] LLM analysis launched in background thread.")
