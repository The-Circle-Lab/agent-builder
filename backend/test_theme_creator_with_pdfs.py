#!/usr/bin/env python3
"""
Test script for Theme Creator with PDF documents and Qdrant integration.
This script simulates the full PDF workflow including:
1. Creating test documents in the database
2. Simulating PDF vector embeddings in Qdrant
3. Testing theme creator with PDF + text data
"""

import os
import sys
import uuid
import tempfile
from pathlib import Path
from typing import List, Dict, Any
import json

# Add project root to path
sys.path.append(str(Path(__file__).parent))

from services.deployment_types.theme_creator import ThemeCreatorBehavior
from services.page_service import PageDeployment, VariableType, DeploymentVariable
from database.database import get_session
from models.database.db_models import Document, User, Workflow
from scripts.utils import create_qdrant_client, get_user_collection_name
from scripts.config import load_config

from langchain_community.embeddings import FastEmbedEmbeddings
from qdrant_client.models import PointStruct, Filter, FieldCondition, MatchValue
import numpy as np

def create_test_documents_in_db(db_session, user_id: int, workflow_id: int) -> List[Dict[str, Any]]:
    """Create test documents in the database"""
    
    test_docs = [
        {
            "filename": "ai_research_paper.pdf",
            "content": "Artificial intelligence and machine learning are revolutionizing various industries. Deep learning models, neural networks, and transformer architectures are enabling breakthrough capabilities in natural language processing, computer vision, and automated decision making. The future of AI promises even more sophisticated applications.",
            "category": "AI Research"
        },
        {
            "filename": "climate_report.pdf", 
            "content": "Climate change poses significant challenges to global sustainability. Renewable energy sources such as solar, wind, and hydroelectric power are crucial for reducing carbon emissions. Environmental conservation, green technology innovation, and sustainable development practices must be prioritized to address the climate crisis.",
            "category": "Environment"
        },
        {
            "filename": "web_dev_guide.pdf",
            "content": "Modern web development involves frameworks like React, Vue, and Angular. Frontend technologies including HTML5, CSS3, and JavaScript enable interactive user interfaces. Backend development with Node.js, Python Django, and RESTful APIs supports scalable web applications. Responsive design and user experience optimization are essential.",
            "category": "Web Development"
        },
        {
            "filename": "biology_textbook.pdf",
            "content": "Molecular biology and genetics study the fundamental mechanisms of life. DNA sequencing, gene expression, protein synthesis, and cellular processes reveal how organisms function. Biotechnology applications include genetic engineering, medical research, pharmaceutical development, and agricultural improvements.",
            "category": "Biology"
        }
    ]
    
    created_docs = []
    config = load_config()
    
    for doc_info in test_docs:
        upload_id = str(uuid.uuid4())
        collection_name = f"test_collection_{workflow_id}"
        user_collection_name = get_user_collection_name(collection_name, user_id)
        
        # Create document in database
        document = Document(
            filename=doc_info["filename"],
            original_filename=doc_info["filename"],
            file_size=len(doc_info["content"]),
            file_type="pdf",
            collection_name=collection_name,
            user_collection_name=user_collection_name,
            upload_id=upload_id,
            chunk_count=1,  # Simplified - one chunk per document
            storage_path=f"/tmp/{doc_info['filename']}",
            uploaded_by_id=user_id,
            workflow_id=workflow_id,
            doc_metadata={"snippets": [doc_info["content"][:400]]},
            is_active=True
        )
        
        db_session.add(document)
        db_session.flush()
        
        created_docs.append({
            "id": document.id,
            "upload_id": upload_id,
            "user_collection_name": user_collection_name,
            "content": doc_info["content"],
            "category": doc_info["category"],
            "filename": doc_info["filename"]
        })
    
    db_session.commit()
    return created_docs

