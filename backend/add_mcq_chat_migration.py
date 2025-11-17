#!/usr/bin/env python3
"""
Migration script to add MCQChatConversation and MCQChatMessage tables.
This supports storing chat conversation history for MCQ remediation chatbot.

It is idempotent and safe to run multiple times. It will be picked up automatically
by the existing startup migration runner in main.py (run_migration_now).
"""

import os
import sys
from pathlib import Path

# Ensure backend path
backend_dir = Path(__file__).parent
sys.path.append(str(backend_dir))

from sqlmodel import Session
from sqlalchemy import text
from database.database import engine


def run_mcq_chat_migration():
    print("🔄 Running MCQ chat tables migration...")
    with Session(engine) as session:
        try:
            # Check if MCQChatConversation table exists
            result = session.execute(text(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='mcqchatconversation'"
            ))
            mcq_chat_conversation_exists = result.fetchone() is not None

            # Check if MCQChatMessage table exists
            result = session.execute(text(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='mcqchatmessage'"
            ))
            mcq_chat_message_exists = result.fetchone() is not None

            if mcq_chat_conversation_exists and mcq_chat_message_exists:
                print("✅ MCQ chat tables already exist - no action needed")
                return

            # Create MCQChatConversation table
            if not mcq_chat_conversation_exists:
                print("➕ Creating mcqchatconversation table...")
                session.execute(text(
                    """
                    CREATE TABLE mcqchatconversation (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id INTEGER NOT NULL,
                        user_id INTEGER NOT NULL,
                        deployment_id INTEGER NOT NULL,
                        created_at TIMESTAMP NOT NULL,
                        updated_at TIMESTAMP NOT NULL,
                        FOREIGN KEY (session_id) REFERENCES mcqsession (id),
                        FOREIGN KEY (user_id) REFERENCES user (id),
                        FOREIGN KEY (deployment_id) REFERENCES deployment (id),
                        CONSTRAINT unique_mcq_chat_conversation UNIQUE (session_id, user_id)
                    )
                    """
                ))
                print("✅ Created mcqchatconversation table successfully")

            # Create MCQChatMessage table
            if not mcq_chat_message_exists:
                print("➕ Creating mcqchatmessage table...")
                session.execute(text(
                    """
                    CREATE TABLE mcqchatmessage (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        conversation_id INTEGER NOT NULL,
                        message_text TEXT NOT NULL,
                        is_user_message BOOLEAN NOT NULL,
                        sources JSON,
                        created_at TIMESTAMP NOT NULL,
                        FOREIGN KEY (conversation_id) REFERENCES mcqchatconversation (id)
                    )
                    """
                ))
                print("✅ Created mcqchatmessage table successfully")

            session.commit()
            print("✅ MCQ chat migration completed successfully")

        except Exception as e:
            if 'already exists' in str(e).lower() or 'duplicate' in str(e).lower():
                print("✅ MCQ chat tables already exist (caught during attempt)")
            else:
                print(f"❌ MCQ chat migration failed: {e}")
                session.rollback()
                raise


if __name__ == "__main__":
    run_mcq_chat_migration()
