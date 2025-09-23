#!/usr/bin/env python3
"""
Script to remove a specific user by email and all associated data.

This script will:
1. Find the user by email "praman@torontomu.ca"
2. Delete all associated data (sessions, submissions, memberships, etc.)
3. Remove the user account
4. Provide detailed deletion reports

Usage: python remove_specific_user.py
"""

import sys
from pathlib import Path
from typing import List, Dict, Any

# Add the backend directory to the path
sys.path.append(str(Path(__file__).parent))

from sqlmodel import Session, select, delete
from database.database import engine
from models.database.db_models import (
    User, AuthSession, ClassMembership, PromptSession, PromptSubmission,
    ChatConversation, ChatMessage, MCQSession, MCQAnswer,
    StudentDeploymentGrade, UserProblemState, Submission
)

class SpecificUserRemover:
    def __init__(self, target_email: str):
        self.target_email = target_email
        self.engine = engine
        self.deleted_counts = {
            'users': 0,
            'auth_sessions': 0,
            'class_memberships': 0,
            'prompt_sessions': 0,
            'prompt_submissions': 0,
            'chat_conversations': 0,
            'chat_messages': 0,
            'mcq_sessions': 0,
            'mcq_answers': 0,
            'grades': 0,
            'problem_states': 0,
            'code_submissions': 0
        }

    def find_user(self, session: Session) -> User | None:
        """Find the user by email"""
        user = session.exec(
            select(User).where(User.email == self.target_email)
        ).first()
        return user

    def get_user_data_summary(self, session: Session, user: User) -> Dict[str, int]:
        """Get summary of data associated with the user"""
        user_id = user.id
        summary = {}

        # Auth sessions
        auth_sessions = session.exec(
            select(AuthSession).where(AuthSession.user_id == user_id)
        ).all()
        summary['auth_sessions'] = len(auth_sessions)

        # Class memberships
        memberships = session.exec(
            select(ClassMembership).where(ClassMembership.user_id == user_id)
        ).all()
        summary['class_memberships'] = len(memberships)

        # Prompt sessions
        prompt_sessions = session.exec(
            select(PromptSession).where(PromptSession.user_id == user_id)
        ).all()
        summary['prompt_sessions'] = len(prompt_sessions)

        # Prompt submissions (via sessions)
        session_ids = [ps.id for ps in prompt_sessions]
        prompt_submissions = []
        if session_ids:
            prompt_submissions = session.exec(
                select(PromptSubmission).where(PromptSubmission.session_id.in_(session_ids))
            ).all()
        summary['prompt_submissions'] = len(prompt_submissions)

        # Chat conversations
        chat_conversations = session.exec(
            select(ChatConversation).where(ChatConversation.user_id == user_id)
        ).all()
        summary['chat_conversations'] = len(chat_conversations)

        # Chat messages (via conversations)
        conversation_ids = [cc.id for cc in chat_conversations]
        chat_messages = []
        if conversation_ids:
            chat_messages = session.exec(
                select(ChatMessage).where(ChatMessage.conversation_id.in_(conversation_ids))
            ).all()
        summary['chat_messages'] = len(chat_messages)

        # MCQ sessions
        mcq_sessions = session.exec(
            select(MCQSession).where(MCQSession.user_id == user_id)
        ).all()
        summary['mcq_sessions'] = len(mcq_sessions)

        # MCQ answers (via sessions)
        mcq_session_ids = [ms.id for ms in mcq_sessions]
        mcq_answers = []
        if mcq_session_ids:
            mcq_answers = session.exec(
                select(MCQAnswer).where(MCQAnswer.session_id.in_(mcq_session_ids))
            ).all()
        summary['mcq_answers'] = len(mcq_answers)

        # Student grades
        grades = session.exec(
            select(StudentDeploymentGrade).where(StudentDeploymentGrade.user_id == user_id)
        ).all()
        summary['grades'] = len(grades)

        # User problem states
        problem_states = session.exec(
            select(UserProblemState).where(UserProblemState.user_id == user_id)
        ).all()
        summary['problem_states'] = len(problem_states)

        # Code submissions
        code_submissions = session.exec(
            select(Submission).where(Submission.user_id == user_id)
        ).all()
        summary['code_submissions'] = len(code_submissions)

        return summary

    def delete_user_data(self, session: Session, user: User) -> None:
        """Delete all data associated with the user"""
        user_id = user.id
        print(f"🗑️  Deleting data for user: {user.email} (ID: {user_id})")

        # Delete in reverse order of foreign key dependencies

        # 1. Delete prompt submissions first (they reference prompt sessions)
        prompt_sessions = session.exec(
            select(PromptSession).where(PromptSession.user_id == user_id)
        ).all()
        session_ids = [ps.id for ps in prompt_sessions]

        if session_ids:
            deleted_submissions = session.exec(
                delete(PromptSubmission).where(PromptSubmission.session_id.in_(session_ids))
            )
            self.deleted_counts['prompt_submissions'] = deleted_submissions.rowcount
            print(f"   📝 Deleted {deleted_submissions.rowcount} prompt submissions")

        # 2. Delete prompt sessions
        deleted_prompt_sessions = session.exec(
            delete(PromptSession).where(PromptSession.user_id == user_id)
        )
        self.deleted_counts['prompt_sessions'] = deleted_prompt_sessions.rowcount
        print(f"   📝 Deleted {deleted_prompt_sessions.rowcount} prompt sessions")

        # 3. Delete chat messages (they reference conversations)
        chat_conversations = session.exec(
            select(ChatConversation).where(ChatConversation.user_id == user_id)
        ).all()
        conversation_ids = [cc.id for cc in chat_conversations]

        if conversation_ids:
            deleted_messages = session.exec(
                delete(ChatMessage).where(ChatMessage.conversation_id.in_(conversation_ids))
            )
            self.deleted_counts['chat_messages'] = deleted_messages.rowcount
            print(f"   💬 Deleted {deleted_messages.rowcount} chat messages")

        # 4. Delete chat conversations
        deleted_conversations = session.exec(
            delete(ChatConversation).where(ChatConversation.user_id == user_id)
        )
        self.deleted_counts['chat_conversations'] = deleted_conversations.rowcount
        print(f"   💬 Deleted {deleted_conversations.rowcount} chat conversations")

        # 5. Delete MCQ answers (they reference MCQ sessions)
        mcq_sessions = session.exec(
            select(MCQSession).where(MCQSession.user_id == user_id)
        ).all()
        mcq_session_ids = [ms.id for ms in mcq_sessions]

        if mcq_session_ids:
            deleted_mcq_answers = session.exec(
                delete(MCQAnswer).where(MCQAnswer.session_id.in_(mcq_session_ids))
            )
            self.deleted_counts['mcq_answers'] = deleted_mcq_answers.rowcount
            print(f"   ❓ Deleted {deleted_mcq_answers.rowcount} MCQ answers")

        # 6. Delete MCQ sessions
        deleted_mcq_sessions = session.exec(
            delete(MCQSession).where(MCQSession.user_id == user_id)
        )
        self.deleted_counts['mcq_sessions'] = deleted_mcq_sessions.rowcount
        print(f"   ❓ Deleted {deleted_mcq_sessions.rowcount} MCQ sessions")

        # 7. Delete code submissions
        deleted_code_submissions = session.exec(
            delete(Submission).where(Submission.user_id == user_id)
        )
        self.deleted_counts['code_submissions'] = deleted_code_submissions.rowcount
        print(f"   💻 Deleted {deleted_code_submissions.rowcount} code submissions")

        # 8. Delete user problem states
        deleted_problem_states = session.exec(
            delete(UserProblemState).where(UserProblemState.user_id == user_id)
        )
        self.deleted_counts['problem_states'] = deleted_problem_states.rowcount
        print(f"   🧩 Deleted {deleted_problem_states.rowcount} problem states")

        # 9. Delete student grades
        deleted_grades = session.exec(
            delete(StudentDeploymentGrade).where(StudentDeploymentGrade.user_id == user_id)
        )
        self.deleted_counts['grades'] = deleted_grades.rowcount
        print(f"   📊 Deleted {deleted_grades.rowcount} grades")

        # 10. Delete class memberships
        deleted_memberships = session.exec(
            delete(ClassMembership).where(ClassMembership.user_id == user_id)
        )
        self.deleted_counts['class_memberships'] = deleted_memberships.rowcount
        print(f"   🏫 Deleted {deleted_memberships.rowcount} class memberships")

        # 11. Delete auth sessions
        deleted_auth_sessions = session.exec(
            delete(AuthSession).where(AuthSession.user_id == user_id)
        )
        self.deleted_counts['auth_sessions'] = deleted_auth_sessions.rowcount
        print(f"   🔐 Deleted {deleted_auth_sessions.rowcount} auth sessions")

        # 12. Finally, delete the user
        deleted_users = session.exec(
            delete(User).where(User.id == user_id)
        )
        self.deleted_counts['users'] = deleted_users.rowcount
        print(f"   👤 Deleted {deleted_users.rowcount} user")

    def run_removal(self, dry_run: bool = False) -> None:
        """Run the user removal process"""
        print("🗑️  SPECIFIC USER REMOVAL TOOL")
        print("=" * 50)
        print(f"Target user: {self.target_email}")

        with Session(self.engine) as session:
            # Step 1: Find the user
            print("🔍 Finding user...")
            user = self.find_user(session)

            if not user:
                print(f"❌ User with email '{self.target_email}' not found!")
                return

            print(f"📋 Found user: {user.email} (ID: {user.id})")

            # Step 2: Get data summary
            data_summary = self.get_user_data_summary(session, user)

            print("📊 Associated data to be deleted:")
            for data_type, count in data_summary.items():
                if count > 0:
                    print(f"   • {data_type.replace('_', ' ').title()}: {count}")

            # Step 3: Confirm deletion (unless dry run)
            if dry_run:
                print("🔍 DRY RUN: Would delete user and associated data")
                return

            print("⚠️  WARNING: This will permanently delete the user and all associated data!")
            confirmation = input("Type 'DELETE' to confirm: ")

            if confirmation != 'DELETE':
                print("❌ Removal cancelled.")
                return

            # Step 4: Perform deletion
            print("🗑️  Starting removal...")
            self.delete_user_data(session, user)

            # Commit changes
            session.commit()
            print("✅ User removal completed successfully!")

            # Step 5: Summary
            print("📊 REMOVAL SUMMARY:")
            total_items = sum(self.deleted_counts.values())
            print(f"   🗑️  Total items deleted: {total_items}")
            for data_type, count in self.deleted_counts.items():
                if count > 0:
                    print(f"   • {data_type.replace('_', ' ').title()}: {count}")

def main():
    """Main execution function"""
    import argparse

    parser = argparse.ArgumentParser(description='Remove a specific user by email')
    parser.add_argument('--email', default='praman@torontomu.ca',
                       help='Email of the user to remove (default: praman@torontomu.ca)')
    parser.add_argument('--dry-run', action='store_true',
                       help='Show what would be deleted without actually deleting')
    parser.add_argument('--force', action='store_true',
                       help='Skip confirmation prompt')

    args = parser.parse_args()

    remover = SpecificUserRemover(args.email)

    if args.dry_run:
        remover.run_removal(dry_run=True)
    else:
        remover.run_removal(dry_run=False)

if __name__ == "__main__":
    main()