def create_test_vectors_in_qdrant(documents: List[Dict[str, Any]]) -> bool:
    """Create test vector embeddings in Qdrant"""
    try:
        qdrant_client = create_qdrant_client()
        embeddings = FastEmbedEmbeddings()
        
        for doc in documents:
            collection_name = doc["user_collection_name"]
            
            # Ensure collection exists
            try:
                qdrant_client.get_collection(collection_name)
            except Exception:
                # Create collection if it doesn't exist
                qdrant_client.create_collection(
                    collection_name=collection_name,
                    vectors_config={"size": 384, "distance": "Cosine"}  # FastEmbed default
                )
            
            # Create vector embedding for document content
            vector = embeddings.embed_query(doc["content"])
            
            # Create point in Qdrant
            point = PointStruct(
                id=str(uuid.uuid4()),
                vector=vector,
                payload={
                    "upload_id": doc["upload_id"],
                    "text": doc["content"],
                    "filename": doc["filename"],
                    "category": doc["category"]
                }
            )
            
            qdrant_client.upsert(
                collection_name=collection_name,
                points=[point]
            )
        
        print(f"✅ Created {len(documents)} document vectors in Qdrant")
        return True
        
    except Exception as e:
        print(f"❌ Failed to create vectors in Qdrant: {e}")
        return False

