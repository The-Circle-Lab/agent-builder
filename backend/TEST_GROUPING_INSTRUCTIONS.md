# Student Grouping Test Data Generator

This script creates 20 test students and has them submit responses to a prompt deployment for testing the grouping agent functionality.

## Prerequisites

1. **Backend server must be running**:
   ```bash
   python main.py
   ```

2. **Environment variables** (set these in your shell or .env file):
   ```bash
   export REGISTRATION_KEY="test-key-2024"
   # Or whatever registration key you're using
   ```

3. **Class must exist** with join code `SC28YHV3`

4. **Deployment must exist** with ID `d020a1b3-2e6c-452f-92b4-85a32f6e9847`

## Usage

Run the test script:

```bash
python test_student_grouping_data.py
```

Or make it executable and run directly:

```bash
./test_student_grouping_data.py
```

## What the script does

1. **Creates 20 diverse student users** with realistic names and email addresses
2. **Registers each student** using the configured registration key
3. **Has each student join the class** using join code `SC28YHV3`
4. **Creates prompt sessions** for deployment page 1 (`d020a1b3-2e6c-452f-92b4-85a32f6e9847_page_1`)
5. **Submits diverse responses** to the "Tell us about yourself!" prompt

## Student Response Examples

The script includes 20 diverse student responses covering different:
- **Academic majors**: Computer Science, Biology, Art, Business, Psychology, Engineering, etc.
- **Personalities**: Introverted/extroverted, analytical/creative, leadership/collaborative
- **Interests**: Technology, arts, sports, volunteering, travel, gaming, etc.
- **Skills**: Technical, creative, communication, organizational, research

## Expected Output

```
🚀 Starting Student Grouping Test Data Generation
📋 Configuration:
   - Base URL: http://localhost:8000
   - Class Code: SC28YHV3
   - Deployment ID: d020a1b3-2e6c-452f-92b4-85a32f6e9847
   - Page Deployment ID: d020a1b3-2e6c-452f-92b4-85a32f6e9847_page_1

👥 Generating 20 student profiles...

🎯 Processing students...

--- Student 1/20 ---
🔄 Processing student: Alice Anderson
✅ Registered: Alice Anderson (alice.anderson123@student.edu)
📚 Alice joined class SC28YHV3
📝 Alice started prompt session (ID: 15)
✅ Alice submitted response: 'Hi! I'm a computer science major with a passion...'

[... continues for all 20 students ...]

📊 TEST COMPLETE - SUMMARY:
   ✅ Successful: 20
   ❌ Failed: 0
   📈 Success Rate: 100.0%

🎉 SUCCESS! 20 students have submitted responses.
📝 The grouping agent now has diverse student data to work with!
🔬 You can now test the behavior execution in the admin dashboard.
```

## Next Steps

After running this script successfully:

1. **Open the admin dashboard** for the deployment
2. **Navigate to the page deployment admin view**
3. **Execute the grouping behavior** to test the group assignment algorithm
4. **View the generated groups** and explanations

## Troubleshooting

### Registration Key Error
If you get "Invalid registration key":
```bash
export REGISTRATION_KEY="your-actual-key"
```

### Class Not Found Error
If you get "Invalid join code":
- Verify the class exists with code `SC28YHV3`
- Check that the class is active
- Make sure you have the correct join code

### Deployment Not Found Error
If you get deployment errors:
- Verify the deployment ID `d020a1b3-2e6c-452f-92b4-85a32f6e9847` exists
- Make sure it's a page-based deployment
- Check that page 1 has a prompt node

### Server Connection Error
If you get connection errors:
- Make sure the backend server is running on port 8000
- Check that CORS is properly configured
- Verify the BASE_URL in the script matches your server

## Customization

You can modify the script to:
- **Change the number of students**: Edit the `count` parameter in `generate_student_data()`
- **Use different responses**: Modify the `STUDENT_RESPONSES` list
- **Target different deployments**: Change `DEPLOYMENT_ID` and `CLASS_JOIN_CODE`
- **Add more diversity**: Extend the name lists or response variations 
