# Roomcast Summary Matching Feature

## Overview

This feature allows roomcast devices to submit a summary of their group's website submissions and receive an AI-powered analysis that identifies which submission best matches their summary.

## How It Works

### 1. **User Journey**

1. **Navigate Submissions**: Roomcast displays group submissions one at a time with left/right navigation
2. **Finish Button**: When at the last submission, a "Finish" button appears
3. **Summary Form**: Clicking "Finish" shows a form with 4 fields:
   - **General Category**: What category do the submissions fall under?
   - **Purpose Summary**: Common purpose across all submissions
   - **Platform Summary**: Platform types used
   - **Strategy**: How to help people detect/avoid these items
4. **Submit & Match**: Clicking "Submit & Find Match" triggers AI analysis
5. **Results Display**: Shows the best matching submission with:
   - Student name and submission details
   - Confidence score (0-100%)
   - AI reasoning explaining why it's the best match
   - Scores for all submissions

### 2. **Technical Flow**

```
┌─────────────┐
│  Roomcast   │
│   Device    │
└──────┬──────┘
       │ 1. User fills summary form
       │ 2. Clicks "Submit & Find Match"
       ▼
┌─────────────────────────────────────┐
│  WebSocket: submit_summary message  │
│  {                                  │
│    type: "submit_summary",          │
│    summary_data: {                  │
│      category: "...",               │
│      purpose: "...",                │
│      platform: "...",               │
│      strategy: "..."                │
│    }                                │
│  }                                  │
└──────┬──────────────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│  Backend Handler             │
│  handle_summary_submission() │
│  - Extracts group submissions│
│  - Starts Celery task        │
└──────┬───────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│  Celery Task                        │
│  match_submission_to_summary_task() │
│  - Calls GPT-4o for analysis       │
│  - Compares summary to submissions  │
│  - Returns best match + scores      │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  WebSocket: Results sent back   │
│  {                              │
│    type: "summary_match_result",│
│    best_match: {...},           │
│    similarity_score: 0.85,      │
│    reasoning: "...",            │
│    all_scores: {...}            │
│  }                              │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────┐
│  Roomcast   │
│  Displays   │
│   Result    │
└─────────────┘
```

### 3. **Backend Components**

#### `live_presentation.py`

**New Method: `handle_summary_submission()`**
- Extracts website submissions from group_submission_responses
- Validates submission data
- Triggers Celery task for AI matching
- Polls for task completion
- Sends results back via WebSocket

**Updated Method: `handle_roomcast_message()`**
- Added handler for "submit_summary" message type
- Validates roomcast is registered to a group
- Routes to `handle_summary_submission()`

#### `submission_matcher.py`

Already created - contains the core AI matching logic:
- `SubmissionMatcher` class with GPT-4o integration
- `match_summary_to_submission()` async function
- Three matching strategies (comprehensive, purpose-focused, platform-focused)

#### `celery_tasks.py`

**New Task: `match_submission_to_summary_task()`**
- Async Celery task wrapper
- Progress tracking (PENDING → PROGRESS → SUCCESS/FAILURE)
- 30-second timeout for AI analysis
- Error handling and fallback

### 4. **Frontend Components**

#### `RoomcastInterface.tsx`

**New State Variables:**
```typescript
const [matchingInProgress, setMatchingInProgress] = useState(false);
const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
```

**New WebSocket Handlers:**
- `summary_match_processing`: Shows loading state
- `summary_match_result`: Displays matching results
- `summary_match_error`: Shows error messages

**New Function: `handleSummarySubmit()`**
- Sends summary data via WebSocket
- Sets loading state
- Waits for backend response

**Updated UI:**
- Submit button shows loading spinner during analysis
- Match result displayed with:
  - Green success banner
  - Best match details (student, website info)
  - Confidence score badge
  - AI reasoning explanation
  - Progress bars for all scores

## Usage Example

### Student Submissions (Input)
```javascript
[
  {
    student_name: "Alice",
    url: "https://naturalnews.example.com",
    name: "Natural News",
    purpose: "Promotes alternative health remedies",
    platform: "Independent health blog"
  },
  {
    student_name: "Bob",
    url: "https://mercola.example.com",
    name: "Dr. Mercola",
    purpose: "Sells supplements and spreads anti-vaccine info",
    platform: "Health e-commerce site"
  }
]
```

