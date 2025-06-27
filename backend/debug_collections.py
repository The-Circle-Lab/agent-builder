#!/usr/bin/env python3
"""
Debug script to check Qdrant collections and help diagnose MCP search issues.
"""

import os
from qdrant_client import QdrantClient
from sqlmodel import Session, select, create_engine
from database.db_models import Document, Workflow, User
from database.database import get_engine

def check_qdrant_collections():
    """Check what collections exist in Qdrant."""
    try:
        qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333")
        print(f"🔍 Connecting to Qdrant at: {qdrant_url}")
        
        client = QdrantClient(url=qdrant_url)
        collections = client.get_collections()
        
        print(f"📊 Found {len(collections.collections)} collections in Qdrant:")
        for i, collection in enumerate(collections.collections, 1):
            try:
                collection_info = client.get_collection(collection.name)
                point_count = collection_info.points_count
                print(f"  {i}. {collection.name} ({point_count} documents)")
            except Exception as e:
                print(f"  {i}. {collection.name} (error getting info: {e})")
        
        return [col.name for col in collections.collections]
        
    except Exception as e:
        print(f"❌ Error connecting to Qdrant: {e}")
        return []

def check_database_collections():
    """Check what collections are expected from the database."""
    try:
        print(f"\n🗄️  Checking database for expected collections...")
        
        engine = get_engine()
        with Session(engine) as session:
            # Get all workflows with their collection IDs
            workflows = session.exec(select(Workflow)).all()
            print(f"📁 Found {len(workflows)} workflows:")
            
            for workflow in workflows:
                user_collection = f"{workflow.workflow_collection_id}_{workflow.created_by_id}"
                
                # Count documents in this workflow
                doc_count = session.exec(
                    select(Document).where(
                        Document.workflow_id == workflow.id,
                        Document.is_active == True
                    )
                ).all()
                
                print(f"  - {workflow.name} (ID: {workflow.id})")
                print(f"    Collection ID: {user_collection}")
                print(f"    Documents: {len(doc_count)}")
                
            return [f"{w.workflow_collection_id}_{w.created_by_id}" for w in workflows]
            
    except Exception as e:
        print(f"❌ Error checking database: {e}")
        return []

def find_orphaned_collections():
    """Find collections that exist in Qdrant but not in database."""
    qdrant_collections = check_qdrant_collections()
    expected_collections = check_database_collections()
    
    print(f"\n🔍 Collection Analysis:")
    
    # Find orphaned collections (in Qdrant but not expected)
    orphaned = set(qdrant_collections) - set(expected_collections)
    if orphaned:
        print(f"⚠️  Orphaned collections in Qdrant (not linked to workflows):")
        for col in orphaned:
            print(f"  - {col}")
    else:
        print("✅ No orphaned collections found")
    
    # Find missing collections (expected but not in Qdrant)
    missing = set(expected_collections) - set(qdrant_collections)
    if missing:
        print(f"❌ Missing collections (workflows expect them but they don't exist in Qdrant):")
        for col in missing:
            print(f"  - {col}")
            print(f"    This will cause MCP search to hang!")
    else:
        print("✅ All expected collections exist in Qdrant")
    
    return {
        "qdrant_collections": qdrant_collections,
        "expected_collections": expected_collections,
        "orphaned": list(orphaned),
        "missing": list(missing)
    }

def cleanup_orphaned_collections(dry_run=True):
    """Clean up orphaned collections."""
    analysis = find_orphaned_collections()
    
    if not analysis["orphaned"]:
        print("\n✅ No orphaned collections to clean up")
        return
    
    print(f"\n🧹 Cleanup orphaned collections (dry_run={dry_run}):")
    
    if not dry_run:
        try:
            qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333")
            client = QdrantClient(url=qdrant_url)
            
            for collection_name in analysis["orphaned"]:
                print(f"  🗑️  Deleting {collection_name}...")
                client.delete_collection(collection_name)
                
            print("✅ Cleanup completed")
        except Exception as e:
            print(f"❌ Error during cleanup: {e}")
    else:
        print("  (Run with dry_run=False to actually delete)")
        for collection_name in analysis["orphaned"]:
            print(f"  Would delete: {collection_name}")

if __name__ == "__main__":
    print("🔧 Qdrant Collection Debug Tool")
    print("=" * 50)
    
    # Check collections
    analysis = find_orphaned_collections()
    
    if analysis["missing"]:
        print(f"\n💡 To fix missing collections:")
        print("1. Upload documents to the affected workflows")
        print("2. Or delete/recreate the workflows if they're not needed")
    
    if analysis["orphaned"]:
        print(f"\n💡 To clean up orphaned collections:")
        print("Run: python debug_collections.py --cleanup")
    
    print(f"\n📋 Summary:")
    print(f"  - Qdrant collections: {len(analysis['qdrant_collections'])}")
    print(f"  - Expected collections: {len(analysis['expected_collections'])}")
    print(f"  - Orphaned: {len(analysis['orphaned'])}")
    print(f"  - Missing: {len(analysis['missing'])}")
    
    # Check for cleanup flag
    import sys
    if "--cleanup" in sys.argv:
        cleanup_orphaned_collections(dry_run=False)
    elif "--cleanup-dry-run" in sys.argv:
        cleanup_orphaned_collections(dry_run=True) 