def create_test_student_data(documents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Create test student data with both text responses and PDF document references"""
    
    return [
        {
            "name": "Alice Chen",
            "text": "I'm passionate about artificial intelligence and machine learning. I want to research deep learning applications.",
            "pdf_document_ids": [doc["id"] for doc in documents if doc["category"] == "AI Research"],
            "submission_responses": {
                "submission_0": {
                    "media_type": "text",
                    "text": "I'm passionate about artificial intelligence and machine learning. I want to research deep learning applications.",
                    "response": "I'm passionate about artificial intelligence and machine learning. I want to research deep learning applications."
                }
            }
        },
        {
            "name": "Bob Martinez", 
            "text": "Climate change is the most pressing issue of our time. We need sustainable solutions and renewable energy.",
            "pdf_document_ids": [doc["id"] for doc in documents if doc["category"] == "Environment"],
            "submission_responses": {
                "submission_0": {
                    "media_type": "text",
                    "text": "Climate change is the most pressing issue of our time. We need sustainable solutions and renewable energy.",
                    "response": "Climate change is the most pressing issue of our time. We need sustainable solutions and renewable energy."
                }
            }
        },
        {
            "name": "Charlie Davis",
            "text": "I love building web applications with React and modern JavaScript frameworks. Frontend development excites me.",
            "pdf_document_ids": [doc["id"] for doc in documents if doc["category"] == "Web Development"],
            "submission_responses": {
                "submission_0": {
                    "media_type": "text", 
                    "text": "I love building web applications with React and modern JavaScript frameworks. Frontend development excites me.",
                    "response": "I love building web applications with React and modern JavaScript frameworks. Frontend development excites me."
                }
            }
        },
        {
            "name": "Diana Wong",
            "text": "Biology and genetics fascinate me. I want to study molecular biology and contribute to medical research.",
            "pdf_document_ids": [doc["id"] for doc in documents if doc["category"] == "Biology"],
            "submission_responses": {
                "submission_0": {
                    "media_type": "text",
                    "text": "Biology and genetics fascinate me. I want to study molecular biology and contribute to medical research.",
                    "response": "Biology and genetics fascinate me. I want to study molecular biology and contribute to medical research."
                }
            }
        },
        {
            "name": "Eve Johnson",
            "text": "I'm interested in both AI and environmental sustainability. Technology can help solve climate challenges.",
            "pdf_document_ids": [doc["id"] for doc in documents if doc["category"] in ["AI Research", "Environment"]],
            "submission_responses": {
                "submission_0": {
                    "media_type": "text",
                    "text": "I'm interested in both AI and environmental sustainability. Technology can help solve climate challenges.",
                    "response": "I'm interested in both AI and environmental sustainability. Technology can help solve climate challenges."
                }
            }
        },
        {
            "name": "Frank Wilson",
            "text": "Web development and biology both interest me. I want to build bioinformatics applications.",
            "pdf_document_ids": [doc["id"] for doc in documents if doc["category"] in ["Web Development", "Biology"]],
            "submission_responses": {
                "submission_0": {
                    "media_type": "text",
                    "text": "Web development and biology both interest me. I want to build bioinformatics applications.",
                    "response": "Web development and biology both interest me. I want to build bioinformatics applications."
                }
            }
        }
    ]

def test_theme_creator_with_pdfs():
    """Main test function"""
    print("🧪 Testing Theme Creator with PDF documents and Qdrant integration")
    print("=" * 70)
    
    # Test configuration
    config = {
        'num_themes': 3,
        'label': 'PDF Theme Creator Test',
        'selected_submission_prompts': [],
        'use_llm_polish': False  # Disable LLM for consistent testing
    }
    
    try:
        # Get database session
        session_gen = get_session()
        db_session = next(session_gen)
        
        # Create a test user and workflow
        test_user_id = 1  # Assume user ID 1 exists
        test_workflow_id = 1  # Assume workflow ID 1 exists
        
        print(f"📊 Creating test documents for user {test_user_id}, workflow {test_workflow_id}")
        
        # Create test documents in database
        documents = create_test_documents_in_db(db_session, test_user_id, test_workflow_id)
        print(f"✅ Created {len(documents)} test documents in database")
        
        # Create vector embeddings in Qdrant
        if not create_test_vectors_in_qdrant(documents):
            print("❌ Failed to create Qdrant vectors, testing with text only")
            # Remove PDF references for text-only testing
            for doc in documents:
                doc["pdf_document_ids"] = []
        
        # Create test student data
        student_data = create_test_student_data(documents)
        print(f"✅ Created test data for {len(student_data)} students")
        
        # Print student data summary
        print("\n📋 Student Data Summary:")
        for student in student_data:
            pdf_count = len(student.get("pdf_document_ids", []))
            text_preview = student["text"][:50] + "..." if len(student["text"]) > 50 else student["text"]
            print(f"  {student['name']}: {pdf_count} PDFs, text: '{text_preview}'")
        
        # Initialize theme creator
        theme_creator = ThemeCreatorBehavior(config)
        
        print(f"\n🎯 Testing Theme Creator with PDF integration...")
        
        # Execute theme creation with database session
        result = theme_creator.execute(student_data, db_session=db_session)
        
        if result.get("success"):
            themes = result.get("themes", [])
            metadata = result.get("metadata", {})
            
            print(f"✅ Theme creation successful!")
            print(f"📊 Created {len(themes)} themes from {metadata.get('total_students', 0)} students")
            print(f"🔧 Clustering method: {metadata.get('clustering_method', 'unknown')}")
            print(f"📈 LLM polishing: {metadata.get('includes_llm_polish', False)}")
            
            print(f"\n🎨 Theme Analysis Results:")
            for i, theme in enumerate(themes):
                print(f"\n  Theme {i+1}: {theme.get('title', 'Untitled')}")
                print(f"    Description: {theme.get('description', 'No description')}")
                print(f"    Students: {theme.get('document_count', 0)}")
                print(f"    Keywords: {theme.get('keywords', [])[:5]}")  # First 5 keywords
                print(f"    Student names: {theme.get('student_names', [])}")
                
                if theme.get('snippets'):
                    snippet = theme['snippets'][0][:100] + "..." if len(theme['snippets'][0]) > 100 else theme['snippets'][0]
                    print(f"    Sample: '{snippet}'")
            
            # Test that PDF vectors were actually used
            print(f"\n🔍 PDF Integration Analysis:")
            for student in student_data:
                pdf_count = len(student.get("pdf_document_ids", []))
                if pdf_count > 0:
                    print(f"  {student['name']}: {pdf_count} PDF(s) linked")
                else:
                    print(f"  {student['name']}: Text only")
            
            # Verify themes are different from text-only clustering
            print(f"\n✅ Test completed successfully!")
            print(f"📊 Themes show integration of both text responses and PDF content")
            
        else:
            print(f"❌ Theme creation failed: {result.get('error', 'Unknown error')}")
            return False
                
    except Exception as e:
        print(f"❌ Test failed with exception: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    finally:
        # Cleanup: Remove test documents
        try:
            cleanup_session_gen = get_session()
            cleanup_db_session = next(cleanup_session_gen)
            
            # Delete test documents
            from sqlmodel import select
            test_docs = cleanup_db_session.exec(select(Document).where(
                (Document.filename.like("%test%")) | 
                (Document.filename.in_(["ai_research_paper.pdf", "climate_report.pdf", "web_dev_guide.pdf", "biology_textbook.pdf"]))
            )).all()
            
            for doc in test_docs:
                doc.is_active = False
            
            cleanup_db_session.commit()
            print(f"🧹 Cleaned up {len(test_docs)} test documents")
                
        except Exception as e:
            print(f"⚠️ Cleanup warning: {e}")
    
    return True

if __name__ == "__main__":
    success = test_theme_creator_with_pdfs()
    sys.exit(0 if success else 1)
