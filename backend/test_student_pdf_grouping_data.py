#!/usr/bin/env python3
"""
Test script to create student users and have them submit text introductions
and TWO different PDF responses to a prompt deployment for testing the grouping 
agent that leverages both text and document embeddings.

Usage:
  python test_student_pdf_grouping_data.py \
    --docs_dir /absolute/path/to/pdfs \
    --count 20 \
    --base_url http://localhost:8000 \
    --class_join_code SC28YHV3 \
    --deployment_id <PARENT_DEPLOYMENT_UUID> \
    --registration_key <REG_KEY>

Notes:
  - The script assumes the prompt page has 3 submission requirements:
    - submission_index 0: Text introduction (mediaType: 'text')  
    - submission_index 1: PDF upload #1 (mediaType: 'pdf')
    - submission_index 2: PDF upload #2 (mediaType: 'pdf')
  - Uses introduction responses from test_student_grouping_data.py
  - Two different random PDFs are assigned per student from the provided directory.
  - You can override defaults via CLI flags.
"""

import argparse
import time
import random
import requests
import os
from pathlib import Path
from typing import List, Dict, Tuple


DEFAULT_BASE_URL = "http://localhost:8000"
DEFAULT_CLASS_JOIN_CODE = "SC28YHV3"
DEFAULT_DEPLOYMENT_ID = "e1e0a7cd-fb5b-44bb-9cd6-c233b84d6c31"
DEFAULT_REGISTRATION_KEY = "CHANGEME"


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

# Diverse "Tell us about yourself!" responses from test_student_grouping_data.py
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


