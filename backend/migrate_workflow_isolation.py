#!/usr/bin/env python3
"""
Migration script for workflow isolation features.
This script adds the new workflow_collection_id and workflow_id fields.
"""

import sqlite3
import uuid
import os
from pathlib import Path

def migrate_database(db_path: str = "database.db"):
    """Run database migration for workflow isolation."""
    
    print(f"🔄 Starting migration for database: {db_path}")
    
    if not os.path.exists(db_path):
        print(f"❌ Database file not found: {db_path}")
        print("ℹ️  If this is a new setup, just run the application and the database will be created with the new schema.")
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if workflow_collection_id column exists
        cursor.execute("PRAGMA table_info(workflow)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'workflow_collection_id' not in columns:
            print("➕ Adding workflow_collection_id column to workflow table...")
            cursor.execute("""
                ALTER TABLE workflow 
                ADD COLUMN workflow_collection_id TEXT
            """)
            
            # Generate unique collection IDs for existing workflows
            cursor.execute("SELECT id FROM workflow")
            workflow_ids = cursor.fetchall()
            
            for (workflow_id,) in workflow_ids:
                collection_id = f"wf_{uuid.uuid4().hex[:12]}"
                cursor.execute("""
                    UPDATE workflow 
                    SET workflow_collection_id = ? 
                    WHERE id = ?
                """, (collection_id, workflow_id))
            
            print(f"✅ Updated {len(workflow_ids)} existing workflows with collection IDs")
        else:
            print("✅ workflow_collection_id column already exists")
        
        # Check if workflow_id column exists in document table
        cursor.execute("PRAGMA table_info(document)")
        doc_columns = [column[1] for column in cursor.fetchall()]
        
        if 'workflow_id' not in doc_columns:
            print("➕ Adding workflow_id column to document table...")
            cursor.execute("""
                ALTER TABLE document 
                ADD COLUMN workflow_id INTEGER
            """)
            print("✅ Added workflow_id column to document table")
            print("ℹ️  Note: Existing documents will have workflow_id = NULL")
            print("ℹ️  You may need to manually associate existing documents with workflows")
        else:
            print("✅ workflow_id column already exists in document table")
        
        conn.commit()
        print("✅ Migration completed successfully!")
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Migration failed: {e}")
        raise
    
    finally:
        conn.close()

if __name__ == "__main__":
    # Try common database locations
    possible_paths = [
        "database.db",
        "backend/database.db", 
        "../database.db"
    ]
    
    db_path = None
    for path in possible_paths:
        if os.path.exists(path):
            db_path = path
            break
    
    if db_path:
        migrate_database(db_path)
    else:
        print("❌ Could not find database file.")
        print("ℹ️  Please run this script from the correct directory or specify the database path.")
        print("ℹ️  If this is a new setup, just run the application normally.") 
