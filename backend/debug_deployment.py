#!/usr/bin/env python3
"""
Debug script to check deployments and help identify the correct deployment ID
for the student grouping test.

Usage: python debug_deployment.py
"""

import requests
import json
from typing import List, Dict, Any

BASE_URL = "http://localhost:8000"
CLASS_JOIN_CODE = "SC28YHV3"

def check_server():
    """Check if server is running"""
    try:
        response = requests.get(f"{BASE_URL}/auth/me", timeout=5)
        return True
    except requests.exceptions.ConnectionError:
        print("❌ Server is not running. Please start the backend server first.")
        return False
    except:
        return True

def login_as_instructor():
    """Login as an instructor to access deployment data"""
    # You'll need to provide instructor credentials
    print("🔑 Please provide instructor credentials to check deployments:")
    email = input("Instructor email: ")
    password = input("Instructor password: ")
    
    session = requests.Session()
    
    try:
        response = session.post(f"{BASE_URL}/auth/login", json={
            "email": email,
            "password": password
        })
        
        if response.status_code == 204:
            print(f"✅ Logged in as {email}")
            return session
        else:
            print(f"❌ Login failed: {response.status_code}")
            return None
    except Exception as e:
        print(f"❌ Login error: {e}")
        return None

def get_class_info(session: requests.Session):
    """Get information about the class"""
    try:
        response = session.get(f"{BASE_URL}/api/classes")
        
        if response.status_code == 200:
            classes = response.json()
            target_class = None
            
            print(f"\n📚 Available Classes:")
            for cls in classes:
                print(f"   • {cls['name']} (Code: {cls['code']}, ID: {cls['id']})")
                if cls['code'] == CLASS_JOIN_CODE:
                    target_class = cls
            
            if target_class:
                print(f"\n🎯 Target Class Found:")
                print(f"   • Name: {target_class['name']}")
                print(f"   • Code: {target_class['code']}")
                print(f"   • ID: {target_class['id']}")
                return target_class['id']
            else:
                print(f"\n❌ Class with code {CLASS_JOIN_CODE} not found!")
                return None
        else:
            print(f"❌ Failed to get classes: {response.status_code}")
            return None
    except Exception as e:
        print(f"❌ Error getting classes: {e}")
        return None

def get_class_deployments(session: requests.Session, class_id: int):
    """Get deployments for the class"""
    try:
        response = session.get(f"{BASE_URL}/api/classes/{class_id}/deployments")
        
        if response.status_code == 200:
            deployments = response.json()
            
            print(f"\n🚀 Class Deployments:")
            page_deployments = []
            
            for deployment in deployments:
                print(f"\n   📋 {deployment['name']}")
                print(f"      • ID: {deployment['deployment_id']}")
                print(f"      • Type: {deployment['deployment_type']}")
                print(f"      • Status: {'Open' if deployment.get('is_open', False) else 'Closed'}")
                print(f"      • Page-based: {deployment.get('is_page_based', False)}")
                
                if deployment.get('is_page_based', False):
                    page_deployments.append(deployment)
            
            if page_deployments:
                print(f"\n🎯 Page-based Deployments Found:")
                for deployment in page_deployments:
                    print(f"   ✅ {deployment['name']} - {deployment['deployment_id']}")
                return page_deployments
            else:
                print(f"\n❌ No page-based deployments found in this class!")
                return []
        else:
            print(f"❌ Failed to get deployments: {response.status_code}")
            return []
    except Exception as e:
        print(f"❌ Error getting deployments: {e}")
        return []