class StudentPDFData:
    def __init__(self, base_url: str, join_code: str, parent_deployment_id: str, docs_dir: Path):
        self.base_url = base_url.rstrip("/")
        self.join_code = join_code
        self.parent_deployment_id = parent_deployment_id
        self.page_deployment_id = f"{parent_deployment_id}_page_1"
        self.registration_key = "3cXr92JtN4"
        self.docs_dir = docs_dir
        self.session = requests.Session()

    def pick_random_pdfs(self, count: int) -> List[Tuple[Path, Path]]:
        """Pick pairs of different PDFs for each student"""
        pdfs = [p for p in self.docs_dir.glob("**/*.pdf") if p.is_file()]
        if not pdfs:
            raise ValueError(f"No PDF files found under: {self.docs_dir}")
        if len(pdfs) < 2:
            raise ValueError(f"Need at least 2 PDFs for pairs, found only {len(pdfs)}")
        
        random.shuffle(pdfs)
        pdf_pairs = []
        
        for i in range(count):
            # Pick two different PDFs for each student
            pdf1_idx = (i * 2) % len(pdfs)
            pdf2_idx = (i * 2 + 1) % len(pdfs)
            
            # Ensure they're different
            if pdf1_idx == pdf2_idx:
                pdf2_idx = (pdf2_idx + 1) % len(pdfs)
            
            pdf_pairs.append((pdfs[pdf1_idx], pdfs[pdf2_idx]))
        
        return pdf_pairs

    def generate_students(self, count: int) -> List[Dict]:
        used_emails = set()
        students: List[Dict] = []
        for i in range(count):
            while True:
                first = random.choice(FIRST_NAMES)
                last = random.choice(LAST_NAMES)
                email = f"{first.lower()}.{last.lower()}{random.randint(1, 9999)}@student.edu"
                if email not in used_emails:
                    used_emails.add(email)
                    break
            
            # Select a unique response, with variation for extra students
            response = STUDENT_RESPONSES[i % len(STUDENT_RESPONSES)]
            if i >= len(STUDENT_RESPONSES):
                # Add some variation for extra students
                response += f" I'm also interested in learning new skills and meeting new people!"
            
            students.append({
                "first_name": first,
                "last_name": last,
                "email": email,
                "password": f"password{i+1}23!",
                "response": response
            })
        return students

    def register(self, student: Dict) -> bool:
        try:
            resp = self.session.post(f"{self.base_url}/auth/register", json={
                "email": student["email"],
                "password": student["password"],
                "key": self.registration_key,
                "is_instructor": False
            })
            if resp.status_code == 201:
                print(f"✅ Registered: {student['first_name']} {student['last_name']} ({student['email']})")
                return True
            print(f"❌ Failed to register {student['email']}: {resp.status_code} - {resp.text}")
            return False
        except Exception as e:
            print(f"❌ Error registering {student['email']}: {e}")
            return False

    def login(self, student: Dict) -> bool:
        try:
            resp = self.session.post(f"{self.base_url}/auth/login", json={
                "email": student["email"],
                "password": student["password"]
            })
            if resp.status_code == 204:
                return True
            print(f"❌ Failed to login {student['email']}: {resp.status_code} - {resp.text}")
            return False
        except Exception as e:
            print(f"❌ Error logging in {student['email']}: {e}")
            return False

    def join_class(self, student: Dict) -> bool:
        try:
            resp = self.session.post(f"{self.base_url}/api/classes/join", json={"join_code": self.join_code})
            if resp.status_code == 200:
                print(f"📚 {student['first_name']} joined class {self.join_code}")
                return True
            print(f"❌ Failed to join class for {student['email']}: {resp.status_code} - {resp.text}")
            return False
        except Exception as e:
            print(f"❌ Error joining class for {student['email']}: {e}")
            return False

    def start_prompt_session(self, student: Dict) -> int:
        """Start a single prompt session that handles all submission requirements"""
        try:
            resp = self.session.post(f"{self.base_url}/api/deploy/{self.page_deployment_id}/prompt/session")
            if resp.status_code == 200:
                data = resp.json()
                sid = data.get("session_id", 0)
                print(f"📝 {student['first_name']} started prompt session (ID: {sid})")
                return sid
            print(f"❌ Failed to start session for {student['email']}: {resp.status_code} - {resp.text}")
            return 0
        except Exception as e:
            print(f"❌ Error starting session for {student['email']}: {e}")
            return 0

    def submit_text_response(self, student: Dict, submission_index: int = 0) -> bool:
        """Submit text response for introduction (submission_index 0)"""
        try:
            resp = self.session.post(f"{self.base_url}/api/deploy/{self.page_deployment_id}/prompt/submit", json={
                "submission_index": submission_index,
                "response": student["response"]
            })
            if resp.status_code == 200:
                print(f"✅ {student['first_name']} submitted introduction: '{student['response'][:50]}...'")
                return True
            print(f"❌ Failed to submit introduction for {student['email']}: {resp.status_code} - {resp.text}")
            return False
        except Exception as e:
            print(f"❌ Error submitting introduction for {student['email']}: {e}")
            return False

    def submit_pdf(self, student: Dict, pdf_path: Path, submission_index: int) -> bool:
        """Submit PDF file upload for specific submission requirement (1 or 2)"""
        try:
            with open(pdf_path, "rb") as f:
                files = {
                    "file": (pdf_path.name, f, "application/pdf")
                }
                data = {
                    "submission_index": str(submission_index)
                }
                resp = self.session.post(
                    f"{self.base_url}/api/deploy/{self.page_deployment_id}/prompt/submit_pdf",
                    files=files,
                    data=data,
                )
            if resp.status_code == 200:
                print(f"✅ {student['first_name']} uploaded PDF {submission_index}: {pdf_path.name}")
                return True
            print(f"❌ Failed to upload PDF {submission_index} for {student['email']}: {resp.status_code} - {resp.text}")
            return False
        except Exception as e:
            print(f"❌ Error uploading PDF {submission_index} for {student['email']}: {e}")
            return False

    def process_student(self, student: Dict, pdf_pair: Tuple[Path, Path]) -> bool:
        pdf1, pdf2 = pdf_pair
        print(f"\n🔄 Processing student: {student['first_name']} {student['last_name']}")
        print(f"   📄 PDF 1: {pdf1.name}")
        print(f"   📄 PDF 2: {pdf2.name}")

        # Fresh session per student
        self.session = requests.Session()

        if not self.register(student):
            return False
        time.sleep(0.1)

        if not self.join_class(student):
            return False
        time.sleep(0.1)

        # Start a single prompt session that handles all submission requirements
        sid = self.start_prompt_session(student)
        if sid == 0:
            return False
        time.sleep(0.1)

        # Submit to submission_index 0: Text introduction
        if not self.submit_text_response(student, submission_index=0):
            return False
        time.sleep(0.1)

        # Submit to submission_index 1: First PDF
        if not self.submit_pdf(student, pdf1, submission_index=1):
            return False
        time.sleep(0.1)

        # Submit to submission_index 2: Second PDF
        if not self.submit_pdf(student, pdf2, submission_index=2):
            return False

        return True


