#!/usr/bin/env python3
"""
Test script for the new group size modes functionality.
Tests both 'students_per_group' and 'number_of_groups' modes.
"""

import sys
import os
import numpy as np

# Add the current directory to Python path so we can import our modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.deployment_types.group_assignment import GroupAssignmentBehavior

def test_students_per_group_mode():
    """Test the original 'students_per_group' mode"""
    print("\n=== Testing Students Per Group Mode ===")
    
    # Create test student data (12 students)
    students = [
        {"name": f"Student {i+1}", "text": f"I'm interested in topic {i % 3}"} 
        for i in range(12)
    ]
    
    # Test with 4 students per group (should create 3 groups)
    config = {
        "group_size": 4,
        "group_size_mode": "students_per_group",
        "grouping_method": "mixed",
        "include_explanations": False,
        "selected_submission_prompts": []
    }
    
    behavior = GroupAssignmentBehavior(config)
    result = behavior.execute(students)
    
    print(f"Mode: {config['group_size_mode']}")
    print(f"Target group size: {config['group_size']}")
    print(f"Number of students: {len(students)}")
    print(f"Groups created: {len(result['groups'])}")
    
    for group_name, members in result['groups'].items():
        print(f"  {group_name}: {len(members)} members")
    
    # Verify we have approximately the right number of groups
    expected_groups = len(students) // config['group_size']
    assert len(result['groups']) in [expected_groups, expected_groups + 1], f"Expected ~{expected_groups} groups, got {len(result['groups'])}"
    print("✅ Students per group mode test passed!")
    
    return result

def test_number_of_groups_mode():
    """Test the new 'number_of_groups' mode"""
    print("\n=== Testing Number of Groups Mode ===")
    
    # Create test student data (12 students)
    students = [
        {"name": f"Student {i+1}", "text": f"I'm interested in topic {i % 3}"} 
        for i in range(12)
    ]
    
    # Test with 3 groups (should distribute 12 students across 3 groups)
    config = {
        "group_size": 3,  # This now means "number of groups"
        "group_size_mode": "number_of_groups",
        "grouping_method": "mixed",
        "include_explanations": False,
        "selected_submission_prompts": []
    }
    
    behavior = GroupAssignmentBehavior(config)
    result = behavior.execute(students)
    
    print(f"Mode: {config['group_size_mode']}")
    print(f"Target number of groups: {config['group_size']}")
    print(f"Number of students: {len(students)}")
    print(f"Groups created: {len(result['groups'])}")
    
    for group_name, members in result['groups'].items():
        print(f"  {group_name}: {len(members)} members")
    
    # Verify we have exactly the requested number of groups
    assert len(result['groups']) == config['group_size'], f"Expected {config['group_size']} groups, got {len(result['groups'])}"
    print("✅ Number of groups mode test passed!")
    
    return result

def test_edge_cases():
    """Test edge cases for both modes"""
    print("\n=== Testing Edge Cases ===")
    
    # Test with more requested groups than students
    students = [
        {"name": f"Student {i+1}", "text": f"I'm interested in topic {i % 2}"} 
        for i in range(3)
    ]
    
    config = {
        "group_size": 5,  # Request 5 groups but only have 3 students
        "group_size_mode": "number_of_groups",
        "grouping_method": "mixed",
        "include_explanations": False,
        "selected_submission_prompts": []
    }
    
    behavior = GroupAssignmentBehavior(config)
    result = behavior.execute(students)
    
    print(f"Edge case: Requested {config['group_size']} groups with {len(students)} students")
    print(f"Groups created: {len(result['groups'])}")
    
    # Should cap at number of students
    assert len(result['groups']) <= len(students), f"Created more groups than students!"
    print("✅ Edge case test passed!")

if __name__ == "__main__":
    print("🧪 Testing Group Size Modes")
    
    try:
        # Test both modes
        result1 = test_students_per_group_mode()
        result2 = test_number_of_groups_mode() 
        test_edge_cases()
        
        print("\n🎉 All tests passed successfully!")
        print("\nComparison:")
        print(f"Students per group mode: {len(result1['groups'])} groups")
        print(f"Number of groups mode: {len(result2['groups'])} groups")
        
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
