from ..enums import ClassRole, SubmissionStatus, DeploymentType
from .user_models import User, AuthSession
from .class_models import Class, ClassMembership
from .workflow_models import Workflow, Document, Video
from .deployment_models import Deployment, DeploymentProblemLink
from .code_models import Problem, TestCase, UserProblemState, Submission
from .chat_models import ChatConversation, ChatMessage
from .mcq_models import MCQSession, MCQAnswer
from .prompt_models import PromptSession, PromptSubmission
from .grading_models import StudentDeploymentGrade
from .page_models import PageDeploymentState, PageDeploymentVariable, BehaviorExecutionHistory
from .grouping_models import GroupAssignment, Group, GroupMember
from .theme_models import ThemeAssignment, Theme, ThemeKeyword, ThemeSnippet, ThemeStudentAssociation
from .live_presentation_models import (
    LivePresentationSession, 
    LivePresentationStudentConnection, 
    LivePresentationResponse, 
    LivePresentationPrompt
)

# Export all models for backward compatibility
__all__ = [
    "ClassRole",
    "SubmissionStatus",
    "DeploymentType",
    "DeploymentProblemLink",
    "User",
    "AuthSession",
    "Class",
    "ClassMembership",
    "Workflow",
    "Document",
    "Video",
    "ChatConversation",
    "ChatMessage",
    "Deployment",
    "Problem",
    "TestCase",
    "UserProblemState",
    "Submission",
    "StudentDeploymentGrade",
    "MCQSession",
    "MCQAnswer",
    "PromptSession",
    "PromptSubmission",
    "PageDeploymentState",
    "PageDeploymentVariable",
    "BehaviorExecutionHistory",
    "GroupAssignment",
    "Group",
    "GroupMember",
    "ThemeAssignment",
    "Theme",
    "ThemeKeyword", 
    "ThemeSnippet",
    "ThemeStudentAssociation",
    "LivePresentationSession",
    "LivePresentationStudentConnection", 
    "LivePresentationResponse",
    "LivePresentationPrompt",
]


