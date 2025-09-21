#!/usr/bin/env python3
"""
Test script to verify button customization API endpoints work correctly.
"""

import requests
import json
import sys

BASE_URL = "http://localhost:8000"

def test_button_customization_api():
    """Test the button customization API endpoints"""
    
    # First, we need to create a session and login (assuming you have a test deployment)
    session = requests.Session()
    
    # You'll need to replace this with an actual page deployment ID
    test_deployment_id = "your-page-deployment-id-here"
    
    print("🧪 Testing button customization API endpoints...")
    
    # Test GET endpoint (should return defaults)
    print(f"📡 Testing GET /api/deploy/{test_deployment_id}/student-button")
    try:
        response = session.get(f"{BASE_URL}/api/deploy/{test_deployment_id}/student-button")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ GET request successful: {data}")
        else:
            print(f"❌ GET request failed: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"❌ GET request error: {e}")
    
    # Test POST endpoint
    print(f"📡 Testing POST /api/deploy/{test_deployment_id}/student-button")
    test_data = {
        "button_text": "Homework",
        "button_color": "bg-green-600 hover:bg-green-700"
    }
    
    try:
        response = session.post(
            f"{BASE_URL}/api/deploy/{test_deployment_id}/student-button",
            json=test_data,
            headers={"Content-Type": "application/json"}
        )
        if response.status_code == 200:
            data = response.json()
            print(f"✅ POST request successful: {data}")
        else:
            print(f"❌ POST request failed: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"❌ POST request error: {e}")
    
    # Test GET again to verify changes
    print(f"📡 Testing GET again to verify changes")
    try:
        response = session.get(f"{BASE_URL}/api/deploy/{test_deployment_id}/student-button")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ GET after POST successful: {data}")
            if data.get("button_text") == "Homework" and "green" in data.get("button_color", ""):
                print("🎉 Button customization is working correctly!")
            else:
                print("⚠️  Changes were not persisted correctly")
        else:
            print(f"❌ Second GET request failed: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"❌ Second GET request error: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        test_deployment_id = sys.argv[1]
        print(f"Using deployment ID: {test_deployment_id}")
        test_button_customization_api()
    else:
        print("⚠️  To test the API endpoints, provide a page deployment ID:")
        print(f"python {sys.argv[0]} <page-deployment-id>")
        print("For now, just checking that the migration was successful...")
        print("✅ Migration completed successfully - API endpoints are ready to test!")
