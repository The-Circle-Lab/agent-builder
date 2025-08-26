#!/usr/bin/env python3
"""
Migration script to add assigned_list_items column to LivePresentationStudentConnection table
Run this script to fix the database schema after the model update.
"""

import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlmodel import create_engine, Session
from scripts.config import load_config

def run_migration():
    """Add assigned_list_items column to live presentation student connections"""
    # Load config and create engine the same way as database.py
    config = load_config()
    database_url = config.get("database", {}).get("url", "sqlite:///./database/app.db")
    connect_args = config.get("database", {}).get("connect_args", {})
    
    engine = create_engine(database_url, connect_args=connect_args)
    
    with Session(engine) as session:
        try:
            # Check if column already exists
            result = session.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'livepresentationstudentconnection' 
                AND column_name = 'assigned_list_items'
            """)
            
            if result.fetchone():
                print("✅ Column 'assigned_list_items' already exists")
                return
            
            # Add the column
            session.execute("""
                ALTER TABLE livepresentationstudentconnection 
                ADD COLUMN assigned_list_items JSON DEFAULT '{}'
            """)
            session.commit()
            print("✅ Added 'assigned_list_items' column to LivePresentationStudentConnection table")
            
        except Exception as e:
            print(f"❌ Migration failed: {e}")
            session.rollback()
            raise

if __name__ == "__main__":
    run_migration()
