#!/usr/bin/env python3
"""
Test script to create student users and have them submit lists of 5 key words/phrases
about their interests in the course for testing the grouping agent.

Usage:
  python test_course_interests_grouping_data.py \
    --count 50 \
    --base_url http://localhost:8000 \
    --class_join_code 99IBJ9HB \
    --deployment_id <PARENT_DEPLOYMENT_UUID> \
    --registration_key <REG_KEY>

Notes:
  - The script assumes the prompt page has 1 submission requirement:
    - submission_index 0: List of 5 interests (mediaType: 'list')
  - The prompt asks for 5 key words/phrases about course interests
  - You can override defaults via CLI flags.
"""

import argparse
import time
import random
import requests
import json
from typing import List, Dict


DEFAULT_BASE_URL = "http://localhost:8000"
DEFAULT_CLASS_JOIN_CODE = "99IBJ9HB"
DEFAULT_DEPLOYMENT_ID = "ff540e39-480f-4d1c-aef2-a530659dbbf1"
DEFAULT_REGISTRATION_KEY = "3cXr92JtN4"


FIRST_NAMES = [
    "Alice", "Bob", "Charlie", "Diana", "Eve", "Frank", "Grace", "Henry",
    "Ivy", "Jack", "Kate", "Liam", "Mia", "Nathan", "Olivia", "Peter",
    "Quinn", "Rachel", "Sam", "Tara", "Uma", "Victor", "Wendy", "Xander",
    "Yara", "Zoe", "Adam", "Beth", "Carl", "Delia", "Emma", "Felix",
    "Gina", "Hugo", "Iris", "James", "Kara", "Leo", "Maya", "Nick",
    "Opal", "Pablo", "Quincy", "Ruby", "Sofia", "Tyler", "Uma", "Vera",
    "Will", "Xara", "Yuki", "Zara", "Alex", "Blake", "Casey", "Drew"
]

LAST_NAMES = [
    "Anderson", "Brown", "Chen", "Davis", "Evans", "Fisher", "Garcia", "Harris",
    "Johnson", "Kim", "Lee", "Miller", "Nelson", "O'Connor", "Patel", "Quinn",
    "Rodriguez", "Smith", "Taylor", "Underwood", "Valdez", "Wilson", "Xu", "Young", "Zhang",
    "Clarke", "Martinez", "White", "Thompson", "Moore", "Jackson", "Martin", "Garcia",
    "Robinson", "Lewis", "Walker", "Hall", "Allen", "King", "Wright", "Scott", "Torres",
    "Nguyen", "Hill", "Flores", "Green", "Adams", "Baker", "Gonzalez", "Carter", "Mitchell"
]

