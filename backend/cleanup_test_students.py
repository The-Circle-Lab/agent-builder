#!/usr/bin/env python3
"""
Cleanup script to remove test student accounts and all associated data.

This script will:
1. Find all test student users (by email pattern)
2. Delete all associated data (sessions, submissions, memberships)
3. Remove the user accounts themselves
4. Provide detailed cleanup reports

Usage: python cleanup_test_students.py
"""

import sys
from pathlib import Path
from typing import List, Dict, Any
import re

# Add the backend directory to the path
sys.path.append(str(Path(__file__).parent))

from sqlmodel import Session, select, delete
from database.database import engine
from models.database.db_models import (
    User, AuthSession, ClassMembership, PromptSession, PromptSubmission,
    ChatConversation, ChatMessage, MCQSession, MCQAnswer,
    StudentDeploymentGrade, UserProblemState, Submission
)

class TestStudentCleanup:
    def __init__(self):
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
    
    def identify_test_users(self, session: Session) -> List[User]:
        """Identify test users by email patterns"""
        test_patterns = [
            r'.*\..*\d+@student\.edu$',  # firstname.lastname123@student.edu
            r'.*test.*@.*',              # any email with "test" in it
            r'.*demo.*@.*',              # any email with "demo" in it
        ]
        
        test_users = []
        
        # Get all users
        all_users = session.exec(select(User)).all()
        
        for user in all_users:
            # Skip global instructors (safety measure)
            if user.is_global_instructor:
                continue
                
            # Check if email matches test patterns
            for pattern in test_patterns:
                if re.match(pattern, user.email, re.IGNORECASE):
                    test_users.append(user)
                    break
        
        return test_users
    
    def get_user_data_summary(self, session: Session, user_ids: List[int]) -> Dict[str, int]:
        """Get summary of data associated with test users"""
        if not user_ids:
            return {}
        
        summary = {}
        
        # Auth sessions
        auth_sessions = session.exec(
            select(AuthSession).where(AuthSession.user_id.in_(user_ids))
        ).all()
        summary['auth_sessions'] = len(auth_sessions)
        
        # Class memberships
        memberships = session.exec(
            select(ClassMembership).where(ClassMembership.user_id.in_(user_ids))
        ).all()
        summary['class_memberships'] = len(memberships)
        
        # Prompt sessions
        prompt_sessions = session.exec(
            select(PromptSession).where(PromptSession.user_id.in_(user_ids))
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
            select(ChatConversation).where(ChatConversation.user_id.in_(user_ids))
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
            select(MCQSession).where(MCQSession.user_id.in_(user_ids))
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
            select(StudentDeploymentGrade).where(StudentDeploymentGrade.user_id.in_(user_ids))
        ).all()
        summary['grades'] = len(grades)
        
        # User problem states
        problem_states = session.exec(
            select(UserProblemState).where(UserProblemState.user_id.in_(user_ids))
        ).all()
        summary['problem_states'] = len(problem_states)
        
        # Code submissions
        code_submissions = session.exec(
            select(Submission).where(Submission.user_id.in_(user_ids))
        ).all()
        summary['code_submissions'] = len(code_submissions)
        
        return summary
    
    def delete_user_data(self, session: Session, user_ids: List[int]) -> None:
        """Delete all data associated with test users"""
        if not user_ids:
            return
        
        print("🗑️  Deleting associated data...")
        
        # Delete in reverse order of foreign key dependencies
        
        # 1. Delete prompt submissions first (they reference prompt sessions)
        prompt_sessions = session.exec(
            select(PromptSession).where(PromptSession.user_id.in_(user_ids))
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
            delete(PromptSession).where(PromptSession.user_id.in_(user_ids))
        )
        self.deleted_counts['prompt_sessions'] = deleted_prompt_sessions.rowcount
        print(f"   📝 Deleted {deleted_prompt_sessions.rowcount} prompt sessions")
        
        # 3. Delete chat messages (they reference conversations)
        chat_conversations = session.exec(
            select(ChatConversation).where(ChatConversation.user_id.in_(user_ids))
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
            delete(ChatConversation).where(ChatConversation.user_id.in_(user_ids))
        )
        self.deleted_counts['chat_conversations'] = deleted_conversations.rowcount
        print(f"   💬 Deleted {deleted_conversations.rowcount} chat conversations")
        
        # 5. Delete MCQ answers (they reference MCQ sessions)
        mcq_sessions = session.exec(
            select(MCQSession).where(MCQSession.user_id.in_(user_ids))
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
            delete(MCQSession).where(MCQSession.user_id.in_(user_ids))
        )
        self.deleted_counts['mcq_sessions'] = deleted_mcq_sessions.rowcount
        print(f"   ❓ Deleted {deleted_mcq_sessions.rowcount} MCQ sessions")
        
        # 7. Delete code submissions
        deleted_code_submissions = session.exec(
            delete(Submission).where(Submission.user_id.in_(user_ids))
        )
        self.deleted_counts['code_submissions'] = deleted_code_submissions.rowcount
        print(f"   💻 Deleted {deleted_code_submissions.rowcount} code submissions")
        
        # 8. Delete user problem states
        deleted_problem_states = session.exec(
            delete(UserProblemState).where(UserProblemState.user_id.in_(user_ids))
        )
        self.deleted_counts['problem_states'] = deleted_problem_states.rowcount
        print(f"   🧩 Deleted {deleted_problem_states.rowcount} problem states")
        
        # 9. Delete student grades
        deleted_grades = session.exec(
            delete(StudentDeploymentGrade).where(StudentDeploymentGrade.user_id.in_(user_ids))
        )
        self.deleted_counts['grades'] = deleted_grades.rowcount
        print(f"   📊 Deleted {deleted_grades.rowcount} grades")
        
        # 10. Delete class memberships
        deleted_memberships = session.exec(
            delete(ClassMembership).where(ClassMembership.user_id.in_(user_ids))
        )
        self.deleted_counts['class_memberships'] = deleted_memberships.rowcount
        print(f"   🏫 Deleted {deleted_memberships.rowcount} class memberships")
        
        # 11. Delete auth sessions
        deleted_auth_sessions = session.exec(
            delete(AuthSession).where(AuthSession.user_id.in_(user_ids))
        )
        self.deleted_counts['auth_sessions'] = deleted_auth_sessions.rowcount
        print(f"   🔐 Deleted {deleted_auth_sessions.rowcount} auth sessions")
        
        # 12. Finally, delete users
        deleted_users = session.exec(
            delete(User).where(User.id.in_(user_ids))
        )
        self.deleted_counts['users'] = deleted_users.rowcount
        print(f"   👤 Deleted {deleted_users.rowcount} users")
    
    def run_cleanup(self, dry_run: bool = False) -> None:
        """Run the cleanup process"""
        print("🧹 TEST STUDENT CLEANUP TOOL")
        print("=" * 50)
        
        with Session(self.engine) as session:
            # Step 1: Identify test users
            print("🔍 Identifying test users...")
            test_users = self.identify_test_users(session)
            
            if not test_users:
                print("✅ No test users found! Database is already clean.")
                return
            
            print(f"📋 Found {len(test_users)} test users:")
            for user in test_users:
                print(f"   • {user.email} (ID: {user.id})")
            
            # Step 2: Get data summary
            user_ids = [user.id for user in test_users]
            data_summary = self.get_user_data_summary(session, user_ids)
            
            print(f"\n📊 Associated data to be deleted:")
            for data_type, count in data_summary.items():
                if count > 0:
                    print(f"   • {data_type.replace('_', ' ').title()}: {count}")
            
            # Step 3: Confirm deletion (unless dry run)
            if dry_run:
                print(f"\n🔍 DRY RUN: Would delete {len(test_users)} users and their associated data")
                return
            
            print(f"\n⚠️  WARNING: This will permanently delete {len(test_users)} users and all their data!")
            confirmation = input("Type 'DELETE' to confirm: ")
            
            if confirmation != 'DELETE':
                print("❌ Cleanup cancelled.")
                return
            
            # Step 4: Perform deletion
            print(f"\n🗑️  Starting cleanup...")
            self.delete_user_data(session, user_ids)
            
            # Commit changes
            session.commit()
            print(f"\n✅ Cleanup completed successfully!")
            
            # Step 5: Summary
            print(f"\n📊 CLEANUP SUMMARY:")
            total_items = sum(self.deleted_counts.values())
            print(f"   🗑️  Total items deleted: {total_items}")
            for data_type, count in self.deleted_counts.items():
                if count > 0:
                    print(f"   • {data_type.replace('_', ' ').title()}: {count}")

def main():
    """Main execution function"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Cleanup test student accounts')
    parser.add_argument('--dry-run', action='store_true', 
                       help='Show what would be deleted without actually deleting')
    parser.add_argument('--force', action='store_true',
                       help='Skip confirmation prompt')
    
    args = parser.parse_args()
    
    cleanup = TestStudentCleanup()
    
    if args.dry_run:
        cleanup.run_cleanup(dry_run=True)
    else:
        cleanup.run_cleanup(dry_run=False)

if __name__ == "__main__":
    main() 
