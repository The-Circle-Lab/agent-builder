from enum import Enum

class DeploymentType(str, Enum):
    CHAT = "chat"
    CODE = "code"
    MCQ = "mcq"
    PROMPT = "prompt"
    PAGE = "page"
    LIVE_PRESENTATION = "livePresentation" 

class ClassRole(str, Enum):
    STUDENT = "student"
    INSTRUCTOR = "instructor"

class SubmissionStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    PASSED = "passed"
    FAILED = "failed"
    ERROR = "error"
