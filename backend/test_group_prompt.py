#!/usr/bin/env python3
"""
Test script to debug group assignment functionality for prompt pages.
"""
import sys
from pathlib import Path

# Add backend root to path
sys.path.append(str(Path(__file__).parent))

from services.page_service import PageDeployment, VariableType
from services.pages_manager import get_active_page_deployment
from database.database import get_session
from sqlmodel import select
from models.database.db_models import Deployment, User

def test_group_prompt_functionality():
    """Test the group assignment functionality for prompt pages"""
    
    # Example configuration matching the user's JSON
    test_config = {
        "pagesExist": True,
        "behavioursExist": True,
        "variables": {
            "Groupings": "group"
        },
        "pages": {
            "1": {
                "input_type": None,
                "input_id": None,
                "input_node": False,
                "output_type": "behaviour",
                "output_id": "1",
                "output_node": True,
                "nodes": {
                    "1": {
                        "type": "prompt",
                        "config": {
                            "label": "New prompt",
                            "question": "Fill out these questions for the grouping agent!"
                        }
                    },
                    "2": {
                        "type": "submission",
                        "config": {
                            "label": "New submission",
                            "submission_prompts": [
                                {
                                    "prompt": "Tell us about yourself!",
                                    "mediaType": "textarea"
                                }
                            ]
                        }
                    }
                }
            },
            "2": {
                "input_type": "variable",
                "input_id": "Groupings",
                "input_node": True,
                "output_type": None,
                "output_id": None,
                "output_node": False,
                "nodes": {
                    "1": {
                        "type": "prompt",
                        "config": {
                            "label": "New prompt",
                            "question": "These are your groupings!"
                        }
                    }
                }
            }
        },
        "behaviours": {
            "1": {
                "input_type": "page",
                "input_id": "1",
                "input_node": True,
                "output_type": "variable",
                "output_id": "Groupings",
                "output_node": False,
                "nodes": {
                    "1": {
                        "type": "group",
                        "config": {
                            "label": "New group",
                            "grouping_method": "homogeneous",
                            "group_size": 4
                        }
                    }
                }
            }
        }
    }
    
    print("🧪 Testing group assignment functionality...")
    
    try:
        # Create a test page deployment
        test_deployment_id = "test-group-deployment"
        page_deployment = PageDeployment(
            deployment_id=test_deployment_id,
            config=test_config
        )
        
        print(f"✅ Created PageDeployment with {len(page_deployment.get_page_list())} pages")
        print(f"✅ Created PageDeployment with {len(page_deployment.get_deployment_variables())} variables")
        
        # Check variables
        for var in page_deployment.get_deployment_variables():
            print(f"   Variable: {var.name} (type: {var.variable_type}, empty: {var.is_empty()})")
        
        # Set some test group data in the variable
        test_group_data = {
            "Group 1": ["user1@test.com", "user2@test.com"],
            "Group 2": ["user3@test.com", "user4@test.com"]
        }
        
        groupings_var = page_deployment.get_variable_by_name("Groupings")
        if groupings_var:
            groupings_var.set_value(test_group_data)
            print(f"✅ Set test group data: {test_group_data}")
        else:
            print("❌ Could not find Groupings variable")
            return
        
        # Test page 2 (should have group input)
        page_2 = page_deployment.get_page_by_number("2")
        if page_2:
            print(f"\n🔍 Testing Page 2:")
            print(f"   has_input: {page_2.has_input()}")
            print(f"   input_type: {page_2.input_type}")
            print(f"   input_id: {page_2.input_id}")
            print(f"   is_input_from_variable: {page_2.is_input_from_variable()}")
            print(f"   has_group_input: {page_2.has_group_input()}")
            
            # Test getting group data for a user
            test_user_email = "user1@test.com"
            group_data = page_2.get_group_data_for_user(test_user_email)
            print(f"   Group data for {test_user_email}: {group_data}")
            
            # Test with a user not in any group
            test_user_email_2 = "user5@test.com"
            group_data_2 = page_2.get_group_data_for_user(test_user_email_2)
            print(f"   Group data for {test_user_email_2}: {group_data_2}")
            
        else:
            print("❌ Could not find Page 2")
            return
        
        print("\n✅ All tests completed successfully!")
        
    except Exception as e:
        print(f"❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()

def test_with_database():
    """Test with a real deployment from the database"""
    print("\n🧪 Testing with database deployments...")
    
    with get_session() as db:
        # Find a page-based deployment
        deployments = db.exec(
            select(Deployment).where(
                Deployment.is_page_based == True,
                Deployment.is_active == True
            ).limit(5)
        ).all()
        
        print(f"Found {len(deployments)} page-based deployments:")
        for dep in deployments:
            print(f"   {dep.deployment_id}: {dep.workflow_name}")
            
            # Check if this deployment is currently active
            active_deployment = get_active_page_deployment(dep.deployment_id)
            if active_deployment:
                page_deployment = active_deployment.get("page_deployment")
                if page_deployment:
                    print(f"     🟢 Active with {len(page_deployment.get_page_list())} pages")
                    
                    # Check each page for group input
                    for i, page in enumerate(page_deployment.get_page_list(), 1):
                        print(f"       Page {i}: has_group_input={page.has_group_input()}")
                else:
                    print(f"     🔴 Active but no page_deployment object")
            else:
                print(f"     ⚪ Not currently active")

if __name__ == "__main__":
    print("🚀 Starting group prompt functionality tests...\n")
    
    # Test 1: Basic functionality
    test_group_prompt_functionality()
    
    # Test 2: Database deployments
    test_with_database()
    
    print("\n🏁 All tests completed!") 