def main():
    parser = argparse.ArgumentParser(description="Generate students and submit text introductions + two different PDFs for a three-submission-requirement prompt deployment")
    parser.add_argument("--docs_dir", required=True, help="Absolute path to directory containing PDF files")
    parser.add_argument("--count", type=int, default=20, help="Number of students to simulate")
    parser.add_argument("--base_url", default=DEFAULT_BASE_URL, help="Backend base URL")
    parser.add_argument("--class_join_code", default=DEFAULT_CLASS_JOIN_CODE, help="Class join code")
    parser.add_argument("--deployment_id", default=DEFAULT_DEPLOYMENT_ID, help="Parent deployment UUID")

    args = parser.parse_args()

    docs_dir = Path(args.docs_dir)
    if not docs_dir.exists() or not docs_dir.is_dir():
        raise SystemExit(f"Provided docs_dir does not exist or is not a directory: {docs_dir}")

    print("=" * 60)
    print("🧪 STUDENT TEXT + TWO PDF GROUPING TEST DATA GENERATOR")
    print("=" * 60)
    print("📋 Configuration:")
    print(f"  - Base URL: {args.base_url}")
    print(f"  - Class Code: {args.class_join_code}")
    print(f"  - Parent Deployment ID: {args.deployment_id}")
    print(f"  - Page Deployment ID: {args.deployment_id}_page_1")
    print(f"  - Docs Dir: {docs_dir}")
    print(f"  - submission_index 0: Text introduction")
    print(f"  - submission_index 1: PDF upload #1")
    print(f"  - submission_index 2: PDF upload #2")

    # Quick server check
    try:
        ping = requests.get(f"{args.base_url}/auth/me", timeout=5)
        print("✅ Server reachable")
    except requests.exceptions.ConnectionError:
        print("❌ Server is not running. Please start the backend server first (python main.py)")
        return
    except Exception:
        print("✅ Server reachable (auth may require session)")

    driver = StudentPDFData(
        base_url=args.base_url,
        join_code=args.class_join_code,
        parent_deployment_id=args.deployment_id,
        docs_dir=docs_dir,
    )

    students = driver.generate_students(args.count)
    pdf_pairs = driver.pick_random_pdfs(args.count)

    print(f"\n🎯 Processing {len(students)} students with introductions and {len(pdf_pairs)} PDF pairs...")
    print(f"📊 Each student will submit:")
    print(f"  - 1 text introduction")
    print(f"  - 2 different PDF files")
    
    successful = 0
    failed = 0

    for i, (student, pdf_pair) in enumerate(zip(students, pdf_pairs), start=1):
        print(f"\n--- Student {i}/{len(students)} ---")
        if driver.process_student(student, pdf_pair):
            successful += 1
        else:
            failed += 1
        time.sleep(0.2)

    print("\n📊 TEST COMPLETE - SUMMARY:")
    print(f"  ✅ Successful: {successful}")
    print(f"  ❌ Failed: {failed}")
    rate = (successful / max(1, len(students))) * 100.0
    print(f"  📈 Success Rate: {rate:.1f}%")

    if successful > 0:
        print("\n🎉 Success! Text introductions and dual PDF submissions have been recorded.")
        print("🔬 You can now run the group assignment behavior that uses both text and document embeddings.")
        print(f"📈 Total submission requirements per student: 3 (1 text + 2 PDFs)")
        print(f"📊 Total submissions created: {successful * 3}")


if __name__ == "__main__":
    main()