# 50+ diverse sets of 5 course interests/keywords each
COURSE_INTERESTS = [
    ["AI tutors", "personalized learning", "adaptive systems", "learning analytics", "intelligent feedback"],
    ["workplace learning", "professional development", "skills training", "corporate education", "microlearning"],
    ["computer-mediated assessments", "automated grading", "formative assessment", "peer evaluation", "rubric design"],
    ["educational games", "gamification", "serious games", "game-based learning", "educational simulations"],
    ["virtual reality", "immersive learning", "3D environments", "VR classrooms", "spatial learning"],
    ["learning assistants", "chatbots", "AI companions", "peer tutoring", "collaborative learning"],
    ["makerspaces", "hands-on learning", "project-based learning", "STEM education", "creative spaces"],
    ["online learning", "e-learning platforms", "distance education", "MOOCs", "blended learning"],
    ["mobile learning", "m-learning", "smartphone education", "tablet learning", "ubiquitous computing"],
    ["learning management systems", "LMS design", "course management", "student tracking", "gradebook systems"],
    
    ["natural language processing", "text analysis", "automated essay scoring", "language learning", "conversation AI"],
    ["machine learning", "predictive modeling", "student success prediction", "dropout prevention", "data mining"],
    ["adaptive content", "personalization algorithms", "recommendation systems", "content curation", "learning paths"],
    ["accessibility technology", "inclusive design", "assistive technology", "universal design", "disability support"],
    ["collaborative platforms", "team learning", "peer interaction", "social learning", "group projects"],
    ["assessment automation", "plagiarism detection", "academic integrity", "proctoring systems", "test security"],
    ["learning spaces", "classroom design", "physical environments", "flexible spaces", "technology integration"],
    ["teacher training", "professional development", "educator support", "pedagogical knowledge", "teaching methods"],
    ["student engagement", "motivation systems", "behavioral psychology", "attention management", "participation tracking"],
    ["curriculum design", "instructional design", "learning objectives", "standards alignment", "competency mapping"],
    
    ["flipped classrooms", "blended learning", "hybrid education", "active learning", "student-centered learning"],
    ["blockchain education", "credentialing", "digital badges", "certification systems", "skill verification"],
    ["augmented reality", "AR applications", "mixed reality", "overlay learning", "contextual information"],
    ["learning analytics", "educational data mining", "student behavior analysis", "performance metrics", "dashboard design"],
    ["cognitive science", "learning theory", "memory research", "attention studies", "metacognition"],
    ["multilingual education", "language acquisition", "translation technology", "cultural adaptation", "global learning"],
    ["STEM education", "science simulations", "math visualization", "engineering design", "computational thinking"],
    ["arts integration", "creative learning", "multimedia education", "digital storytelling", "visual learning"],
    ["special needs education", "individualized learning", "therapeutic interventions", "behavioral support", "intervention strategies"],
    ["rural education", "remote learning", "connectivity challenges", "resource sharing", "community learning"],
    
    ["peer review systems", "collaborative assessment", "social learning", "community building", "knowledge sharing"],
    ["microlearning", "bite-sized content", "just-in-time learning", "spaced repetition", "cognitive load theory"],
    ["video-based learning", "multimedia instruction", "interactive video", "lecture capture", "video analytics"],
    ["simulation-based learning", "virtual labs", "experiential learning", "scenario-based training", "skill practice"],
    ["competency-based education", "mastery learning", "skill assessment", "progression tracking", "outcome measurement"],
    ["informal learning", "self-directed learning", "lifelong learning", "continuous education", "learning communities"],
    ["emotional intelligence", "social-emotional learning", "empathy training", "interpersonal skills", "communication"],
    ["critical thinking", "problem-solving", "analytical skills", "reasoning development", "decision making"],
    ["creativity enhancement", "innovation training", "design thinking", "brainstorming tools", "idea generation"],
    ["time management", "study skills", "learning strategies", "self-regulation", "academic planning"],
    
    ["digital literacy", "information literacy", "media literacy", "technology skills", "digital citizenship"],
    ["coding education", "programming instruction", "computational literacy", "algorithm understanding", "software development"],
    ["robotics education", "physical computing", "embedded systems", "automation learning", "mechanical design"],
    ["data science education", "statistical literacy", "data visualization", "research methods", "quantitative analysis"],
    ["cybersecurity education", "digital safety", "privacy protection", "secure computing", "threat awareness"],
    ["entrepreneurship education", "business skills", "startup culture", "innovation mindset", "leadership development"],
    ["environmental education", "sustainability learning", "climate science", "conservation awareness", "green technology"],
    ["health education", "wellness programs", "mental health awareness", "nutrition education", "fitness tracking"],
    ["financial literacy", "economic education", "investment knowledge", "budgeting skills", "financial planning"],
    ["communication skills", "presentation training", "public speaking", "writing improvement", "listening skills"],
    
    ["cross-cultural learning", "global perspectives", "cultural competency", "international education", "diversity awareness"],
    ["project management", "organizational skills", "team coordination", "resource planning", "timeline management"],
    ["research methodology", "scientific inquiry", "evidence-based learning", "hypothesis testing", "experimental design"],
    ["ethics education", "moral reasoning", "value systems", "ethical decision making", "social responsibility"],
    ["philosophy of education", "pedagogical theory", "learning philosophy", "educational foundations", "teaching beliefs"],
    ["neuroscience applications", "brain-based learning", "cognitive enhancement", "memory improvement", "attention training"],
    ["quantum computing education", "advanced algorithms", "computational complexity", "parallel processing", "quantum mechanics"],
    ["biotechnology education", "genetic engineering", "biomedical applications", "laboratory techniques", "molecular biology"],
    ["space education", "astronomy learning", "space exploration", "satellite technology", "planetary science"],
    ["ocean science education", "marine biology", "oceanography", "climate systems", "marine conservation"]
]


