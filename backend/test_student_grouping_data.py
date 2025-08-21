#!/usr/bin/env python3
"""
Test script to create 20 student users and have them submit responses
to a prompt deployment for testing the grouping agent.

Usage: python test_student_grouping_data.py
"""

import requests
import random
import json
import os
from typing import List, Dict
import time

# Configuration
BASE_URL = "http://localhost:8000"
CLASS_JOIN_CODE = "SC28YHV3"
DEPLOYMENT_ID = "05c212b4-b81d-4e0f-aa96-de3140515e43"
PAGE_DEPLOYMENT_ID = f"{DEPLOYMENT_ID}_page_1"
REGISTRATION_KEY = "3cXr92JtN4"

# Sample student names
FIRST_NAMES = [
    "Alice", "Bob", "Charlie", "Diana", "Eve", "Frank", "Grace", "Henry",
    "Ivy", "Jack", "Kate", "Liam", "Mia", "Nathan", "Olivia", "Peter",
    "Quinn", "Rachel", "Sam", "Tara", "Uma", "Victor", "Wendy", "Xander",
    "Yara", "Zoe", "Adam", "Beth", "Carl", "Delia"
]

LAST_NAMES = [
    "Anderson", "Brown", "Chen", "Davis", "Evans", "Fisher", "Garcia", "Harris",
    "Johnson", "Kim", "Lee", "Miller", "Nelson", "O'Connor", "Patel", "Quinn",
    "Rodriguez", "Smith", "Taylor", "Underwood", "Valdez", "Wilson", "Xu", "Young", "Zhang"
]

# Diverse "Tell us about yourself!" responses
STUDENT_RESPONSES = [
    "Hi! I'm a computer science major with a passion for AI and machine learning. I love solving puzzles and playing chess in my free time. I'm excited to work on group projects!",
    
    "Hello everyone! I'm studying biology and hope to become a researcher someday. I enjoy hiking, photography, and reading sci-fi novels. I'm a bit introverted but love collaborating on meaningful projects.",
    
    "Hey! I'm an art student who also loves technology. I paint in my spare time and I'm fascinated by the intersection of art and AI. I work well in creative teams and love brainstorming sessions.",
    
    "Hi there! I'm majoring in business with a focus on entrepreneurship. I play basketball, love traveling, and I'm always looking for new opportunities. I bring energy and leadership to group work.",
    
    "Hello! I'm a psychology student interested in human behavior and decision-making. I enjoy writing, cooking, and volunteering at local shelters. I'm great at understanding different perspectives in teams.",
    
    "Hey everyone! I'm an engineering student who loves building things. I spend my weekends working on robotics projects and playing video games. I'm detail-oriented and methodical in my approach.",
    
    "Hi! I'm studying environmental science because I care deeply about sustainability. I love camping, rock climbing, and gardening. I'm passionate about creating positive change through teamwork.",
    
    "Hello! I'm a literature major who loves creative writing and poetry. I also play guitar and enjoy attending concerts. I bring creativity and strong communication skills to any group.",
    
    "Hey! I'm studying economics and mathematics. I love analyzing data and finding patterns. In my free time, I solve puzzles, play piano, and follow financial markets. I'm analytical and logical.",
    
    "Hi everyone! I'm a pre-med student with a love for chemistry and helping others. I volunteer at hospitals and tutor younger students. I'm organized, reliable, and great at coordinating group efforts.",
    
    "Hello! I'm majoring in communications and love social media and digital marketing. I'm outgoing, love meeting new people, and I'm great at presenting ideas. I thrive in collaborative environments.",
    
    "Hey! I'm studying physics and I'm fascinated by how the universe works. I love stargazing, playing board games, and learning about space exploration. I bring curiosity and scientific thinking to teams.",
    
    "Hi! I'm an international student studying political science. I speak three languages and love learning about different cultures. I'm diplomatic and good at finding common ground in groups.",
    
    "Hello everyone! I'm studying graphic design and I'm passionate about visual storytelling. I love anime, drawing, and digital art. I'm creative and great at visual problem-solving in teams.",
    
    "Hey! I'm majoring in history and I love learning about the past to understand the present. I enjoy museums, documentaries, and debating ideas. I bring research skills and critical thinking to groups.",
    
    "Hi! I'm studying mechanical engineering and I love hands-on problem solving. I build furniture as a hobby and I'm part of the robotics club. I'm practical and good at implementing ideas.",
    
    "Hello! I'm a philosophy major who loves deep conversations about ethics and meaning. I practice meditation, write in journals, and enjoy quiet reflection. I help teams think through complex questions.",
    
    "Hey everyone! I'm studying marketing and I love understanding consumer behavior. I'm active on social media, love fashion, and enjoy networking events. I'm great at understanding what people want.",
    
    "Hi! I'm majoring in data science and I'm excited about the power of big data. I love coding, playing strategy games, and analyzing sports statistics. I bring technical skills and logical thinking.",
    
    "Hello! I'm studying education because I want to be a teacher. I love working with kids, playing sports, and organizing community events. I'm patient, encouraging, and great at explaining complex ideas."
]

