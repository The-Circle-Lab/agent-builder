import os
from celery import Celery
from database.database import get_session, engine
from sqlmodel import Session, select
from services.summary_agent import SummaryAgent
from typing import Dict, Any, Optional
import traceback
from datetime import datetime
from pathlib import Path
import uuid
import os
import tempfile

from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.embeddings import FastEmbedEmbeddings
from langchain_community.vectorstores import Qdrant

from models.database.db_models import Workflow, Document, Deployment, PromptSession, PromptSubmission
from scripts.config import load_config
from scripts.utils import get_user_collection_name
from api.file_storage import store_file, delete_stored_file

# Configure Celery
broker_url = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
result_backend = os.getenv("CELERY_RESULT_BACKEND", broker_url)

celery_app = Celery("agent_tasks", broker=broker_url, backend=result_backend)

# Configure task settings for longer-running tasks
celery_app.conf.update(
    task_soft_time_limit=300,  # 5 minutes soft limit
    task_time_limit=600,       # 10 minutes hard limit
    worker_prefetch_multiplier=1,  # Process one task at a time for heavy operations
    task_track_started=True,   # Track when tasks start
    task_serializer='json',
    result_serializer='json',
    accept_content=['json'],
)

config = load_config()


@celery_app.task(name="embed_analyses_to_qdrant")
def embed_analyses_to_qdrant_task(problem_id: int):
    try:
        # Create session directly for Celery tasks
        with Session(engine) as db:
            agent = SummaryAgent(db)
            agent.embed_analyses_to_qdrant(problem_id)
    except Exception as exc:
        print(f"[Celery] embed_analyses_to_qdrant_task failed for problem {problem_id}: {exc}")


