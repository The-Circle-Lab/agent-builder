# Group Submission Navigation Implementation Guide

## Overview
This document tracks the implementation of a new live presentation prompt type that allows students to navigate through and edit group member submissions during live presentations.

## Implementation Status

### ✅ Completed

#### 1. Frontend Node Configuration
- **File**: `livePresentationPromptNodeConfig.ts` - No changes needed, uses existing infrastructure
- **File**: `settingsMenu.tsx`
  - Added `enableGroupSubmissionNavigation` checkbox
  - Added `submissionPromptId` selector (needs population logic)
  - Added `allowEditing` checkbox
  - Updated `updatePrompt` function to handle new fields
  - Added visual feedback and help text

#### 2. TypeScript Type Definitions
- **File**: `livePresentation.ts`
  - Extended `LivePresentationPrompt` interface with:
    - `enableGroupSubmissionNavigation?: boolean`
    - `submissionPromptId?: string`
    - `allowEditing?: boolean`
    - `currentSubmissionIndex?: number`
    - `totalSubmissions?: number`
    - `currentStudentName?: string`

#### 3. Backend Database Models
- **File**: `live_presentation_models.py`
  - Added navigation fields to `LivePresentationPrompt` model
  - Added `navigation_state` JSON field to `LivePresentationSession` model

#### 4. Backend Service Functions
- **File**: `live_presentation_navigation.py` (NEW)
  - Created standalone module with all navigation functions:
    - `send_navigation_prompt_to_students()` - Initialize navigation session
    - `_prepare_navigation_data_by_group()` - Fetch submissions by group
    - `_fetch_student_submission()` - Get individual submissions
    - `_parse_submission_response()` - Parse websiteInfo and other types
    - `handle_navigation_action()` - Handle next/previous/goto
    - `handle_submission_edit()` - Handle edits with validation
    - `_broadcast_navigation_update_to_group()` - Sync group members
    - `_broadcast_submission_update_to_group()` - Broadcast edits
    - `_broadcast_navigation_to_roomcast()` - Send to displays
    - `_broadcast_navigation_update_to_roomcast_group()` - Update displays
    - `_broadcast_submission_update_to_roomcast_group()` - Edit updates to displays
    - `_save_submission_edit_to_database()` - Persist changes

- **File**: `live_presentation.py`
  - Added `navigation_state` initialization in `__init__()`

### 🚧 Remaining Tasks

#### 4. WebSocket Route Integration (NOT STARTED)
- **File**: `deployment_live_presentation_routes.py`
  - [ ] Import navigation functions from `live_presentation_navigation.py`
  - [ ] Add message handlers in `websocket_student_endpoint`:
    - `navigate_next` - Move to next submission
    - `navigate_previous` - Move to previous submission  
    - `navigate_to` - Jump to specific index
    - `edit_submission` - Handle submission edits
  - [ ] Add message handlers in `websocket_teacher_endpoint`:
    - Handle teacher-initiated navigation if needed
  - [ ] Add message handlers in `websocket_roomcast_endpoint`:
    - Receive and display navigation updates

#### 5. Roomcast UI (NOT STARTED)
- **File**: `RoomcastInterface.tsx`
  - [ ] Add websiteInfo submission display component
  - [ ] Add navigation controls (prev/next buttons, counter)
  - [ ] Handle WebSocket messages:
    - `roomcast_navigation_prompt` - Initialize display
    - `roomcast_navigation_update` - Update current view
    - `roomcast_submission_updated` - Reflect edits
  - [ ] Display current submission with proper formatting:
    - URL as clickable link
    - Name, Purpose, Platform fields
    - Current index indicator (e.g., "2 of 5")

#### 6. Student UI (NOT STARTED)
- **File**: `livePresentationInterface.tsx` or new component
  - [ ] Create `NavigationPromptDisplay.tsx` component
  - [ ] Add navigation controls (prev/next buttons)
  - [ ] Add edit mode toggle (if `allowEditing` is true)
  - [ ] Display websiteInfo fields:
    - URL input with validation
    - Name text input
    - Purpose textarea
    - Platform textarea
  - [ ] Handle WebSocket messages:
    - `send_prompt` with navigation data
    - `navigation_update` - Sync navigation
    - `submission_updated` - Reflect edits from others
  - [ ] Send WebSocket messages:
    - `navigate_next/previous/to` - Navigation actions
    - `edit_submission` - Submit edits
  - [ ] Add optimistic updates for smooth UX

## Integration Points

### Backend Flow
```
1. Teacher sends navigation prompt via WebSocket
2. LivePresentationDeployment.send_navigation_prompt_to_students()
3. Fetch submissions from database for each group
4. Send to students and roomcast with group-specific data
5. Student navigates → WebSocket message → handle_navigation_action()
6. Broadcast update to group members and roomcast
7. Student edits → WebSocket message → handle_submission_edit()
8. Update navigation data, broadcast, save to database
```

### Frontend Flow  
```
1. Student receives navigation prompt via WebSocket
2. Render NavigationPromptDisplay with submissions array
3. User clicks next/prev → Send navigation message
4. Receive navigation_update → Update local state
5. User edits field → Send edit_submission message
6. Receive submission_updated → Update display
7. Roomcast receives same updates → Mirror student view
```

## WebSocket Message Types

### Teacher → Server
- `send_prompt` with `enableGroupSubmissionNavigation: true`

### Server → Student
- `send_prompt` - Initial navigation prompt with submissions
- `navigation_update` - New current submission
- `submission_updated` - Edit from another student

### Student → Server
- `navigate_next` - Move forward
- `navigate_previous` - Move backward
- `navigate_to` - Jump to index
- `edit_submission` - Submit edited data

### Server → Roomcast
- `roomcast_navigation_prompt` - Initial setup
- `roomcast_navigation_update` - Navigation change
- `roomcast_submission_updated` - Edit update

## Database Schema Updates Needed

Run migration to add new columns:
```sql
ALTER TABLE livepresentationsession ADD COLUMN navigation_state JSON;
ALTER TABLE livepresentationprompt ADD COLUMN enable_group_submission_navigation BOOLEAN DEFAULT FALSE;
ALTER TABLE livepresentationprompt ADD COLUMN submission_prompt_id VARCHAR;
ALTER TABLE livepresentationprompt ADD COLUMN allow_editing BOOLEAN DEFAULT FALSE;
ALTER TABLE livepresentationprompt ADD COLUMN current_submission_index INTEGER DEFAULT 0;
ALTER TABLE livepresentationprompt ADD COLUMN total_submissions INTEGER DEFAULT 0;
ALTER TABLE livepresentationprompt ADD COLUMN current_student_name VARCHAR;
```

## Testing Checklist

- [ ] Can create navigation prompt in node editor
- [ ] Navigation prompt appears in live presentation
- [ ] Students can navigate through submissions
- [ ] Navigation syncs across all group members
- [ ] Navigation syncs to roomcast display
- [ ] Edits are reflected in real-time
- [ ] Edits persist to database
- [ ] WebsiteInfo fields display correctly
- [ ] URL validation works
- [ ] Late-joining students see current state
- [ ] Roomcast displays reconnect properly

## Next Steps

1. Complete WebSocket route integration (Task 4)
2. Implement roomcast UI (Task 5)
3. Implement student UI (Task 6)
4. Run database migration
5. End-to-end testing
6. Documentation and user guide
