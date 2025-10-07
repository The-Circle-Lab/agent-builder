# Deployment Configuration Edit Feature

## Overview
Added a feature that allows instructors to edit deployment configurations after they have been created. This enables instructors to make changes to deployment settings without having to recreate the entire deployment.

## Changes Made

### Backend Changes

#### 1. New Request Model (`backend/models/object_types.py`)
- Added `DeploymentUpdateConfigRequest` class to handle configuration update requests
- Contains a `config` field that accepts a dictionary of the new configuration

#### 2. New API Endpoints (`backend/api/deployments/deployment_core_routes.py`)

##### GET `/api/deploy/{deployment_id}/config`
- Retrieves the current deployment configuration
- Requires instructor permissions
- Returns:
  - `deployment_id`: The deployment ID
  - `config`: Current configuration JSON
  - `workflow_id`: Associated workflow ID
  - `type`: Deployment type
  - `is_page_based`: Whether it's a page-based deployment

##### PUT `/api/deploy/{deployment_id}/config`
- Updates the deployment configuration
- Requires instructor permissions
- Request body: `{ "config": { ... } }`
- Validates that config is a valid JSON object
- Automatically reloads the deployment in memory with new configuration
- Handles both page-based and regular deployments
- Returns success message with deployment ID

#### 3. Updated Exports (`backend/api/deployments/deployment_shared.py`)
- Added `DeploymentUpdateConfigRequest` to the shared exports for use across deployment routes

### Frontend Changes

#### 1. State Management (`frontend/src/app/components/deployments/page/PageDeploymentAdmin.tsx`)
Added new state variables:
- `isConfigModalOpen`: Controls modal visibility
- `deploymentConfig`: Stores the current deployment configuration
- `configInput`: Controlled input for the JSON editor
- `savingConfig`: Loading state during save operation
- `configError`: Error messages for validation or save failures

#### 2. New Functions
- `fetchConfig()`: Fetches the current configuration from the backend
- `openConfigModal()`: Opens the modal and fetches the current config
- `closeConfigModal()`: Closes the modal and resets state
- `handleSaveConfig()`: Validates and saves the configuration
  - Validates JSON syntax
  - Sends PUT request to backend
  - Handles success/error states
  - Reloads the page on success to reflect changes

#### 3. UI Components

##### Edit Config Button
- Added a settings/cog icon button next to the "Rename" button in the header
- Provides quick access to configuration editing
- Tooltip: "Edit configuration"

##### Configuration Edit Modal
- Full-screen modal with JSON editor
- Features:
  - Large textarea (400px height) with monospace font for JSON editing
  - Warning banner about deployment reload
  - Real-time validation feedback
  - Cancel and Save buttons
  - Disabled state during save operation
  - Error display for validation or save failures

## How to Use

### For Instructors:

1. **Access the Feature**
   - Navigate to any deployment's admin dashboard
   - Click the gear/cog icon next to the deployment name in the header

2. **Edit Configuration**
   - The modal will open with the current configuration as formatted JSON
   - Edit the JSON directly in the textarea
   - The editor validates JSON syntax before saving

3. **Save Changes**
   - Click "Save Configuration" to apply changes
   - The system will:
     - Validate the JSON format
     - Update the database
     - Reload the deployment with new settings
     - Refresh the page to show updated configuration

4. **Important Notes**
   - Changes will reload the deployment, so avoid editing during active student sessions
   - Invalid JSON will show an error message and prevent saving
   - The configuration must be valid according to the deployment type

## Technical Details

### Configuration Reload Process

When a configuration is updated:

1. **Database Update**: The new config is saved to the database
2. **Memory Cleanup**: Active deployment is removed from memory
3. **Reload**: Deployment is reloaded with new configuration
4. **Page Refresh**: Frontend refreshes to show updated state

### Page-Based Deployments
- For page-based deployments (main deployments with multiple pages)
- The system uses `remove_active_page_deployment()` and `load_page_deployment_on_demand()`
- All page instances are reloaded with the new configuration

### Regular Deployments
- Uses `remove_active_deployment()` and `load_deployment_on_demand()`
- Single deployment instance is reloaded

## Security

- Only instructors can access the config endpoints
- Requires authentication and proper class membership
- Validates permissions before allowing configuration changes
- JSON validation prevents malformed configurations

## Future Enhancements

Potential improvements:
- Add a visual configuration editor (form-based) instead of raw JSON
- Implement configuration versioning/history
- Add configuration validation against schema
- Show a diff view of changes before saving
- Add ability to export/import configurations
- Implement hot-reload without page refresh
- Add warning if students are currently active in the deployment

## Testing

To test the feature:

1. Create a deployment
2. Access the admin dashboard
3. Click the gear icon to open the config editor
4. Make a change to the configuration JSON
5. Save and verify the deployment reloads correctly
6. Check that the changes are persisted in the database
7. Verify that only instructors can access this feature
