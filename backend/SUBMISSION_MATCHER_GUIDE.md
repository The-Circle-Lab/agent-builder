# Submission Matcher - AI-Powered Summary Matching

## Overview

The **Submission Matcher** is an AI-powered tool that analyzes a batch of website submissions from students and identifies which submission best matches a summary description. This is particularly useful in educational contexts where instructors need to identify representative examples from student work.

## Architecture

### Core Components

1. **`submission_matcher.py`** - Main matching logic and AI analysis
2. **`celery_tasks.py`** - Celery task wrapper for async execution
3. **Data Models** - Type-safe dataclasses for submissions and results

### Technology Stack

- **LLM**: GPT-4o (OpenAI) for semantic analysis
- **Task Queue**: Celery for async processing
- **Pattern**: Follows the same architecture as `response_summarizer.py` and `group_assignment.py`

## Data Models

### `WebsiteSubmission`
Represents a single student's website submission:
```python
@dataclass
class WebsiteSubmission:
    student_name: str
    url: str
    name: str
    purpose: str
    platform: str
    raw_data: Optional[Dict[str, Any]] = None
```

### `SummaryData`
Represents the summary from the roomcast form:
```python
@dataclass
class SummaryData:
    category: str       # General category (e.g., "Health Misinformation Sites")
    purpose: str        # Common purpose across submissions
    platform: str       # Platform type (e.g., "Independent blogs")
    strategy: str       # Detection/avoidance strategy
```

### `MatchResult`
Contains the matching results:
```python
@dataclass
class MatchResult:
    best_match_student: str                    # Name of student with best match
    best_match_submission: WebsiteSubmission   # Full submission details
    similarity_score: float                    # Confidence (0.0 - 1.0)
    reasoning: str                             # AI explanation
    all_scores: Dict[str, float]              # Scores for all submissions
    timestamp: datetime                        # When analysis completed
```

## Matching Strategies

### 1. **Comprehensive** (Default)
Analyzes all aspects:
- Purpose alignment
- Platform matching
- Category representation
- Overall conceptual fit

**Best for**: General use cases where all factors matter

### 2. **Purpose Focused**
Prioritizes semantic similarity of purpose:
- Focuses on intent and goals
- Considers underlying meaning
- Looks for conceptual alignment

**Best for**: When purpose is the most important factor

### 3. **Platform Focused**
Emphasizes platform matching:
- Exact platform matches
- Related platform categories
- Platform ecosystem

**Best for**: When platform type is critical

## Usage

### Direct Function Call (Async)

```python
from services.deployment_types.submission_matcher import match_summary_to_submission

# Prepare data
summary_data = {
    'category': 'Health Misinformation Sites',
    'purpose': 'Sites spreading false health claims',
    'platform': 'Independent blogs',
    'strategy': 'Teach source verification'
}

website_submissions = [
    {
        'student_name': 'Alice',
        'url': 'https://example.com',
        'name': 'Example Site',
        'purpose': 'Promotes unverified health claims',
        'platform': 'Blog'
    },
    # ... more submissions
]

# Run matching
result = await match_summary_to_submission(
    summary_data=summary_data,
    website_submissions=website_submissions,
    matching_strategy="comprehensive",
    model_name="gpt-4o"
)

# Access results
print(f"Best match: {result.best_match_student}")
print(f"Confidence: {result.similarity_score:.2%}")
print(f"Reasoning: {result.reasoning}")
```

### Celery Task (Async Background Processing)

```python
from services.celery_tasks import match_submission_to_summary_task

# Trigger task
task = match_submission_to_summary_task.delay(
    summary_data=summary_data,
    website_submissions=website_submissions,
    matching_strategy="comprehensive",
    model_name="gpt-4o"
)

# Check task status
task_status = task.state  # 'PENDING', 'PROGRESS', 'SUCCESS', 'FAILURE'

# Get progress updates
task_info = task.info
progress = task_info.get('progress', 0)
status = task_info.get('status', 'Unknown')
stage = task_info.get('stage', 'unknown')

# Get final result (blocks until complete)
result = task.get()
match_data = result['result']
```

## API Integration Example