@celery_app.task(name="execute_behavior", bind=True)
def execute_behavior_task(self, deployment_id: str, behavior_number: str, executed_by_user_id: int, behavior_config: Dict[str, Any], student_data: Optional[list] = None):
    """
    Execute a behavior (group assignment or theme creation) asynchronously.
    
    Args:
        deployment_id: The deployment ID
        behavior_number: The behavior number to execute
        executed_by_user_id: ID of the user executing the behavior
        behavior_config: Configuration for the behavior
        student_data: Optional student data (will be auto-fetched if None)
    
    Returns:
        Dict with execution results
    """
    task_id = self.request.id
    print(f"🚀 [Celery] Starting behavior execution task {task_id}")
    print(f"   Deployment: {deployment_id}")
    print(f"   Behavior: {behavior_number}")
    print(f"   Config: {behavior_config.get('behavior_type', 'unknown')}")
    
    try:
        # Create session directly for Celery tasks (not using FastAPI dependency injection)
        with Session(engine) as db:
            from services.pages_manager import get_active_page_deployment
            
            # Update task state to PROGRESS
            self.update_state(
                state='PROGRESS',
                meta={
                    'status': 'Initializing behavior execution...',
                    'progress': 10,
                    'stage': 'initialization'
                }
            )
            
            # Get the page deployment from memory, or load it if not found
            deployment_info = get_active_page_deployment(deployment_id)
            if not deployment_info:
                print(f"🔄 [Celery] Page deployment {deployment_id} not in memory, loading from database...")
                # Try to load the deployment from database
                from services.pages_manager import load_page_deployment_on_demand
                import asyncio
                
                try:
                    # Load deployment from database (async function, so we need to run it in event loop)
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    try:
                        loaded = loop.run_until_complete(load_page_deployment_on_demand(deployment_id, executed_by_user_id, db))
                    finally:
                        loop.close()
                    
                    if not loaded:
                        raise Exception(f"Page deployment {deployment_id} not found in database or is inactive")
                    
                    # Get the deployment info after loading
                    deployment_info = get_active_page_deployment(deployment_id)
                    if not deployment_info:
                        raise Exception(f"Failed to load page deployment {deployment_id} into memory")
                    
                    print(f"✅ [Celery] Successfully loaded page deployment {deployment_id} from database")
                    
                except Exception as load_error:
                    raise Exception(f"Failed to load page deployment {deployment_id}: {str(load_error)}")
            
            page_deployment = deployment_info["page_deployment"]
            page_deployment.set_database_session(db)
            
            # Validate behavior exists
            behavior = page_deployment.get_behavior_by_number(behavior_number)
            if not behavior:
                raise Exception(f"Behavior {behavior_number} not found")
            
            self.update_state(
                state='PROGRESS',
                meta={
                    'status': 'Executing behavior...',
                    'progress': 30,
                    'stage': 'execution'
                }
            )
            
            start_time = datetime.now()
            
            # Create progress callback to update task state
            def progress_callback(progress: int, status: str, stage: str = None):
                """Update task progress"""
                if stage is None:
                    stage = 'execution'
                self.update_state(
                    state='PROGRESS',
                    meta={
                        'status': status,
                        'progress': progress,
                        'stage': stage
                    }
                )
                print(f"🔄 [Celery] Progress: {progress}% - {status}")
            
            # Execute behavior with resolved input and progress tracking
            result = page_deployment.execute_behavior_with_resolved_input(
                behavior_number, 
                executed_by_user_id=executed_by_user_id,
                progress_callback=progress_callback
            )
            
            end_time = datetime.now()
            execution_time = str(end_time - start_time)
            
            self.update_state(
                state='PROGRESS',
                meta={
                    'status': 'Saving results...',
                    'progress': 90,
                    'stage': 'saving'
                }
            )
            
            # Add execution metadata
            result['execution_time'] = execution_time
            result['executed_at'] = end_time.isoformat()
            result['executed_by_user_id'] = executed_by_user_id
            result['task_id'] = task_id
            
            print(f"✅ [Celery] Behavior execution completed successfully")
            print(f"   Task ID: {task_id}")
            print(f"   Success: {result.get('success', False)}")
            print(f"   Execution time: {execution_time}")
            
            # Proactively notify backend API to refresh variables for this page deployment
            try:
                import requests
                api_base = os.getenv("API_BASE_URL", "http://localhost:8000")
                refresh_url = f"{api_base}/api/deploy/{deployment_id}/refresh-variables"
                print(f"🔄 [Celery] Triggering variable refresh: {refresh_url}")
                requests.post(refresh_url, timeout=3)
            except Exception as refresh_exc:
                print(f"⚠️ [Celery] Variable refresh call failed: {refresh_exc}")
            
            return {
                'status': 'SUCCESS',
                'result': result,
                'progress': 100,
                'stage': 'completed'
            }
            
    except Exception as exc:
        error_msg = str(exc)
        error_traceback = traceback.format_exc()
        
        print(f"❌ [Celery] Behavior execution failed for task {task_id}")
        print(f"   Error: {error_msg}")
        print(f"   Traceback: {error_traceback}")
        
        # Update task state to FAILURE with detailed error info
        self.update_state(
            state='FAILURE',
            meta={
                'status': f'Execution failed: {error_msg}',
                'error': error_msg,
                'traceback': error_traceback,
                'progress': 0,
                'stage': 'failed'
            }
        )
        
        # Re-raise the exception so Celery marks the task as failed
        raise exc


@celery_app.task(name="check_task_status")
def check_task_status(task_id: str):
    """
    Check the status of a Celery task.
    
    Args:
        task_id: The Celery task ID
        
    Returns:
        Dict with task status information
    """
    try:
        from celery.result import AsyncResult
        
        result = AsyncResult(task_id, app=celery_app)
        
        if result.state == 'PENDING':
            response = {
                'state': result.state,
                'status': 'Task is waiting to be processed...',
                'progress': 0,
                'stage': 'pending'
            }
        elif result.state == 'PROGRESS':
            response = {
                'state': result.state,
                'status': result.info.get('status', 'Processing...'),
                'progress': result.info.get('progress', 0),
                'stage': result.info.get('stage', 'processing')
            }
        elif result.state == 'SUCCESS':
            response = {
                'state': result.state,
                'status': 'Task completed successfully',
                'result': result.result,
                'progress': 100,
                'stage': 'completed'
            }
        elif result.state == 'FAILURE':
            response = {
                'state': result.state,
                'status': f"Task failed: {str(result.info)}",
                'error': str(result.info),
                'progress': 0,
                'stage': 'failed'
            }
        else:
            response = {
                'state': result.state,
                'status': f'Unknown state: {result.state}',
                'progress': 0,
                'stage': 'unknown'
            }
        
        return response
        
    except Exception as exc:
        return {
            'state': 'FAILURE',
            'status': f'Error checking task status: {str(exc)}',
            'error': str(exc),
            'progress': 0,
            'stage': 'error'
        } 
