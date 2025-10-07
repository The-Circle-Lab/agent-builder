# Group Assignment Config Edit Bug Fix

## Problem Description

The existing "Edit Group Assignment Properties" feature in the PageDeploymentAdmin UI was not working correctly. When instructors updated group assignment configuration (group size, grouping method, or group size mode), the changes were saved to the database but **were not being applied** when the behavior was executed.

## Root Cause Analysis

The issue was in the backend endpoint `/api/deploy/{deployment_id}/behaviors/{behavior_number}/config` in `deployment_page_routes.py`.

### The Bug Sequence

1. **Load page deployment** from memory (or database if not in memory)
   - This loads the deployment with the **OLD configuration**
2. **Update in-memory config** on the behavior handler
3. **Update database config** with new values
4. **Update in-memory config again** on the behavior handler

### The Problem

The critical flaw was that after updating the database in step 3, the code did **NOT reload** the page deployment. This meant:

- The behavior objects in memory were created from the old config during step 1
- Manual updates to the in-memory behavior (steps 2 and 4) appeared to work
- BUT when the behavior was re-executed later, the page deployment would be reloaded from the database
- The reload would create **new behavior objects** with the fresh config from the database
- However, the fix in step 4 only updated the current in-memory instance, not future instances

### Why It Failed

When behaviors are created during `PageDeployment.__init__()`, each `Behavior` creates a `BehaviorDeployment`, which creates a `GroupAssignmentBehavior` handler with config from:

```python
behavior_node_config = self.nodes["1"].get("config", {})
```

The `GroupAssignmentBehavior.__init__()` sets:
- `self.group_size` 
- `self.group_size_mode`
- `self.grouping_method`

These values are used during `execute()` and cannot be changed by updating a different instance in memory.

## The Fix

The solution is to **reload the entire page deployment** after updating the database:

```python
# 1. Update database first
db_deployment.config = full_config
db.commit()

# 2. Remove from memory
from services.pages_manager import remove_active_page_deployment
remove_active_page_deployment(deployment_id)

# 3. Reload with updated config
await load_page_deployment_on_demand(deployment_id, current_user.id, db)

# 4. Get fresh behavior instance
deployment_info = get_active_page_deployment(deployment_id)
page_deployment = deployment_info["page_deployment"]
behavior = page_deployment.get_behavior_by_number(behavior_number)
```

This ensures:
- Database is updated with new config
- Old in-memory deployment is discarded
- Fresh deployment is loaded from database with updated config
- New behavior objects are created with correct config values
- All future executions will use the updated configuration

## Files Modified

### `/Users/rivanjarjes/Projects/agent-builder-prototype/backend/api/deployments/deployment_page_routes.py`

**Function:** `update_behavior_config()`

**Changes:**
- Moved database update to happen first (before any in-memory updates)
- Added call to `remove_active_page_deployment()` to clear old deployment from memory
- Added call to `load_page_deployment_on_demand()` to reload with fresh config
- Re-fetched behavior from reloaded deployment to return correct updated config
- Added proper error handling for reload failures
- Removed redundant in-memory update attempts that weren't effective

## How It Works Now

1. **Instructor edits config** in the UI modal (group size, grouping method, etc.)
2. **Frontend sends PUT request** to `/api/deploy/{deployment_id}/behaviors/{behavior_number}/config`
3. **Backend updates database** with new config values in the workflow nodes structure
4. **Backend removes old deployment** from memory cache
5. **Backend reloads deployment** from database with updated config
6. **New behavior objects created** with correct configuration values
7. **Response returns** updated config to frontend
8. **Next execution uses** the updated configuration correctly

## Testing

To verify the fix works:

1. Create a page-based deployment with a group assignment behavior
2. Execute the behavior once with default settings (e.g., group_size=4)
3. Use the "Configure" button to change settings (e.g., group_size=6)
4. Execute the behavior again
5. Verify the new group assignments use group_size=6
6. Check that group_size_mode and grouping_method changes also work correctly

## Related Code

The fix leverages existing functionality:
- `remove_active_page_deployment()` - from `services/pages_manager.py`
- `load_page_deployment_on_demand()` - from `services/pages_manager.py`
- `get_active_page_deployment()` - from `services/pages_manager.py`

These functions handle proper cleanup and reload of page deployments with their behaviors.

## Additional Notes

- The frontend UI code in `PageDeploymentAdmin.tsx` was already correct
- The `BehaviorDeployment.update_config()` and `GroupAssignmentBehavior.update_config()` methods work correctly
- The issue was not with the update logic itself, but with **when and how** the deployment was reloaded
- This fix ensures database is always the source of truth for configuration
- The reload pattern is consistent with how config changes work elsewhere in the system (e.g., deployment config edits)