class StudentTestData:
    def __init__(self):
        self.students = []
        self.session = requests.Session()
        
    def generate_student_data(self, count: int = 20) -> List[Dict]:
        """Generate random student data"""
        students = []
        used_emails = set()
        
        for i in range(count):
            # Generate unique email
            while True:
                first_name = random.choice(FIRST_NAMES)
                last_name = random.choice(LAST_NAMES)
                email = f"{first_name.lower()}.{last_name.lower()}{random.randint(1, 999)}@student.edu"
                if email not in used_emails:
                    used_emails.add(email)
                    break
            
            # Select a unique response
            response = STUDENT_RESPONSES[i % len(STUDENT_RESPONSES)]
            if i >= len(STUDENT_RESPONSES):
                # Add some variation for extra students
                response += f" I'm also interested in learning new skills and meeting new people!"
            
            students.append({
                "first_name": first_name,
                "last_name": last_name,
                "email": email,
                "password": f"password{i+1}23!",
                "response": response
            })
        
        return students
    
    def register_student(self, student_data: Dict) -> bool:
        """Register a single student"""
        try:
            response = self.session.post(f"{BASE_URL}/auth/register", json={
                "email": student_data["email"],
                "password": student_data["password"],
                "key": REGISTRATION_KEY,
                "is_instructor": False
            })
            
            if response.status_code == 201:
                print(f"✅ Registered: {student_data['first_name']} {student_data['last_name']} ({student_data['email']})")
                return True
            else:
                print(f"❌ Failed to register {student_data['email']}: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Error registering {student_data['email']}: {e}")
            return False
    
    def login_student(self, student_data: Dict) -> bool:
        """Login a student and store session"""
        try:
            response = self.session.post(f"{BASE_URL}/auth/login", json={
                "email": student_data["email"],
                "password": student_data["password"]
            })
            
            if response.status_code == 204:
                return True
            else:
                print(f"❌ Failed to login {student_data['email']}: {response.status_code}")
                return False
                
        except Exception as e:
            print(f"❌ Error logging in {student_data['email']}: {e}")
            return False
    
    def join_class(self, student_data: Dict) -> bool:
        """Have student join the class"""
        try:
            response = self.session.post(f"{BASE_URL}/api/classes/join", json={
                "join_code": CLASS_JOIN_CODE
            })
            
            if response.status_code == 200:
                print(f"📚 {student_data['first_name']} joined class {CLASS_JOIN_CODE}")
                return True
            else:
                print(f"❌ Failed to join class for {student_data['email']}: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Error joining class for {student_data['email']}: {e}")
            return False
    
    def start_prompt_session(self, student_data: Dict) -> int:
        """Start a prompt session and return session ID"""
        try:
            response = self.session.post(f"{BASE_URL}/api/deploy/{PAGE_DEPLOYMENT_ID}/prompt/session")
            
            if response.status_code == 200:
                session_data = response.json()
                session_id = session_data.get("session_id", 0)
                print(f"📝 {student_data['first_name']} started prompt session (ID: {session_id})")
                return session_id
            else:
                print(f"❌ Failed to start session for {student_data['email']}: {response.status_code} - {response.text}")
                return 0
                
        except Exception as e:
            print(f"❌ Error starting session for {student_data['email']}: {e}")
            return 0
    
    def submit_prompt_response(self, student_data: Dict, session_id: int) -> bool:
        """Submit response to the prompt"""
        try:
            response = self.session.post(f"{BASE_URL}/api/deploy/{PAGE_DEPLOYMENT_ID}/prompt/submit", json={
                "submission_index": 0,  # First (and likely only) submission requirement
                "response": student_data["response"]
            })
            
            if response.status_code == 200:
                print(f"✅ {student_data['first_name']} submitted response: '{student_data['response'][:50]}...'")
                return True
            else:
                print(f"❌ Failed to submit response for {student_data['email']}: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Error submitting response for {student_data['email']}: {e}")
            return False
    
    def process_student(self, student_data: Dict) -> bool:
        """Complete workflow for a single student"""
        print(f"\n🔄 Processing student: {student_data['first_name']} {student_data['last_name']}")
        
        # Create new session for each student
        self.session = requests.Session()
        
        # Step 1: Register
        if not self.register_student(student_data):
            return False
        
        time.sleep(0.1)  # Small delay to avoid overwhelming the server
        
        # Step 2: Join class (should be automatic after registration due to login)
        if not self.join_class(student_data):
            return False
        
        time.sleep(0.1)
        
        # Step 3: Start prompt session
        session_id = self.start_prompt_session(student_data)
        if session_id == 0:
            return False
        
        time.sleep(0.1)
        
        # Step 4: Submit response
        if not self.submit_prompt_response(student_data, session_id):
            return False
        
        return True
    
    def run_test(self):
        """Run the complete test"""
        print("🚀 Starting Student Grouping Test Data Generation")
        print(f"📋 Configuration:")
        print(f"   - Base URL: {BASE_URL}")
        print(f"   - Class Code: {CLASS_JOIN_CODE}")
        print(f"   - Deployment ID: {DEPLOYMENT_ID}")
        print(f"   - Page Deployment ID: {PAGE_DEPLOYMENT_ID}")
        print(f"   - Registration Key: {REGISTRATION_KEY}")
        
        # Generate student data
        print(f"\n👥 Generating 20 student profiles...")
        students = self.generate_student_data(20)
        
        # Process each student
        successful_students = 0
        failed_students = 0
        
        print(f"\n🎯 Processing students...")
        for i, student in enumerate(students, 1):
            print(f"\n--- Student {i}/20 ---")
            if self.process_student(student):
                successful_students += 1
            else:
                failed_students += 1
            
            # Small delay between students
            time.sleep(0.2)
        
        # Summary
        print(f"\n📊 TEST COMPLETE - SUMMARY:")
        print(f"   ✅ Successful: {successful_students}")
        print(f"   ❌ Failed: {failed_students}")
        print(f"   📈 Success Rate: {(successful_students/20)*100:.1f}%")
        
        if successful_students >= 15:
            print(f"\n🎉 SUCCESS! {successful_students} students have submitted responses.")
            print(f"📝 The grouping agent now has diverse student data to work with!")
            print(f"🔬 You can now test the behavior execution in the admin dashboard.")
        else:
            print(f"\n⚠️  Warning: Only {successful_students} students completed successfully.")
            print(f"🔧 Check server logs and try running the test again.")

def main():
    """Main execution function"""
    print("=" * 60)
    print("🧪 STUDENT GROUPING TEST DATA GENERATOR")
    print("=" * 60)
    
    # Check if server is running
    try:
        response = requests.get(f"{BASE_URL}/auth/me", timeout=5)
        print("✅ Server is running")
    except requests.exceptions.ConnectionError:
        print("❌ Server is not running. Please start the backend server first.")
        print("   Run: python main.py")
        return
    except:
        # Server is running but auth endpoint requires authentication (expected)
        print("✅ Server is running")
    
    # Run the test
    test = StudentTestData()
    test.run_test()
    
    print("\n" + "=" * 60)
    print("🏁 Test Complete!")
    print("=" * 60)

if __name__ == "__main__":
    main() 