### Summary Form (Input)
```javascript
{
  category: "Health Misinformation Sites",
  purpose: "Sites spreading false health claims without evidence",
  platform: "Independent blogs and alternative news sites",
  strategy: "Teach source verification and scientific literacy"
}
```

### AI Analysis (Output)
```javascript
{
  best_match_student: "Bob",
  best_match_submission: {
    student_name: "Bob",
    url: "https://mercola.example.com",
    name: "Dr. Mercola",
    purpose: "Sells supplements and spreads anti-vaccine info",
    platform: "Health e-commerce site"
  },
  similarity_score: 0.92,
  reasoning: "Dr. Mercola's site exemplifies health misinformation through its combination of selling supplements and spreading anti-vaccine information without scientific backing. This closely matches the summary's focus on sites spreading false health claims, making it the most representative example.",
  all_scores: {
    "Bob": 0.92,
    "Alice": 0.78
  }
}
```

## Configuration

### Environment Variables
```bash
# Required for AI matching
OPENAI_API_KEY=your_openai_api_key

# Optional Celery configuration
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

### Model Settings
The system uses GPT-4o by default with:
- **Temperature**: 0.3 (deterministic matching)
- **Max Tokens**: 2000
- **Timeout**: 30 seconds

## Error Handling

### Common Errors

1. **No Submissions Found**
```
Error: No website submissions found to match against
```
**Cause**: Group has no valid website data submissions
**Solution**: Ensure students have submitted website data in JSON format

2. **Analysis Timeout**
```
Error: Analysis timed out
```
**Cause**: AI analysis took longer than 30 seconds
**Solution**: Retry submission or check API status

3. **Invalid Summary Data**
```
Error: summary_data required
```
**Cause**: One or more form fields are empty
**Solution**: Fill in all 4 fields before submitting

### Frontend Error Display
Errors are shown via browser `alert()` dialog with user-friendly messages.

## Future Enhancements

Possible improvements:
- [ ] Save matching results to database
- [ ] Allow instructor to review all group matches
- [ ] Export matching results as PDF/CSV
- [ ] Support for multiple summary attempts
- [ ] Historical comparison of match accuracy
- [ ] Custom matching strategies per deployment
- [ ] Visual diff highlighting between summary and match

## Testing

### Manual Test Flow
1. Start a live presentation with group submissions
2. Navigate to roomcast interface with join code
3. Select a group with website submissions
4. Navigate through all submissions using left/right arrows
5. Click "Finish" button at the last submission
6. Fill in all 4 summary fields
7. Click "Submit & Find Match"
8. Verify loading spinner appears
9. Verify match result displays with correct data
10. Check console for debug logs

### Backend Test
```bash
cd backend
source ../.venv/bin/activate
python test_submission_matcher.py
```

### Check Celery Worker
```bash
cd backend
celery -A services.celery_tasks.celery_app worker --loglevel=info
```

Watch for:
- Task received: `match_submission_to_summary_task`
- AI analysis progress logs
- Task completion status

## Debugging

### Enable Debug Logging

**Frontend:**
```typescript
const debug = (...args: unknown[]) => console.log('[Roomcast]', ...args);
```
Check browser console for `[Roomcast]` prefixed messages

**Backend:**
```python
print(f"📊 Processing summary submission from {student.user_name}")
print(f"🔍 Found {len(website_submissions)} website submissions")
print(f"✅ Sent match result to roomcast")
```
Check server console for emoji-prefixed messages

### Common Debug Points
1. WebSocket message flow (`submit_summary` → `summary_match_result`)
2. Submission extraction from `group_submission_responses`
3. Celery task status polling
4. AI analysis response parsing
5. Result broadcasting to roomcast

## Performance

- **Average matching time**: 3-5 seconds
- **Maximum timeout**: 30 seconds
- **Concurrent requests**: Handled via Celery queue
- **Cost per match**: ~$0.001-$0.005 (GPT-4o API)

## Security Considerations

- Roomcast connections are authenticated via join code
- Summary data is not permanently stored (ephemeral)
- AI analysis happens server-side (no API keys exposed)
- Results are only broadcast to the specific group's roomcast