@celery_app.task(name="process_document_uploads", bind=True)
def process_document_uploads_task(self, *, workflow_id: int, user_id: int, files: list[dict[str, str]]):
        """
        Process document uploads asynchronously:
        - Load staged temp files
        - Split into chunks
        - Embed and upsert to Qdrant (per-user collection for the workflow)
        - Persist Document rows and store original files on disk

        Args:
            workflow_id: Target workflow id
            user_id: Uploading user id
            files: List of { temp_path, filename, content_type }
        Returns:
            Dict mirroring the previous synchronous response
        """
        task_id = self.request.id
        self.update_state(state='PROGRESS', meta={'status': 'Initializing...', 'progress': 5, 'stage': 'init'})

        try:
            with Session(engine) as db:
                # Validate workflow
                workflow = db.get(Workflow, workflow_id)
                if not workflow or not workflow.is_active:
                    raise Exception("Workflow not found or inactive")

                processed_files = []
                all_chunks = []

                # Helpers
                def load_document(file_path: Path):
                    if file_path.suffix.lower() == ".pdf":
                        return PyPDFLoader(str(file_path)).load()
                    if file_path.suffix.lower() in {".docx", ".doc"}:
                        return Docx2txtLoader(str(file_path)).load()
                    raise Exception(f"Unsupported file type: {file_path.suffix}")

                chunk_settings = config.get("document_processing", {}).get("chunk_settings", {})
                splitter = RecursiveCharacterTextSplitter(
                    chunk_size=chunk_settings.get("chunk_size", 800),
                    chunk_overlap=chunk_settings.get("chunk_overlap", 100),
                    add_start_index=chunk_settings.get("add_start_index", True),
                )

                # Stage: read and chunk
                for f in files:
                    temp_path = Path(f["temp_path"])  # must exist on worker host
                    filename = f.get("filename") or temp_path.name

                    if not temp_path.exists():
                        raise Exception(f"Temp file missing: {temp_path}")

                    docs = load_document(temp_path)
                    if not docs:
                        # Skip empty docs
                        continue

                    chunks = splitter.split_documents(docs)
                    upload_id = str(uuid.uuid4())

                    for c in chunks:
                        c.metadata.update({
                            'user_id': user_id,
                            'filename': filename,
                            'source': filename,
                            'upload_id': upload_id,
                        })

                    # Keep track for later persistence
                    file_size = temp_path.stat().st_size
                    file_type = Path(filename).suffix.lower().lstrip('.')
                    processed_files.append({
                        'filename': filename,
                        'upload_id': upload_id,
                        'chunks': len(chunks),
                        'size': file_size,
                        'file_type': file_type,
                        'temp_path': str(temp_path),
                    })
                    all_chunks.extend(chunks)

                if not all_chunks:
                    raise Exception("No content could be extracted from uploaded files")

                self.update_state(state='PROGRESS', meta={'status': 'Embedding and indexing...', 'progress': 50, 'stage': 'indexing'})

                # Embeddings + vector store
                embeddings = FastEmbedEmbeddings()
                user_collection = get_user_collection_name(workflow.workflow_collection_id, user_id)

                Qdrant.from_documents(
                    documents=all_chunks,
                    embedding=embeddings,
                    url=config.get("qdrant", {}).get("url", "http://localhost:6333"),
                    prefer_grpc=config.get("qdrant", {}).get("prefer_grpc", False),
                    collection_name=user_collection,
                    ids=[str(uuid.uuid4()) for _ in all_chunks],
                )

                self.update_state(state='PROGRESS', meta={'status': 'Saving metadata...', 'progress': 80, 'stage': 'persistence'})

                # Persist Document rows and store files
                response_files = []
                for info in processed_files:
                    storage_path = None
                    try:
                        # Read file bytes for permanent storage
                        with open(info['temp_path'], 'rb') as fh:
                            content_bytes = fh.read()
                        storage_path = store_file(
                            file_content=content_bytes,
                            workflow_id=workflow.id,
                            upload_id=info['upload_id'],
                            filename=info['filename'],
                        )
                    except Exception as storage_error:
                        print(f"Warning: Failed to store file {info['filename']}: {storage_error}")

                    doc = Document(
                        filename=info['filename'],
                        original_filename=info['filename'],
                        file_size=info['size'],
                        file_type=info['file_type'],
                        collection_name=workflow.workflow_collection_id,
                        user_collection_name=user_collection,
                        upload_id=info['upload_id'],
                        chunk_count=info['chunks'],
                        storage_path=storage_path,
                        uploaded_by_id=user_id,
                        workflow_id=workflow.id,
                    )
                    db.add(doc)
                    response_files.append({
                        'filename': info['filename'],
                        'upload_id': info['upload_id'],
                        'chunks': info['chunks'],
                        'size': info['size'],
                        'file_type': info['file_type'],
                        'storage_path': storage_path,
                    })

                db.commit()

                result = {
                    'message': 'Documents uploaded and ingested successfully',
                    'workflow_id': workflow.id,
                    'workflow_name': workflow.name,
                    'collection_name': user_collection,
                    'total_chunks': len(all_chunks),
                    'files_processed': response_files,
                }

                self.update_state(state='PROGRESS', meta={'status': 'Completed', 'progress': 100, 'stage': 'completed'})
                return {
                    'status': 'SUCCESS',
                    'result': result,
                    'progress': 100,
                    'stage': 'completed',
                }

        except Exception as exc:
            error_msg = str(exc)
            error_traceback = traceback.format_exc()
            self.update_state(state='FAILURE', meta={'status': f'Upload failed: {error_msg}', 'error': error_msg, 'traceback': error_traceback, 'progress': 0, 'stage': 'failed'})
            raise
        finally:
            # Always attempt to cleanup temp files in configured temp dir
            try:
                for f in files or []:
                    p = Path(f.get('temp_path', ''))
                    if p.exists():
                        try:
                            p.unlink()
                        except OSError:
                            pass
            except Exception:
                pass


