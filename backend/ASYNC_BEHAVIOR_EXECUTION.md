# Async Behavior Execution

This document explains the new asynchronous execution system for heavy behaviors (group assignment and theme creation) that prevents the application from blocking during long-running operations.

## Overview

Previously, group assignment and theme creation behaviors ran synchronously, blocking the entire application and preventing other operations. The new system uses Celery for asynchronous task processing, allowing:

- Non-blocking behavior execution
- Real-time progress tracking
- Task cancellation
- Better error handling
- Improved user experience

## API Endpoints

### 1. Trigger Behavior Execution

**POST** `/api/page-deployments/{deployment_id}/behaviors/trigger`

**Request Body:**
```json
{
  "behavior_number": "1",
  "async_execution": true  // Optional, defaults to true for heavy behaviors
}
```

**Response (Async):**
```json
{
  "behavior_number": "1",
  "task_id": "celery-task-uuid",
  "status": "PENDING",
  "message": "Behavior execution started. Use task ID to check progress."
}
```

**Response (Sync):**
```json
{
  "behavior_number": "1",
  "success": true,
  "execution_time": "0:02:15.123456",
  "groups": {...},
  "explanations": {...},
  "metadata": {...}
}
```

### 2. Check Task Status

**GET** `/api/page-deployments/{deployment_id}/behaviors/tasks/{task_id}`

**Response:**
```json
{
  "task_id": "celery-task-uuid",
  "state": "PROGRESS",
  "status": "Executing behavior...",
  "progress": 45,
  "stage": "execution",
  "result": null,
  "error": null
}
```

### 3. Cancel Task

**POST** `/api/page-deployments/{deployment_id}/behaviors/tasks/{task_id}/cancel`

**Response:**
```json
{
  "message": "Task celery-task-uuid has been cancelled",
  "task_id": "celery-task-uuid",
  "cancelled": true
}
```

## Task States

- **PENDING**: Task is waiting to be processed
- **PROGRESS**: Task is currently running
- **SUCCESS**: Task completed successfully
- **FAILURE**: Task failed with error

## Heavy Behaviors

The following behaviors automatically use async execution by default:
- `group_assignment`
- `theme_creator`

Other behaviors can still be run asynchronously by setting `async_execution: true`.

## Configuration

### Celery Settings

Configure in environment variables:
```bash
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

### Task Limits

- **Soft Time Limit**: 5 minutes
- **Hard Time Limit**: 10 minutes
- **Worker Prefetch**: 1 (for heavy operations)

## Memory Optimizations

The behavior classes have been optimized for async execution:

1. **Progressive Memory Cleanup**: Large objects are deleted as soon as they're no longer needed
2. **Enhanced Error Handling**: Graceful degradation with fallback options
3. **Improved Logging**: Better error reporting for debugging async issues

## Frontend Integration

### Polling Pattern

```javascript
// Start async behavior
const response = await fetch('/api/page-deployments/{id}/behaviors/trigger', {
  method: 'POST',
  body: JSON.stringify({
    behavior_number: '1',
    async_execution: true
  })
});

const { task_id } = await response.json();

// Poll for status
const pollStatus = async () => {
  const statusResponse = await fetch(`/api/page-deployments/{id}/behaviors/tasks/${task_id}`);
  const status = await statusResponse.json();
  
  if (status.state === 'SUCCESS') {
    // Handle completion
    console.log('Behavior completed:', status.result);
  } else if (status.state === 'FAILURE') {
    // Handle error
    console.error('Behavior failed:', status.error);
  } else {
    // Continue polling
    setTimeout(pollStatus, 2000);
  }
};

pollStatus();
```

## Benefits

1. **Non-blocking**: Application remains responsive during behavior execution
2. **Progress Tracking**: Real-time updates on execution progress
3. **Better UX**: Users can continue working while behaviors run in background
4. **Error Recovery**: Enhanced error handling and reporting
5. **Scalability**: Behaviors can run on separate worker processes
6. **Cancellation**: Long-running tasks can be cancelled if needed

## Monitoring

Tasks can be monitored through:
- Task status API endpoints
- Celery monitoring tools (Flower, etc.)
- Application logs with enhanced async debugging info

## Backward Compatibility

- Synchronous execution is still supported by setting `async_execution: false`
- Existing API contracts remain unchanged for sync responses
- Legacy frontend code continues to work without modification

