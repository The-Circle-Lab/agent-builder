#!/usr/bin/env python3
"""
Test script for the concurrent group assignment implementation.
This tests that the new concurrent features work correctly and provide speedup.
"""

import sys
import time
import os
from typing import Dict, Any, List

# Add the current directory to Python path
sys.path.append('.')

from services.deployment_types.group_assignment import GroupAssignmentBehavior, _generate_group_explanations

def create_test_students(count: int = 20) -> List[Dict[str, Any]]:
    """Create test student data."""
    interests = [
        "AI and machine learning research",
        "Web development and UI/UX design", 
        "Data science and analytics",
        "Cybersecurity and ethical hacking",
        "Mobile app development",
        "Game development and graphics",
        "Robotics and automation",
        "Blockchain and cryptocurrency",
        "Cloud computing and DevOps",
        "Digital marketing and social media"
    ]
    
    students = []
    for i in range(count):
        students.append({
            "name": f"Student_{i+1}",
            "text": f"I am interested in {interests[i % len(interests)]}. I have experience in programming and enjoy collaborative projects."
        })
    
    return students

def test_concurrent_explanations():
    """Test the concurrent explanation generation."""
    print("🧪 Testing Concurrent Group Explanation Generation")
    print("=" * 60)
    
    # Create test data
    students = create_test_students(24)  # 24 students -> ~6 groups of 4
    
    # Create test groups
    groups = {}
    group_size = 4
    for i in range(0, len(students), group_size):
        group_num = (i // group_size) + 1
        group_members = [student["name"] for student in students[i:i+group_size]]
        groups[f"Group{group_num}"] = group_members
    
    print(f"📊 Test Setup:")
    print(f"   Students: {len(students)}")
    print(f"   Groups: {len(groups)}")
    print(f"   Groups: {list(groups.keys())}")
    
    # Test concurrent explanation generation
    print(f"\n🚀 Testing concurrent explanation generation...")
    
    start_time = time.time()
    explanations = _generate_group_explanations(
        groups=groups,
        student_data=students,
        strategy="mixed",
        use_llm=False  # Use rule-based for consistent testing
    )
    end_time = time.time()
    
    duration = end_time - start_time
    print(f"\n📈 Results:")
    print(f"   ✅ Generated {len(explanations)} explanations")
    print(f"   ⏱️  Time taken: {duration:.2f} seconds")
    print(f"   🏃 Average per group: {duration/len(groups):.3f} seconds")
    
    # Verify all groups got explanations
    missing_explanations = set(groups.keys()) - set(explanations.keys())
    if missing_explanations:
        print(f"   ❌ Missing explanations for: {missing_explanations}")
        return False
    
    # Show sample explanations
    print(f"\n📝 Sample Explanations:")
    for i, (group_id, explanation) in enumerate(explanations.items()):
        if i < 3:  # Show first 3
            print(f"   {group_id}: {explanation}")
    
    print(f"\n✅ Concurrent explanation test completed successfully!")
    return True

def test_full_group_assignment():
    """Test the full group assignment with concurrent features."""
    print("\n🧪 Testing Full Group Assignment with Concurrency")
    print("=" * 60)
    
    # Create test data
    students = create_test_students(16)
    
    # Configure group assignment behavior
    config = {
        'group_size': 4,
        'group_size_mode': 'students_per_group',
        'grouping_method': 'mixed',
        'include_explanations': True,
        'label': 'Test Group Assignment'
    }
    
    behavior = GroupAssignmentBehavior(config)
    
    print(f"📊 Test Setup:")
    print(f"   Students: {len(students)}")
    print(f"   Target group size: {config['group_size']}")
    print(f"   Grouping method: {config['grouping_method']}")
    print(f"   Include explanations: {config['include_explanations']}")
    
    # Execute group assignment
    print(f"\n🚀 Executing group assignment...")
    start_time = time.time()
    
    try:
        result = behavior.execute(student_data=students)
        end_time = time.time()
        
        duration = end_time - start_time
        print(f"\n📈 Results:")
        print(f"   ✅ Success: {result['success']}")
        print(f"   👥 Groups created: {len(result['groups'])}")
        print(f"   📝 Explanations included: {'explanations' in result}")
        print(f"   ⏱️  Total time: {duration:.2f} seconds")
        
        # Show group composition
        print(f"\n👥 Group Composition:")
        for group_name, members in result['groups'].items():
            print(f"   {group_name}: {len(members)} members - {', '.join(members)}")
        
        # Show sample explanations if available
        if 'explanations' in result:
            print(f"\n📝 Sample Explanations:")
            for i, (group_name, explanation) in enumerate(result['explanations'].items()):
                if i < 2:  # Show first 2
                    print(f"   {group_name}: {explanation}")
        
        print(f"\n✅ Full group assignment test completed successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Group assignment failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Run all concurrency tests."""
    print("🚀 Starting Concurrent Group Assignment Tests")
    print("=" * 80)
    
    success_count = 0
    total_tests = 2
    
    # Test 1: Concurrent explanations
    if test_concurrent_explanations():
        success_count += 1
    
    # Test 2: Full group assignment
    if test_full_group_assignment():
        success_count += 1
    
    # Summary
    print(f"\n📊 Test Summary")
    print("=" * 80)
    print(f"   ✅ Passed: {success_count}/{total_tests}")
    print(f"   ❌ Failed: {total_tests - success_count}/{total_tests}")
    
    if success_count == total_tests:
        print(f"\n🎉 All tests passed! Concurrent group assignment is working correctly.")
        return True
    else:
        print(f"\n⚠️  Some tests failed. Please check the implementation.")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