class CourseInterestsTestData:
    def __init__(self, base_url: str, join_code: str, parent_deployment_id: str):
        self.base_url = base_url.rstrip("/")
        self.join_code = join_code
        self.parent_deployment_id = parent_deployment_id
        self.page_deployment_id = f"{parent_deployment_id}_page_1"
        self.registration_key = "3cXr92JtN4"
        self.session = requests.Session()

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
            
            # Select interests from the list, with variation for extra students
            interests = COURSE_INTERESTS[i % len(COURSE_INTERESTS)]
            if i >= len(COURSE_INTERESTS):
                # Mix and match from different sets for variety
                base_set = COURSE_INTERESTS[i % len(COURSE_INTERESTS)]
                random_set = random.choice(COURSE_INTERESTS)
                # Take 3 from base set and 2 from random set
                interests = base_set[:3] + random_set[:2]
                random.shuffle(interests)
            
            students.append({
                "first_name": first,
                "last_name": last,
                "email": email,
                "password": f"password{i+1}23!",
                "interests": interests
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
        """Start a prompt session"""
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

    def submit_interests_list(self, student: Dict, submission_index: int = 0) -> bool:
        """Submit list of course interests (submission_index 0)"""
        try:
            # Format interests as JSON array for list mediaType
            interests_json = json.dumps(student["interests"])
            
            resp = self.session.post(f"{self.base_url}/api/deploy/{self.page_deployment_id}/prompt/submit", json={
                "submission_index": submission_index,
                "response": interests_json
            })
            if resp.status_code == 200:
                interests_str = ", ".join(student["interests"])
                print(f"✅ {student['first_name']} submitted interests: {interests_str}")
                return True
            print(f"❌ Failed to submit interests for {student['email']}: {resp.status_code} - {resp.text}")
            return False
        except Exception as e:
            print(f"❌ Error submitting interests for {student['email']}: {e}")
            return False

    def process_student(self, student: Dict) -> bool:
        print(f"\n🔄 Processing student: {student['first_name']} {student['last_name']}")
        interests_preview = ", ".join(student["interests"][:3]) + "..."
        print(f"   📋 Interests: {interests_preview}")

        # Fresh session per student
        self.session = requests.Session()

        if not self.register(student):
            return False
        time.sleep(0.1)

        if not self.join_class(student):
            return False
        time.sleep(0.1)

        # Start a prompt session
        sid = self.start_prompt_session(student)
        if sid == 0:
            return False
        time.sleep(0.1)

        # Submit to submission_index 0: List of interests
        if not self.submit_interests_list(student, submission_index=0):
            return False

        return True


def main():
    parser = argparse.ArgumentParser(description="Generate students and submit lists of 5 course interests for grouping testing")
    parser.add_argument("--count", type=int, default=50, help="Number of students to simulate")
    parser.add_argument("--base_url", default=DEFAULT_BASE_URL, help="Backend base URL")
    parser.add_argument("--class_join_code", default=DEFAULT_CLASS_JOIN_CODE, help="Class join code")
    parser.add_argument("--deployment_id", default=DEFAULT_DEPLOYMENT_ID, help="Parent deployment UUID")

    args = parser.parse_args()

    print("=" * 70)
    print("🧪 COURSE INTERESTS GROUPING TEST DATA GENERATOR")
    print("=" * 70)
    print("📋 Configuration:")
    print(f"  - Base URL: {args.base_url}")
    print(f"  - Class Code: {args.class_join_code}")
    print(f"  - Parent Deployment ID: {args.deployment_id}")
    print(f"  - Page Deployment ID: {args.deployment_id}_page_1")
    print(f"  - submission_index 0: List of 5 course interests")
    print(f"  - Available interest sets: {len(COURSE_INTERESTS)}")

    # Quick server check
    try:
        ping = requests.get(f"{args.base_url}/auth/me", timeout=5)
        print("✅ Server reachable")
    except requests.exceptions.ConnectionError:
        print("❌ Server is not running. Please start the backend server first (python main.py)")
        return
    except Exception:
        print("✅ Server reachable (auth may require session)")

    driver = CourseInterestsTestData(
        base_url=args.base_url,
        join_code=args.class_join_code,
        parent_deployment_id=args.deployment_id,
    )

    students = driver.generate_students(args.count)

    print(f"\n🎯 Processing {len(students)} students with course interests...")
    print(f"📊 Each student will submit:")
    print(f"  - 1 list of 5 course interests/keywords")
    print(f"📝 Sample interests from first student: {', '.join(students[0]['interests'])}")
    
    successful = 0
    failed = 0

    for i, student in enumerate(students, start=1):
        print(f"\n--- Student {i}/{len(students)} ---")
        if driver.process_student(student):
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
        print("\n🎉 Success! Course interest lists have been submitted.")
        print("🔬 You can now run the group assignment behavior that uses text embeddings.")
        print(f"📈 Total submissions created: {successful}")
        print(f"📊 Total interests recorded: {successful * 5}")
        print("\n💡 Example prompt question answered:")
        print('   "Type 5 key words or phrases that best describe your interests or ideas')
        print('    about this course. Try to be specific (examples: AI tutors; workplace')
        print('    learning; computer-mediated assessments; games; virtual reality; etc.)"')


if __name__ == "__main__":
    main()
