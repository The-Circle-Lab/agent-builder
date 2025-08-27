import os
from celery import Celery
from database.database import get_session, engine
from sqlmodel import Session
from services.summary_agent import SummaryAgent
from typing import Dict, Any, Optional
import traceback
from datetime import datetime

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