```python
from fastapi import APIRouter, BackgroundTasks
from services.celery_tasks import match_submission_to_summary_task

router = APIRouter()

@router.post("/api/match-submission")
async def match_submission_endpoint(
    summary: dict,
    submissions: list[dict],
    background_tasks: BackgroundTasks
):
    # Start Celery task
    task = match_submission_to_summary_task.delay(
        summary_data=summary,
        website_submissions=submissions,
        matching_strategy="comprehensive"
    )
    
    return {
        "task_id": task.id,
        "status": "processing",
        "message": "Matching analysis started"
    }

@router.get("/api/match-submission/{task_id}")
async def get_matching_result(task_id: str):
    from celery.result import AsyncResult
    
    task = AsyncResult(task_id, app=celery_app)
    
    if task.state == 'PENDING':
        return {"status": "pending", "progress": 0}
    elif task.state == 'PROGRESS':
        return {
            "status": "processing",
            "progress": task.info.get('progress', 0),
            "stage": task.info.get('stage', 'unknown')
        }
    elif task.state == 'SUCCESS':
        return {
            "status": "completed",
            "result": task.result['result']
        }
    else:
        return {
            "status": "failed",
            "error": str(task.info)
        }
```

## Testing

Run the test script to verify functionality:

```bash
cd backend
source ../.venv/bin/activate
python test_submission_matcher.py
```

The test suite includes:
1. Health misinformation websites test
2. Social media platforms test
3. Different matching strategies comparison

## How It Works

### 1. **Data Preparation**
- Convert input dicts to typed dataclasses
- Validate all required fields present
- Handle edge cases (single submission, empty data)

### 2. **Prompt Construction**
- Build comprehensive prompt with summary and all submissions
- Include strategy-specific instructions
- Format for optimal LLM comprehension

### 3. **LLM Analysis**
- Send to GPT-4o for semantic analysis
- Request structured output format
- Include confidence scoring

### 4. **Result Parsing**
- Extract best match student name
- Parse confidence score (0.0 - 1.0)
- Extract reasoning/explanation
- Parse individual scores for each submission
- Handle parsing errors gracefully

### 5. **Result Validation**
- Validate student name matches actual submissions
- Fuzzy match if exact match fails
- Provide fallback if parsing completely fails
- Ensure all scores are present

## Configuration

### Environment Variables

```bash
# Required
OPENAI_API_KEY=your_openai_api_key_here

# Optional (for Celery)
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

### Model Configuration

```python
matcher = SubmissionMatcher(
    model_name="gpt-4o",      # LLM model to use
    temperature=0.3,          # Lower = more deterministic
    max_tokens=2000           # Maximum response length
)
```

## Error Handling

### Common Errors

1. **Missing API Key**
```python
ValueError: OPENAI_API_KEY environment variable is required
```
**Solution**: Set the OPENAI_API_KEY environment variable

2. **Empty Submissions**
```python
ValueError: No submissions provided for matching
```
**Solution**: Ensure submissions list is not empty

3. **LLM API Error**
```python
Exception: Error getting LLM analysis: [error details]
```
**Solution**: Check API key, rate limits, and network connectivity

### Fallback Behavior

- If only 1 submission: Returns it with score 1.0
- If parsing fails: Returns first submission with score 0.5
- If student name not found: Uses fuzzy matching or falls back to first submission

## Performance Considerations

### Speed
- **Direct call**: ~3-5 seconds (depends on LLM API)
- **Celery task**: Non-blocking, results available in ~3-5 seconds

### Cost
- Uses GPT-4o API calls
- Cost scales with number of submissions
- Typical cost: $0.001 - $0.005 per matching operation

### Optimization Tips
1. Use Celery for non-blocking UI
2. Cache results for repeated analyses
3. Batch multiple matching requests if possible
4. Use lower temperature (0.1-0.3) for consistency

## Integration with Roomcast UI

The submission matcher is designed to work with the roomcast summary form:

1. **User completes summary form** with:
   - General category
   - Purpose summary
   - Platform summary
   - Detection strategy

2. **Frontend submits data** to backend API

3. **Backend triggers Celery task** with:
   - Summary data from form
   - All website submissions from group

4. **Task returns best match** including:
   - Student who submitted it
   - Full website details
   - Confidence score
   - AI reasoning

5. **UI displays result** showing:
   - Highlighted best match
   - Explanation of why it matches
   - Scores for all submissions

## Best Practices

1. **Always use Celery tasks** for user-facing features
2. **Validate input data** before sending to matcher
3. **Handle all task states** (PENDING, PROGRESS, SUCCESS, FAILURE)
4. **Display progress** to users during analysis
5. **Show confidence scores** to indicate certainty
6. **Include reasoning** so users understand the match
7. **Allow manual override** if AI selection seems wrong

## Future Enhancements

Possible improvements:
- Multi-criteria ranking with weighted scores
- Batch matching for multiple summaries
- Fine-tuning with educational context
- Integration with RAG for deeper analysis
- Support for multimedia submissions
- Historical matching accuracy tracking
- A/B testing different matching strategies
