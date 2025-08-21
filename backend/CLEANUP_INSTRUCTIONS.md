# Test Student Cleanup Tool

A comprehensive script to remove all test student accounts and their associated data from the database.

## Features

- **Smart Detection**: Automatically identifies test users by email patterns
- **Comprehensive Cleanup**: Removes all associated data (sessions, submissions, memberships, etc.)
- **Safety Measures**: Skips global instructors and requires confirmation
- **Detailed Reporting**: Shows what will be deleted and provides cleanup summary
- **Dry Run Mode**: Preview what would be deleted without actually deleting

## Usage

### Basic Cleanup
```bash
python cleanup_test_students.py
```

### Dry Run (Preview Only)
```bash
python cleanup_test_students.py --dry-run
```

### With Arguments
```bash
./cleanup_test_students.py --dry-run     # Preview mode
./cleanup_test_students.py               # Interactive cleanup
```

## What Gets Deleted

The script identifies test users by these email patterns:
- `firstname.lastname123@student.edu` (from the test data generator)
- Any email containing "test"
- Any email containing "demo"

For each test user found, it deletes:
- **User Account**: The user record itself
- **Auth Sessions**: All login sessions
- **Class Memberships**: Enrollment in classes
- **Prompt Sessions & Submissions**: All prompt interactions
- **Chat Conversations & Messages**: All chat data
- **MCQ Sessions & Answers**: Multiple choice question data
- **Code Submissions**: Programming assignment submissions
- **Problem States**: Progress on coding problems
- **Grades**: All grading records

## Safety Features

✅ **Global Instructor Protection**: Never deletes users marked as global instructors  
✅ **Confirmation Required**: Must type "DELETE" to proceed  
✅ **Dry Run Mode**: Preview deletions without making changes  
✅ **Detailed Logging**: Shows exactly what's being deleted  
✅ **Transaction Safety**: All operations in a single database transaction  

## Example Output

```
🧹 TEST STUDENT CLEANUP TOOL
==================================================
🔍 Identifying test users...
📋 Found 20 test users:
   • alice.anderson123@student.edu (ID: 45)
   • bob.brown456@student.edu (ID: 46)
   • charlie.chen789@student.edu (ID: 47)
   [... etc ...]

📊 Associated data to be deleted:
   • Auth Sessions: 20
   • Class Memberships: 20
   • Prompt Sessions: 20
   • Prompt Submissions: 60
   • Chat Conversations: 5
   • Chat Messages: 12

⚠️  WARNING: This will permanently delete 20 users and all their data!
Type 'DELETE' to confirm: DELETE

🗑️  Starting cleanup...
   📝 Deleted 60 prompt submissions
   📝 Deleted 20 prompt sessions
   💬 Deleted 12 chat messages
   💬 Deleted 5 chat conversations
   🏫 Deleted 20 class memberships
   🔐 Deleted 20 auth sessions
   👤 Deleted 20 users

✅ Cleanup completed successfully!

📊 CLEANUP SUMMARY:
   🗑️  Total items deleted: 157
   • Users: 20
   • Auth Sessions: 20
   • Class Memberships: 20
   • Prompt Sessions: 20
   • Prompt Submissions: 60
   • Chat Conversations: 5
   • Chat Messages: 12
```

## When to Use

- **After testing**: Clean up test data before production
- **Between test runs**: Reset for fresh testing scenarios
- **Development cleanup**: Remove accumulated test accounts
- **Database maintenance**: Keep database clean and manageable

## Typical Workflow

1. **Generate test data**:
   ```bash
   python test_student_grouping_data.py
   ```

2. **Test your grouping agent** using the admin dashboard

3. **Clean up when done**:
   ```bash
   python cleanup_test_students.py --dry-run  # Preview first
   python cleanup_test_students.py           # Actual cleanup
   ```

## Recovery

⚠️ **WARNING**: This cleanup is **PERMANENT**. There is no undo function.

If you need to recover:
- Re-run the test data generator script
- Restore from database backup (if available)
- Manually recreate test accounts

## Troubleshooting

### "No test users found"
- Good! Database is already clean
- Or test users have different email patterns

### Database connection errors
- Make sure you're in the backend directory
- Ensure the database file exists
- Check database permissions

### Permission errors
- Make sure script is executable: `chmod +x cleanup_test_students.py`
- Run from backend directory where database is accessible 