def check_deployment_pages(session: requests.Session, deployment_id: str):
    """Check pages within a deployment"""
    try:
        response = session.get(f"{BASE_URL}/api/deploy/{deployment_id}/pages")
        
        if response.status_code == 200:
            page_data = response.json()
            
            print(f"\n📄 Pages in deployment {deployment_id}:")
            print(f"   • Total Pages: {page_data['page_count']}")
            print(f"   • Pages Accessible: {page_data['pages_accessible']}")
            
            for page in page_data['pages']:
                print(f"\n   📝 Page {page['page_number']}:")
                print(f"      • Deployment ID: {page['deployment_id']}")
                print(f"      • Type: {page['deployment_type']}")
                print(f"      • Accessible: {page['is_accessible']}")
                if not page['is_accessible'] and page.get('accessibility_reason'):
                    print(f"      • Reason: {page['accessibility_reason']}")
                
                # Check if this page has a prompt
                if page['deployment_type'] == 'prompt':
                    print(f"      ✅ This is a PROMPT page - can be used for testing!")
                    return page['deployment_id']
            
            return None
        else:
            print(f"❌ Failed to get pages: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"❌ Error getting pages: {e}")
        return None

def test_prompt_access(session: requests.Session, page_deployment_id: str):
    """Test if we can access the prompt on a page"""
    try:
        # Try to get prompt info
        response = session.get(f"{BASE_URL}/api/deploy/{page_deployment_id}/prompt/info")
        
        if response.status_code == 200:
            prompt_info = response.json()
            print(f"\n✅ Prompt accessible on {page_deployment_id}:")
            print(f"   • Question: {prompt_info['main_question']}")
            print(f"   • Submissions Required: {prompt_info['total_submissions']}")
            print(f"   • Question Only: {prompt_info['is_question_only']}")
            return True
        else:
            print(f"❌ Cannot access prompt: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"❌ Error testing prompt access: {e}")
        return False

def create_updated_test_script(deployment_id: str, page_deployment_id: str):
    """Create an updated version of the test script with correct IDs"""
    print(f"\n📝 Creating updated test script...")
    
    # Read the current test script
    try:
        with open('test_student_grouping_data.py', 'r') as f:
            script_content = f.read()
        
        # Update the deployment IDs
        updated_content = script_content.replace(
            'DEPLOYMENT_ID = "d020a1b3-2e6c-452f-92b4-85a32f6e9847"',
            f'DEPLOYMENT_ID = "{deployment_id}"'
        )
        updated_content = updated_content.replace(
            'PAGE_DEPLOYMENT_ID = f"{DEPLOYMENT_ID}_page_1"',
            f'PAGE_DEPLOYMENT_ID = "{page_deployment_id}"'
        )
        
        # Write updated script
        with open('test_student_grouping_data_fixed.py', 'w') as f:
            f.write(updated_content)
        
        print(f"✅ Created test_student_grouping_data_fixed.py with correct deployment IDs:")
        print(f"   • Main Deployment ID: {deployment_id}")
        print(f"   • Page Deployment ID: {page_deployment_id}")
        
    except Exception as e:
        print(f"❌ Error creating updated script: {e}")

def main():
    """Main debug function"""
    print("🔍 DEPLOYMENT DEBUG TOOL")
    print("=" * 50)
    
    # Check server
    if not check_server():
        return
    
    # Login as instructor
    session = login_as_instructor()
    if not session:
        return
    
    # Get class info
    class_id = get_class_info(session)
    if not class_id:
        return
    
    # Get deployments
    page_deployments = get_class_deployments(session, class_id)
    if not page_deployments:
        print("\n💡 SOLUTION: You need to create a page-based deployment with a prompt page.")
        print("   1. Go to the frontend workflow editor")
        print("   2. Create a new deployment")
        print("   3. Make it page-based with a prompt node on page 1")
        print("   4. Deploy it to your class")
        return
    
    # Check each page deployment
    working_page_id = None
    for deployment in page_deployments:
        deployment_id = deployment['deployment_id']
        print(f"\n🔍 Checking deployment: {deployment['name']} ({deployment_id})")
        
        page_deployment_id = check_deployment_pages(session, deployment_id)
        if page_deployment_id:
            if test_prompt_access(session, page_deployment_id):
                working_page_id = page_deployment_id
                print(f"\n🎉 FOUND WORKING DEPLOYMENT!")
                print(f"   • Main Deployment: {deployment_id}")
                print(f"   • Page Deployment: {page_deployment_id}")
                
                # Create updated test script
                create_updated_test_script(deployment_id, page_deployment_id)
                break
    
    if not working_page_id:
        print(f"\n❌ No working prompt pages found!")
        print(f"💡 Make sure you have a page-based deployment with an accessible prompt page.")

if __name__ == "__main__":
    main() 
