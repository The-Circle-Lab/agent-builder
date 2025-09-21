# Learning Community Test Data Generator

This script generates test data for a deployment with two learning community prompt questions.

## Purpose

The script creates student users and submits responses to two specific prompt questions:

1. **Classroom Implementation Ideas** (submission_index 0): 
   "Please add any ideas or insights you may have about how the learning community perspective could be added into classrooms, helping to replace the lecture and exam perspective. What would it look like? How would students participate? Teachers? Parents or school leaders? Add any ideas you may have"

2. **Field Connections and Examples** (submission_index 1):
   "Please add any examples you can think of, or connections to other fields or situations. How could a learning community approach help students in their future? What kinds of work are supported? What are some technologies that could be important? Any examples or connections are helpful!"

## Usage

```bash
python test_learning_community_data.py \
  --count 50 \
  --base_url http://localhost:8000 \
  --class_join_code 99IBJ9HB \
  --deployment_id <PARENT_DEPLOYMENT_UUID> \
  --registration_key <REG_KEY>
```

## Parameters

- `--count`: Number of students to simulate (default: 50)
- `--base_url`: Backend base URL (default: http://localhost:8000)
- `--class_join_code`: Class join code (default: 99IBJ9HB)
- `--deployment_id`: Parent deployment UUID (default: ff540e39-480f-4d1c-aef2-a530659dbbf1)

## Data Structure

Each student submits:
- **5 classroom implementation ideas** as a JSON list for the first question
- **5 field connections/examples** as a JSON list for the second question

## Prerequisites

1. Backend server must be running (`python main.py`)
2. The deployment must be configured with two prompt questions expecting list mediaType
3. The deployment ID should point to a page-based deployment where the first page has the prompt
4. Students will use the actual page deployment ID: `{deployment_id}_page_1`

## Expected Deployment Structure

The script assumes:
- Page-based deployment with at least one page
- First page contains a prompt deployment
- Prompt has exactly 2 submission requirements
- Both requirements expect `mediaType: 'list'`
- submission_index 0: Classroom ideas
- submission_index 1: Field connections

## Data Variety

The script includes:
- 50+ unique sets of classroom implementation ideas
- 50+ unique sets of field connections and examples
- For counts > 50, it mixes and matches from different sets to maintain variety
- Each student gets 5 items per question type

## Example Output

```
Student 1: Alice Anderson
  Classroom ideas: collaborative project spaces, peer teaching circles, community mentorship programs...
  Field connections: workplace team collaboration, medical peer consultation, scientific research communities...
```