@celery_app.task(name="process_prompt_pdf_submission", bind=True)
def process_prompt_pdf_submission_task(self, *, deployment_id: str, submission_index: int, user_id: int, temp_path: str, filename: str):
    self.update_state(state='PROGRESS', meta={'status': 'Initializing...', 'progress': 5, 'stage': 'init'})
    try:
        tp = Path(temp_path)
        if not tp.exists():
            raise Exception(f"Temp file missing: {temp_path}")

        with Session(engine) as db:
            # Validate deployment
            db_dep = db.exec(select(Deployment).where(Deployment.deployment_id == deployment_id)).first()
            if not db_dep:
                raise Exception("Deployment not found")

            # Get workflow
            workflow = db.get(Workflow, db_dep.workflow_id)
            if not workflow:
                raise Exception("Workflow not found")

            # Find active prompt session for user
            session = db.exec(
                select(PromptSession).where(
                    PromptSession.user_id == user_id,
                    PromptSession.deployment_id == db_dep.id,
                    PromptSession.is_active == True,
                )
            ).first()
            if not session:
                raise Exception("No active prompt session found")
            if session.completed_at:
                raise Exception("Prompt session is already completed")

            # Validate index
            if submission_index < 0 or submission_index >= len(session.submission_requirements):
                raise Exception("Invalid submission index")
            requirement = session.submission_requirements[submission_index]
            if requirement.get("mediaType") != "pdf":
                raise Exception("This submission does not accept a PDF file")

            # Prevent duplicate submission
            existing = db.exec(
                select(PromptSubmission).where(
                    PromptSubmission.session_id == session.id,
                    PromptSubmission.submission_index == submission_index,
                )
            ).first()
            if existing:
                raise Exception("Response already submitted for this requirement")

            self.update_state(state='PROGRESS', meta={'status': 'Storing file...', 'progress': 25, 'stage': 'store'})

            # Read file bytes and persist to storage
            file_bytes = tp.read_bytes()
            upload_id = str(uuid.uuid4())
            try:
                storage_path = store_file(
                    file_content=file_bytes,
                    workflow_id=workflow.id,
                    upload_id=upload_id,
                    filename=filename,
                )
            except Exception as e:
                raise Exception(f"Failed to store PDF: {e}")

            self.update_state(state='PROGRESS', meta={'status': 'Embedding (best-effort)...', 'progress': 55, 'stage': 'embedding'})

            # Try to split/embed
            chunks = []
            try:
                docs = PyPDFLoader(str(tp)).load()
                if docs:
                    chunk_settings = config.get("document_processing", {}).get("chunk_settings", {})
                    splitter = RecursiveCharacterTextSplitter(
                        chunk_size=chunk_settings.get("chunk_size", 800),
                        chunk_overlap=chunk_settings.get("chunk_overlap", 100),
                        add_start_index=chunk_settings.get("add_start_index", True),
                    )
                    chunks = splitter.split_documents(docs)
                    for c in chunks:
                        c.metadata.update({
                            'user_id': user_id,
                            'filename': filename,
                            'source': filename,
                            'upload_id': upload_id,
                        })
            except Exception:
                chunks = []

            chunk_count = 0
            try:
                if chunks:
                    embeddings = FastEmbedEmbeddings()
                    user_collection = get_user_collection_name(workflow.workflow_collection_id, user_id)
                    Qdrant.from_documents(
                        documents=chunks,
                        embedding=embeddings,
                        url=config.get("qdrant", {}).get("url", "http://localhost:6333"),
                        prefer_grpc=config.get("qdrant", {}).get("prefer_grpc", False),
                        collection_name=user_collection,
                        ids=[str(uuid.uuid4()) for _ in chunks],
                    )
                    chunk_count = len(chunks)
            except Exception:
                pass

            # Snippets (optional)
            snippet_texts: list[str] = []
            try:
                for d in (chunks or [])[:5]:
                    content = getattr(d, 'page_content', '')
                    if content:
                        snippet_texts.append(content.strip()[:400])
            except Exception:
                snippet_texts = []

            # Create Document
            document = Document(
                filename=filename,
                original_filename=filename,
                file_size=len(file_bytes),
                file_type="pdf",
                collection_name=workflow.workflow_collection_id,
                user_collection_name=get_user_collection_name(workflow.workflow_collection_id, user_id),
                upload_id=upload_id,
                chunk_count=chunk_count,
                storage_path=storage_path,
                uploaded_by_id=user_id,
                workflow_id=workflow.id,
                doc_metadata={"snippets": snippet_texts} if snippet_texts else None,
            )
            db.add(document)
            db.flush()

            # Create PromptSubmission
            submission = PromptSubmission(
                session_id=session.id,
                submission_index=submission_index,
                prompt_text=requirement.get("prompt", ""),
                media_type="pdf",
                user_response=str(document.id),
            )
            db.add(submission)
            db.flush()

            # Mark completed if all provided
            total = len(session.submission_requirements)
            current = db.exec(select(PromptSubmission).where(PromptSubmission.session_id == session.id)).all()
            if len(current) == total:
                session.completed_at = datetime.now()
                db.add(session)

            db.commit()
            db.refresh(submission)

            self.update_state(state='PROGRESS', meta={'status': 'Completed', 'progress': 100, 'stage': 'completed'})
            return {
                'status': 'SUCCESS',
                'result': {
                    'submission_index': submission.submission_index,
                    'prompt_text': submission.prompt_text,
                    'media_type': submission.media_type,
                    'user_response': submission.user_response,
                    'submitted_at': submission.submitted_at.isoformat(),
                    'is_valid': True,
                    'validation_error': None,
                },
                'progress': 100,
                'stage': 'completed',
            }
    except Exception as exc:
        error_msg = str(exc)
        error_traceback = traceback.format_exc()
        self.update_state(state='FAILURE', meta={'status': f'Prompt PDF failed: {error_msg}', 'error': error_msg, 'traceback': error_traceback, 'progress': 0, 'stage': 'failed'})
        raise
    finally:
        try:
            p = Path(temp_path)
            if p.exists():
                p.unlink()
        except Exception:
            pass
