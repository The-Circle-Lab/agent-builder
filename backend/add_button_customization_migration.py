#!/usr/bin/env python3
"""
Migration to add student button customization columns to PageDeploymentState table.
This migration will be run automatically during server startup.
"""

import sys
from pathlib import Path

# Add backend to Python path
backend_dir = Path(__file__).parent
sys.path.append(str(backend_dir))

from sqlmodel import Session, text
from database.database import engine


def migrate_button_customization():
    """Add button customization columns to existing PageDeploymentState records"""
    print("🔄 Running button customization migration...")
    
    with Session(engine) as session:
        try:
            # Check if columns already exist using SQLite's PRAGMA table_info
            result = session.exec(text("PRAGMA table_info(pagedeploymentstate)")).fetchall()
            existing_columns = [row[1] for row in result]  # Column name is at index 1
            
            if 'student_button_text' not in existing_columns:
                print("➕ Adding student_button_text column...")
                session.exec(text("""
                    ALTER TABLE pagedeploymentstate 
                    ADD COLUMN student_button_text VARCHAR DEFAULT 'Enter'
                """))
                print("✅ Added student_button_text column")
            else:
                print("ℹ️  student_button_text column already exists")
            
            if 'student_button_color' not in existing_columns:
                print("➕ Adding student_button_color column...")
                session.exec(text("""
                    ALTER TABLE pagedeploymentstate 
                    ADD COLUMN student_button_color VARCHAR DEFAULT 'bg-indigo-600 hover:bg-indigo-700'
                """))
                print("✅ Added student_button_color column")
            else:
                print("ℹ️  student_button_color column already exists")
            
            # Update any existing records that have NULL values
            result = session.exec(text("SELECT COUNT(*) FROM pagedeploymentstate WHERE student_button_text IS NULL OR student_button_color IS NULL")).first()
            if result and result[0] > 0:
                print("🔄 Updating existing records with default values...")
                session.exec(text("""
                    UPDATE pagedeploymentstate 
                    SET student_button_text = 'Enter' 
                    WHERE student_button_text IS NULL
                """))
                
                session.exec(text("""
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
                raise


if __name__ == "__main__":
    migrate_button_customization()
