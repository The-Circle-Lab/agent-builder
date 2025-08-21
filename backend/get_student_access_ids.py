#!/usr/bin/env python3
"""
Utility script to get the correct student access deployment IDs for page deployments.
This helps identify which deployment IDs students should use for sessions/prompts.
"""

import requests
import json
import sys

def get_student_access_ids(base_url: str, deployment_id: str, auth_token: str = None):
    """
    Get student access IDs for a page deployment.
    
    Args:
        base_url: Base URL of the API (e.g., http://localhost:8000)
        deployment_id: Main deployment ID
        auth_token: Optional authentication token
    
    Returns:
        Dictionary with student access IDs
    """
    
    url = f"{base_url}/api/deploy/{deployment_id}/student-access-ids"
    
    headers = {}
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"
    
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        
        data = response.json()
        
        print("🎯 STUDENT ACCESS IDs FOUND!")
        print("=" * 60)
        print(f"Main Deployment ID: {data['main_deployment_id']}")
        print(f"Total Pages: {data['total_pages']}")
        print()
        
        for page_info in data['student_access_ids']:
            print(f"📄 Page {page_info['page_number']} ({page_info['page_type']}):")
            print(f"   🚀 STUDENT ACCESS ID: {page_info['student_access_id']}")
            print(f"   📋 Container ID: {page_info['container_id']}")
            print(f"   ✅ Accessible: {page_info['is_accessible']}")
            print()
        
        print("💡 Use the 'STUDENT ACCESS ID' for:")
        print("   - Creating prompt sessions")
        print("   - Student interactions")
        print("   - Test scripts")
        print("=" * 60)
        
        return data
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Error getting student access IDs: {e}")
        if hasattr(e, 'response') and e.response:
            print(f"Response: {e.response.text}")
        return None

def main():
    """Main function for command line usage"""
    if len(sys.argv) < 3:
        print("Usage: python get_student_access_ids.py <base_url> <deployment_id> [auth_token]")
        print("Example: python get_student_access_ids.py http://localhost:8000 ad42d599-45d7-429a-a8e6-c5d439fae788")
        sys.exit(1)
    
    base_url = sys.argv[1].rstrip('/')
    deployment_id = sys.argv[2]
    auth_token = sys.argv[3] if len(sys.argv) > 3 else None
    
    result = get_student_access_ids(base_url, deployment_id, auth_token)
    
    if result:
        # Save to file for easy reference
        filename = f"student_access_ids_{deployment_id[:8]}.json"
        with open(filename, 'w') as f:
            json.dump(result, f, indent=2)
        print(f"💾 Results saved to: {filename}")
    else:
        sys.exit(1)

if __name__ == "__main__":
    main() 
