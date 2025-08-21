from sqlmodel import SQLModel, create_engine, Session
from sqlalchemy import text
import sys
from pathlib import Path

# Add parent directory to path to import from config
sys.path.append(str(Path(__file__).parent.parent))
from scripts.config import load_config

# Load config
config = load_config()

engine = create_engine(
    config.get("database", {}).get("url", "sqlite:///./database/app.db"), 
    connect_args=config.get("database", {}).get("connect_args", {})
)


def get_session():
    with Session(engine) as session:
        yield session


def init_db():
    SQLModel.metadata.create_all(engine)
    _apply_sqlite_migrations()
    # Recreate tables after migration (in case any were dropped)
    SQLModel.metadata.create_all(engine)


def shutdown_db():
    engine.dispose()


def _apply_sqlite_migrations():
    """Lightweight migrations to add newly introduced nullable columns safely.
    This keeps existing user data and adds columns if they are missing.
    """
    try:
        with engine.begin() as conn:
            # Inspect existing columns on the user table
            result = conn.execute(text("PRAGMA table_info('user')"))
            existing_columns = {row[1] for row in result.fetchall()}  # name is at index 1

            migrations: list[tuple[str, str]] = []

            if 'first_name' not in existing_columns:
                migrations.append((
                    'first_name',
                    "ALTER TABLE user ADD COLUMN first_name TEXT"
                ))

            if 'last_name' not in existing_columns:
                migrations.append((
                    'last_name',
                    "ALTER TABLE user ADD COLUMN last_name TEXT"
                ))

            if 'about_me' not in existing_columns:
                migrations.append((
                    'about_me',
                    "ALTER TABLE user ADD COLUMN about_me TEXT"
                ))

            if 'birthday' not in existing_columns:
                # Store as TEXT (YYYY-MM-DD) for SQLite compatibility
                migrations.append((
                    'birthday',
                    "ALTER TABLE user ADD COLUMN birthday TEXT"
                ))

            for _, stmt in migrations:
                conn.execute(text(stmt))
            
            # Theme table migrations
            _apply_theme_table_migrations(conn)
            
            # Live presentation table migrations
            _apply_live_presentation_table_migrations(conn)
    except Exception:
        # Avoid startup failure due to best-effort migration
        pass


def _apply_theme_table_migrations(conn):
    """Apply migrations for theme-related tables."""
    try:
        # Check if theme_assignments table exists
        result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='theme_assignments'"))
        if not result.fetchone():
            return  # Table doesn't exist yet, will be created by SQLModel
        
        # Since theme tables are new and the schema has changed significantly,
        # we'll drop and recreate them to avoid complex migrations
        theme_tables = [
            'theme_student_associations',
            'theme_snippets', 
            'theme_keywords',
            'themes',
            'theme_assignments'
        ]
        
        print("Recreating theme tables with updated schema...")
        
        # Drop theme tables in correct order (respecting foreign keys)
        for table in theme_tables:
            try:
                conn.execute(text(f"DROP TABLE IF EXISTS {table}"))
            except Exception as e:
                print(f"Warning dropping {table}: {e}")
        
        # Check if output_themes_created column exists in behavior_execution_history
        try:
            result = conn.execute(text("PRAGMA table_info('behaviorexecutionhistory')"))
            behavior_columns = {row[1] for row in result.fetchall()}
            
            if 'output_themes_created' not in behavior_columns:
                conn.execute(text("ALTER TABLE behaviorexecutionhistory ADD COLUMN output_themes_created INTEGER"))
        except Exception:
            pass  # Table might not exist yet
            
    except Exception as e:
        # Log but don't fail startup
        print(f"Theme migration warning: {e}")
        pass


def _apply_live_presentation_table_migrations(conn):
    """Apply migrations for live presentation tables."""
    try:
        # Live presentation tables are new, so we just ensure they will be created
        # by SQLModel.metadata.create_all() after migrations
        # 
        # If we need to migrate existing live presentation data in the future,
        # we can add specific migrations here
        
        print("Live presentation tables will be created by SQLModel if they don't exist")
        
    except Exception as e:
        print(f"Live presentation table migration failed: {e}")
        pass
