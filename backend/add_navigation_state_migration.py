#!/usr/bin/env python3
"""
Migration script to add navigation_state column to LivePresentationSession table.
This supports group submission navigation persistence.

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


def run_navigation_state_migration():
    print("🔄 Running navigation_state migration...")
    with Session(engine) as session:
        try:
            # Inspect existing columns in livepresentationsession
            result = session.execute(text("PRAGMA table_info(livepresentationsession)"))
            columns = result.fetchall()
            column_names = [row[1] for row in columns]

            if 'navigation_state' in column_names:
                print("✅ Column 'navigation_state' already exists - no action needed")
                return

            print("➕ Adding navigation_state column to livepresentationsession table...")
            session.execute(text(
                """
                ALTER TABLE livepresentationsession
                ADD COLUMN navigation_state JSON DEFAULT NULL
                """
            ))
            session.commit()
            print("✅ Added navigation_state column successfully")
        except Exception as e:
            if 'duplicate column name' in str(e).lower() or 'already exists' in str(e).lower():
                print("✅ Column 'navigation_state' already exists (caught during attempt)")
            else:
                print(f"❌ navigation_state migration failed: {e}")
                session.rollback()
                raise

if __name__ == "__main__":
    run_navigation_state_migration()
