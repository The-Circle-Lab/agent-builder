#!/usr/bin/env python3
"""
Example showing how to get and use the correct student access deployment IDs
for page-based deployments in test scripts.
"""

import requests
import json
from get_student_access_ids import get_student_access_ids

def example_fixed_student_test():
    """
    Example of how to properly test students with page deployments
    using the correct student access deployment IDs.
    """
    
    # Configuration
    BASE_URL = "http://localhost:8000"
    MAIN_DEPLOYMENT_ID = "ad42d599-45d7-429a-a8e6-c5d439fae788"  # Your main deployment ID
    
    print("🔧 GETTING CORRECT STUDENT ACCESS IDs...")
    print("=" * 60)
    
    # Step 1: Get the correct student access IDs
    access_ids_data = get_student_access_ids(BASE_URL, MAIN_DEPLOYMENT_ID)
    
    if not access_ids_data:
        print("❌ Failed to get student access IDs!")
        return False
    
    # Step 2: Extract the student access ID for page 1 (assuming it's a prompt page)
    page_1_info = None
    for page_info in access_ids_data['student_access_ids']:
        if page_info['page_number'] == 1:
            page_1_info = page_info
            break
    
    if not page_1_info:
        print("❌ Page 1 not found!")
        return False
    
    # This is the ID students should actually use!
    CORRECT_STUDENT_ACCESS_ID = page_1_info['student_access_id']
    
    print(f"\n✅ FOUND CORRECT STUDENT ACCESS ID:")
    print(f"   Main Deployment: {MAIN_DEPLOYMENT_ID}")
    print(f"   Page Container: {page_1_info['container_id']}")
    print(f"   🚀 Student Access ID: {CORRECT_STUDENT_ACCESS_ID}")
    print(f"   Page Type: {page_1_info['page_type']}")
    print()
    
    # Step 3: Example of how to use this in your test script
    print("📝 EXAMPLE USAGE IN TEST SCRIPT:")
    print("=" * 60)
    
    example_code = f'''
# WRONG (what was failing):
PAGE_DEPLOYMENT_ID = "{MAIN_DEPLOYMENT_ID}_page_1"  # This doesn't work!

# RIGHT (what should be used):
STUDENT_ACCESS_ID = "{CORRECT_STUDENT_ACCESS_ID}"  # Use this for sessions!

# Example API calls with correct ID:
def start_student_session(email, password):
    # Login first
    login_response = requests.post(f"{{BASE_URL}}/api/auth/login", json={{
        "email": email,
        "password": password
    }})
    token = login_response.json()["access_token"]
    
    # Create session with CORRECT ID
    session_response = requests.post(
        f"{{BASE_URL}}/api/deploy/{{STUDENT_ACCESS_ID}}/prompt/session",
        headers={{"Authorization": f"Bearer {{token}}"}}
    )
    return session_response

# Submit prompt with CORRECT ID
def submit_prompt(email, password, submission_text):
    session = start_student_session(email, password)
    token = session.json()["token"]  # Get from login
    
    submit_response = requests.post(
        f"{{BASE_URL}}/api/deploy/{{STUDENT_ACCESS_ID}}/prompt/submit",
        headers={{"Authorization": f"Bearer {{token}}"}},
        json={{
            "submissions": [{{
                "index": 0,
                "response": submission_text
            }}]
        }}
    )
    return submit_response
'''
    
    print(example_code)
    
    print("💡 KEY POINTS:")
    print("   1. Never use '{main_deployment_id}_page_X' for student sessions")
    print("   2. Always get the student access IDs from /student-access-ids endpoint")
    print("   3. Use the 'student_access_id' field for all student interactions")
    print("   4. Each page has its own unique student access ID")
    print()
    
    return True

def get_all_student_access_ids_for_deployment(base_url: str, deployment_id: str):
    """
    Helper function to get all student access IDs for a deployment.
    Returns a dictionary mapping page numbers to student access IDs.
    """
    access_ids_data = get_student_access_ids(base_url, deployment_id)
    
    if not access_ids_data:
        return {}
    
    page_mapping = {}
    for page_info in access_ids_data['student_access_ids']:
        page_mapping[page_info['page_number']] = {
            'student_access_id': page_info['student_access_id'],
            'page_type': page_info['page_type'],
            'container_id': page_info['container_id'],
            'is_accessible': page_info['is_accessible']
        }
    
    return page_mapping

if __name__ == "__main__":
    print("🧪 STUDENT ACCESS ID EXAMPLE")
    print("=" * 60)
    
    success = example_fixed_student_test()
    
    if success:
        print("\n✅ Example completed successfully!")
        print("📚 Now you can modify your test script to use the correct IDs.")
    else:
        print("\n❌ Example failed. Check your deployment ID and server status.") 
