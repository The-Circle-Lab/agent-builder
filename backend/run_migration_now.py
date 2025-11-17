#!/usr/bin/env python3
"""
Quick migration runner - can be executed manually to add the missing column
"""

import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlmodel import create_engine, Session
from sqlalchemy import text
from scripts.config import load_config

def run_migration_now():
    """Run all necessary migrations"""
    config = load_config()
    database_url = config.get("database", {}).get("url", "sqlite:///./database/app.db")
    connect_args = config.get("database", {}).get("connect_args", {})
    
    engine = create_engine(database_url, connect_args=connect_args)
    
    # Migration 1: Add assigned_list_items column
    with Session(engine) as session:
        try:
            print("🔧 Adding assigned_list_items column to livepresentationstudentconnection table...")
            
            # Try to add the column (will fail if it already exists, which is fine)
            session.execute(text("""
                ALTER TABLE livepresentationstudentconnection 
                ADD COLUMN assigned_list_items TEXT DEFAULT '{}'
            """))
            session.commit()
            print("✅ Successfully added assigned_list_items column!")
            
        except Exception as e:
            if "duplicate column name" in str(e).lower() or "already exists" in str(e).lower():
                print("✅ assigned_list_items column already exists - no action needed")
            else:
                print(f"❌ Migration failed: {e}")
                session.rollback()
                # Try with JSON type instead
                try:
                    session.execute(text("""
                        ALTER TABLE livepresentationstudentconnection 
                        ADD COLUMN assigned_list_items JSON DEFAULT '{}'
                    """))
                    session.commit()
                    print("✅ Successfully added assigned_list_items column with JSON type!")
                except Exception as e2:
                    print(f"❌ Final migration attempt failed: {e2}")
                    session.rollback()
    
    # Migration 2: Add button customization columns
    with Session(engine) as session:
        try:
            print("🔧 Adding button customization columns to pagedeploymentstate table...")
            
            # Check if columns already exist using SQLite's PRAGMA table_info
            result = session.execute(text("PRAGMA table_info(pagedeploymentstate)")).fetchall()
            existing_columns = [row[1] for row in result]  # Column name is at index 1
            
            if 'student_button_text' not in existing_columns:
                print("➕ Adding student_button_text column...")
                session.execute(text("""
                    ALTER TABLE pagedeploymentstate 
                    ADD COLUMN student_button_text VARCHAR DEFAULT 'Enter'
                """))
                print("✅ Added student_button_text column")
            else:
                print("ℹ️  student_button_text column already exists")
            
            if 'student_button_color' not in existing_columns:
                print("➕ Adding student_button_color column...")
                session.execute(text("""
                    ALTER TABLE pagedeploymentstate 
                    ADD COLUMN student_button_color VARCHAR DEFAULT 'bg-indigo-600 hover:bg-indigo-700'
                """))
                print("✅ Added student_button_color column")
            else:
                print("ℹ️  student_button_color column already exists")
            
            # Update any existing records that have NULL values
            result = session.execute(text("SELECT COUNT(*) FROM pagedeploymentstate WHERE student_button_text IS NULL OR student_button_color IS NULL")).fetchall()
            if result and result[0][0] > 0:
                print("🔄 Updating existing records with default values...")
                session.execute(text("""
                    UPDATE pagedeploymentstate 
                    SET student_button_text = 'Enter' 
                    WHERE student_button_text IS NULL
                """))
                
                session.execute(text("""
                    UPDATE pagedeploymentstate 
                    SET student_button_color = 'bg-indigo-600 hover:bg-indigo-700' 
                    WHERE student_button_color IS NULL
                """))
                print("✅ Updated existing records")
            
            session.commit()
            print("✅ Button customization migration completed successfully!")
            
        except Exception as e:
            if "duplicate column name" in str(e).lower() or "already exists" in str(e).lower():
                print("✅ Button customization columns already exist - no action needed")
            else:
                print(f"❌ Button customization migration failed: {e}")
                session.rollback()
    
    # Migration 3: Add due_date column
    with Session(engine) as session:
        try:
            print("🔧 Adding due_date column to pagedeploymentstate table...")
            
            # Check if column already exists using SQLite's PRAGMA table_info
            result = session.execute(text("PRAGMA table_info(pagedeploymentstate)")).fetchall()
            existing_columns = [row[1] for row in result]  # Column name is at index 1
            
            if 'due_date' not in existing_columns:
                print("➕ Adding due_date column...")
                session.execute(text("""
                    ALTER TABLE pagedeploymentstate 
                    ADD COLUMN due_date DATETIME DEFAULT NULL
                """))
                print("✅ Added due_date column")
            else:
                print("ℹ️  due_date column already exists")
            
            session.commit()
            print("✅ Due date migration completed successfully!")
            
        except Exception as e:
            if "duplicate column name" in str(e).lower() or "already exists" in str(e).lower():
                print("✅ Due date column already exists - no action needed")
            else:
                print(f"❌ Due date migration failed: {e}")
                session.rollback()

    # Migration 4: Add navigation_state column to livepresentationsession
    with Session(engine) as session:
        try:
            print("🔧 Adding navigation_state column to livepresentationsession table...")
            result = session.execute(text("PRAGMA table_info(livepresentationsession)")).fetchall()
            existing_columns = [row[1] for row in result]

            if 'navigation_state' not in existing_columns:
                print("➕ Adding navigation_state column...")
                session.execute(text("""
                    ALTER TABLE livepresentationsession
                    ADD COLUMN navigation_state JSON DEFAULT NULL
                """))
                print("✅ Added navigation_state column")
            else:
                print("ℹ️  navigation_state column already exists")

            session.commit()
            print("✅ navigation_state migration completed successfully!")
        except Exception as e:
            if "duplicate column name" in str(e).lower() or "already exists" in str(e).lower():
                print("✅ navigation_state column already exists - no action needed")
            else:
                print(f"❌ navigation_state migration failed: {e}")
                session.rollback()

    # Migration 5: Add MCQ chat tables
    with Session(engine) as session:
        try:
            print("🔧 Adding MCQ chat tables (mcqchatconversation and mcqchatmessage)...")
            
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
                print("ℹ️  MCQ chat tables already exist")
            else:
                # Create MCQChatConversation table
                if not mcq_chat_conversation_exists:
                    print("➕ Creating mcqchatconversation table...")
                    session.execute(text("""
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
                    """))
                    print("✅ Created mcqchatconversation table")
                else:
                    print("ℹ️  mcqchatconversation table already exists")

                # Create MCQChatMessage table
                if not mcq_chat_message_exists:
                    print("➕ Creating mcqchatmessage table...")
                    session.execute(text("""
                        CREATE TABLE mcqchatmessage (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            conversation_id INTEGER NOT NULL,
                            message_text TEXT NOT NULL,
                            is_user_message BOOLEAN NOT NULL,
                            sources JSON,
                            created_at TIMESTAMP NOT NULL,
                            FOREIGN KEY (conversation_id) REFERENCES mcqchatconversation (id)
                        )
                    """))
                    print("✅ Created mcqchatmessage table")
                else:
                    print("ℹ️  mcqchatmessage table already exists")

            session.commit()
            print("✅ MCQ chat migration completed successfully!")
        except Exception as e:
            if 'already exists' in str(e).lower() or 'duplicate' in str(e).lower():
                print("✅ MCQ chat tables already exist - no action needed")
            else:
                print(f"❌ MCQ chat migration failed: {e}")
                session.rollback()

if __name__ == "__main__":
    run_migration_now()
