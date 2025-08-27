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
    """Add assigned_list_items column immediately"""
    config = load_config()
    database_url = config.get("database", {}).get("url", "sqlite:///./database/app.db")
    connect_args = config.get("database", {}).get("connect_args", {})
    
    engine = create_engine(database_url, connect_args=connect_args)
    
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
                print("✅ Column already exists - no action needed")
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

if __name__ == "__main__":
    run_migration_now()

