#!/usr/bin/env python3
"""
Test script to create student users and have them submit responses to two learning community
prompt questions for testing the grouping agent.

Usage:
  python test_learning_community_data.py \
    --count 50 \
    --base_url http://localhost:8000 \
    --class_join_code 99IBJ9HB \
    --deployment_id <PARENT_DEPLOYMENT_UUID> \
    --registration_key <REG_KEY>

Notes:
  - The script assumes the prompt page has 2 submission requirements:
    - submission_index 0: Ideas about adding learning community perspective to classrooms
    - submission_index 1: Examples and connections to other fields/situations
  - Both questions expect dynamic lists (mediaType: 'list')
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

# Learning community classroom implementation ideas
CLASSROOM_IMPLEMENTATION_IDEAS = [
    ["collaborative project spaces", "peer teaching circles", "community mentorship programs", "flexible seating arrangements", "student-led discussions"],
    ["interdisciplinary learning hubs", "community guest speakers", "real-world problem solving", "parent volunteer programs", "peer assessment systems"],
    ["cross-age learning partnerships", "community service projects", "shared learning goals", "democratic classroom governance", "collaborative curriculum design"],
    ["maker spaces for collaboration", "storytelling circles", "community knowledge sharing", "peer mediation programs", "group reflection sessions"],
    ["outdoor learning communities", "digital collaboration platforms", "community expert networks", "student learning portfolios", "team-based assessments"],
    ["inquiry-based learning groups", "community art projects", "peer tutoring programs", "family learning nights", "collaborative research teams"],
    ["learning circles", "community garden projects", "student leadership councils", "peer feedback systems", "shared resource libraries"],
    ["cooperative learning structures", "community partnerships", "student mentoring programs", "collaborative goal setting", "group problem solving"],
    ["peer learning networks", "community showcase events", "collaborative writing projects", "student choice in learning", "team teaching approaches"],
    ["learning commons areas", "community dialogue sessions", "peer support groups", "collaborative assessments", "shared learning spaces"],
    
    ["student-led conferences", "community learning exchanges", "peer coaching systems", "collaborative technology projects", "group investigation methods"],
    ["learning communities of practice", "community resource sharing", "peer review processes", "collaborative research projects", "team-based learning"],
    ["student learning committees", "community knowledge banks", "peer mentorship circles", "collaborative problem-based learning", "group reflection practices"],
    ["democratic learning structures", "community engagement projects", "peer learning partnerships", "collaborative inquiry processes", "shared decision making"],
    ["learning partnership programs", "community expert mentors", "peer teaching opportunities", "collaborative creative projects", "group learning contracts"],
    ["student voice initiatives", "community learning festivals", "peer support networks", "collaborative skill building", "team reflection sessions"],
    ["learning democracy projects", "community knowledge sharing", "peer learning labs", "collaborative discovery learning", "group portfolio development"],
    ["student-centered learning hubs", "community learning circles", "peer facilitation training", "collaborative research methods", "team presentation formats"],
    ["learning community councils", "community wisdom sharing", "peer learning exchanges", "collaborative project management", "group assessment rubrics"],
    ["democratic classroom practices", "community learning partnerships", "peer teaching workshops", "collaborative learning designs", "team building activities"],
    
    ["student learning cooperatives", "community knowledge networks", "peer learning facilitators", "collaborative inquiry teams", "group learning objectives"],
    ["learning democracy initiatives", "community education programs", "peer mentoring systems", "collaborative research groups", "team learning outcomes"],
    ["student governance structures", "community learning resources", "peer teaching methods", "collaborative problem solving", "group reflection tools"],
    ["learning partnership models", "community expert panels", "peer learning communities", "collaborative project work", "team assessment strategies"],
    ["student-led learning groups", "community knowledge exchanges", "peer support systems", "collaborative investigation", "group learning plans"],
    ["democratic education practices", "community learning hubs", "peer teaching circles", "collaborative research design", "team learning goals"],
    ["learning community structures", "community resource networks", "peer learning processes", "collaborative inquiry methods", "group reflection practices"],
    ["student voice platforms", "community learning initiatives", "peer mentorship programs", "collaborative project teams", "team learning assessments"],
    ["learning democracy forums", "community knowledge sharing", "peer learning support", "collaborative research teams", "group learning evaluation"],
    ["student-centered communities", "community learning partnerships", "peer teaching networks", "collaborative learning projects", "team reflection sessions"],
    
    ["learning circle methodologies", "community engagement strategies", "peer learning frameworks", "collaborative inquiry approaches", "group learning practices"],
    ["student leadership development", "community learning networks", "peer teaching techniques", "collaborative research methods", "team building strategies"],
    ["democratic learning approaches", "community knowledge systems", "peer mentoring approaches", "collaborative project methods", "group assessment tools"],
    ["learning partnership frameworks", "community expert integration", "peer learning strategies", "collaborative team structures", "group reflection methods"],
    ["student-driven learning models", "community resource integration", "peer support frameworks", "collaborative inquiry structures", "team learning processes"],
    ["learning community approaches", "community partnership models", "peer teaching frameworks", "collaborative research approaches", "group learning strategies"],
    ["democratic classroom models", "community learning systems", "peer mentoring frameworks", "collaborative project structures", "team reflection approaches"],
    ["student voice methodologies", "community engagement models", "peer learning techniques", "collaborative team approaches", "group assessment methods"],
    ["learning democracy structures", "community knowledge frameworks", "peer support methodologies", "collaborative inquiry techniques", "team learning tools"],
    ["student-centered approaches", "community learning frameworks", "peer teaching strategies", "collaborative research structures", "group reflection tools"],
    
    ["learning circle structures", "community partnership frameworks", "peer mentoring techniques", "collaborative project approaches", "team learning methods"],
    ["democratic education models", "community resource frameworks", "peer learning methodologies", "collaborative inquiry tools", "group assessment approaches"],
    ["student governance models", "community learning strategies", "peer teaching approaches", "collaborative research techniques", "team reflection methods"],
    ["learning partnership strategies", "community expert frameworks", "peer support techniques", "collaborative team methods", "group learning tools"],
    ["student-led frameworks", "community knowledge strategies", "peer learning approaches", "collaborative project techniques", "team assessment tools"],
    ["learning community methods", "community engagement frameworks", "peer teaching tools", "collaborative inquiry strategies", "group reflection techniques"],
    ["democratic classroom frameworks", "community learning approaches", "peer mentoring tools", "collaborative research methods", "team learning techniques"],
    ["student voice frameworks", "community partnership strategies", "peer learning tools", "collaborative team techniques", "group assessment strategies"],
    ["learning democracy methods", "community resource strategies", "peer support tools", "collaborative inquiry methods", "team learning approaches"],
    ["student-centered frameworks", "community learning tools", "peer teaching methods", "collaborative research strategies", "group reflection approaches"]
]

# Examples and connections to other fields/situations
FIELD_CONNECTIONS_EXAMPLES = [
    ["workplace team collaboration", "medical peer consultation", "scientific research communities", "startup incubator models", "open source development"],
    ["sports team dynamics", "musical ensemble practices", "theater collaborative creation", "architectural design teams", "engineering project groups"],
    ["indigenous knowledge sharing", "community farming cooperatives", "neighborhood watch programs", "volunteer organization structures", "social movement networks"],
    ["online gaming communities", "maker space collaborations", "artist collective approaches", "writers' workshop methods", "academic conference networking"],
    ["healthcare team models", "crisis response coordination", "environmental action groups", "community garden initiatives", "local business networks"],
    ["digital nomad communities", "remote work collaboration", "virtual reality social spaces", "AI development teams", "blockchain communities"],
    ["disaster relief coordination", "community organizing methods", "social justice movements", "grassroots activism", "neighborhood councils"],
    ["professional learning networks", "industry mentorship programs", "trade guild structures", "apprenticeship models", "professional associations"],
    ["therapeutic community models", "support group dynamics", "rehabilitation programs", "counseling group methods", "peer recovery networks"],
    ["innovation lab practices", "design thinking workshops", "hackathon methodologies", "creative brainstorming sessions", "collaborative design processes"],
    
    ["startup accelerator programs", "venture capital networks", "entrepreneurship communities", "business incubator models", "professional development groups"],
    ["research collaboration networks", "academic peer review systems", "scholarly community practices", "conference presentation formats", "journal editorial boards"],
    ["environmental conservation groups", "sustainability initiatives", "climate action networks", "green technology communities", "renewable energy cooperatives"],
    ["cultural exchange programs", "international student networks", "language learning partnerships", "cross-cultural dialogue groups", "global citizenship initiatives"],
    ["technology user communities", "software development forums", "digital maker spaces", "coding bootcamp models", "tech meetup groups"],
    ["mental health support networks", "wellness community programs", "mindfulness practice groups", "therapeutic community models", "peer counseling systems"],
    ["artistic collaboration networks", "creative community spaces", "interdisciplinary art projects", "cultural festival organizations", "community theater groups"],
    ["citizen science projects", "community data collection", "participatory research methods", "grassroots monitoring programs", "local knowledge documentation"],
    ["social enterprise models", "cooperative business structures", "community-supported agriculture", "local currency systems", "time banking networks"],
    ["digital literacy programs", "community technology centers", "peer tech support groups", "intergenerational learning", "digital divide solutions"],
    
    ["refugee resettlement programs", "immigrant support networks", "cultural integration initiatives", "community welcome programs", "cross-cultural mentorship"],
    ["outdoor education programs", "adventure learning groups", "wilderness therapy models", "environmental education centers", "nature-based learning"],
    ["food justice movements", "community kitchen programs", "urban farming initiatives", "nutrition education networks", "sustainable food systems"],
    ["housing cooperative models", "community land trusts", "neighborhood development groups", "affordable housing initiatives", "co-housing communities"],
    ["transportation alternatives", "bike sharing programs", "carpooling networks", "public transit advocacy", "walkable community design"],
    ["renewable energy cooperatives", "community solar programs", "energy efficiency networks", "green building initiatives", "sustainable technology adoption"],
    ["water conservation groups", "watershed protection networks", "community water systems", "environmental monitoring programs", "resource management cooperatives"],
    ["waste reduction initiatives", "recycling cooperatives", "zero waste communities", "circular economy projects", "community composting programs"],
    ["local food systems", "farmers market networks", "community-supported agriculture", "seed sharing programs", "food preservation groups"],
    ["artisan craft cooperatives", "maker space networks", "skill sharing communities", "repair cafe movements", "tool library systems"],
    
    ["community health programs", "peer health education", "wellness coaching networks", "fitness group dynamics", "public health initiatives"],
    ["elder care communities", "intergenerational housing", "aging in place networks", "senior learning programs", "wisdom sharing initiatives"],
    ["youth development programs", "mentorship networks", "leadership training groups", "youth council structures", "peer education models"],
    ["disability rights advocacy", "accessibility improvement groups", "assistive technology networks", "inclusive design communities", "disability support networks"],
    ["LGBTQ+ support communities", "pride organization networks", "safe space initiatives", "advocacy group structures", "community center programs"],
    ["racial justice organizations", "anti-racism education groups", "community dialogue programs", "equity initiative networks", "social justice coalitions"],
    ["women's empowerment networks", "professional women's groups", "girls' leadership programs", "feminist organization structures", "gender equity initiatives"],
    ["veterans support networks", "military family communities", "transition assistance programs", "veteran mentorship groups", "service member support systems"],
    ["faith community networks", "interfaith dialogue groups", "spiritual learning circles", "religious education programs", "contemplative practice communities"],
    ["peace building initiatives", "conflict resolution programs", "restorative justice practices", "mediation training groups", "community healing circles"],
    
    ["emergency preparedness groups", "disaster response networks", "community resilience programs", "crisis communication systems", "mutual aid societies"],
    ["local government participation", "civic engagement initiatives", "public policy advocacy", "community organizing methods", "democratic participation programs"],
    ["neighborhood improvement groups", "community beautification projects", "public space development", "local history preservation", "cultural heritage initiatives"],
    ["small business networks", "local economy development", "entrepreneurship support groups", "community investment cooperatives", "local market systems"],
    ["educational reform movements", "school improvement initiatives", "parent-teacher collaboration", "community school models", "educational equity programs"],
    ["library community programs", "reading group networks", "literacy initiatives", "community learning centers", "knowledge sharing systems"],
    ["museum education programs", "cultural institution networks", "community art initiatives", "historical society groups", "heritage preservation projects"],
    ["park and recreation programs", "outdoor activity groups", "community sports leagues", "recreation center networks", "public space advocacy"],
    ["transportation advocacy groups", "infrastructure improvement initiatives", "public transit networks", "pedestrian safety programs", "community mobility projects"],
    ["technology access programs", "digital inclusion initiatives", "community broadband projects", "tech literacy training", "digital equity programs"]
]


class LearningCommunityTestData:
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
            
            # Select classroom ideas from the list, with variation for extra students
            classroom_ideas = CLASSROOM_IMPLEMENTATION_IDEAS[i % len(CLASSROOM_IMPLEMENTATION_IDEAS)]
            if i >= len(CLASSROOM_IMPLEMENTATION_IDEAS):
                # Mix and match from different sets for variety
                base_set = CLASSROOM_IMPLEMENTATION_IDEAS[i % len(CLASSROOM_IMPLEMENTATION_IDEAS)]
                random_set = random.choice(CLASSROOM_IMPLEMENTATION_IDEAS)
                # Take 3 from base set and 2 from random set
                classroom_ideas = base_set[:3] + random_set[:2]
                random.shuffle(classroom_ideas)
            
            # Select field connections from the list, with variation for extra students
            field_connections = FIELD_CONNECTIONS_EXAMPLES[i % len(FIELD_CONNECTIONS_EXAMPLES)]
            if i >= len(FIELD_CONNECTIONS_EXAMPLES):
                # Mix and match from different sets for variety
                base_set = FIELD_CONNECTIONS_EXAMPLES[i % len(FIELD_CONNECTIONS_EXAMPLES)]
                random_set = random.choice(FIELD_CONNECTIONS_EXAMPLES)
                # Take 3 from base set and 2 from random set
                field_connections = base_set[:3] + random_set[:2]
                random.shuffle(field_connections)
            
            students.append({
                "first_name": first,
                "last_name": last,
                "email": email,
                "password": f"password{i+1}23!",
                "classroom_ideas": classroom_ideas,
                "field_connections": field_connections
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

    def submit_classroom_ideas(self, student: Dict, submission_index: int = 0) -> bool:
        """Submit list of classroom implementation ideas (submission_index 0)"""
        try:
            # Format ideas as JSON array for list mediaType
            ideas_json = json.dumps(student["classroom_ideas"])
            
            resp = self.session.post(f"{self.base_url}/api/deploy/{self.page_deployment_id}/prompt/submit", json={
                "submission_index": submission_index,
                "response": ideas_json
            })
            if resp.status_code == 200:
                ideas_str = ", ".join(student["classroom_ideas"][:3]) + "..."
                print(f"✅ {student['first_name']} submitted classroom ideas: {ideas_str}")
                return True
            print(f"❌ Failed to submit classroom ideas for {student['email']}: {resp.status_code} - {resp.text}")
            return False
        except Exception as e:
            print(f"❌ Error submitting classroom ideas for {student['email']}: {e}")
            return False

    def submit_field_connections(self, student: Dict, submission_index: int = 1) -> bool:
        """Submit list of field connections and examples (submission_index 1)"""
        try:
            # Format connections as JSON array for list mediaType
            connections_json = json.dumps(student["field_connections"])
            
            resp = self.session.post(f"{self.base_url}/api/deploy/{self.page_deployment_id}/prompt/submit", json={
                "submission_index": submission_index,
                "response": connections_json
            })
            if resp.status_code == 200:
                connections_str = ", ".join(student["field_connections"][:3]) + "..."
                print(f"✅ {student['first_name']} submitted field connections: {connections_str}")
                return True
            print(f"❌ Failed to submit field connections for {student['email']}: {resp.status_code} - {resp.text}")
            return False
        except Exception as e:
            print(f"❌ Error submitting field connections for {student['email']}: {e}")
            return False

    def process_student(self, student: Dict) -> bool:
        print(f"\n🔄 Processing student: {student['first_name']} {student['last_name']}")
        classroom_preview = ", ".join(student["classroom_ideas"][:2]) + "..."
        connections_preview = ", ".join(student["field_connections"][:2]) + "..."
        print(f"   💡 Classroom ideas: {classroom_preview}")
        print(f"   🔗 Field connections: {connections_preview}")

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

        # Submit to submission_index 0: Classroom implementation ideas
        if not self.submit_classroom_ideas(student, submission_index=0):
            return False
        time.sleep(0.1)

        # Submit to submission_index 1: Field connections and examples
        if not self.submit_field_connections(student, submission_index=1):
            return False

        return True


def main():
    parser = argparse.ArgumentParser(description="Generate students and submit learning community responses for grouping testing")
    parser.add_argument("--count", type=int, default=50, help="Number of students to simulate")
    parser.add_argument("--base_url", default=DEFAULT_BASE_URL, help="Backend base URL")
    parser.add_argument("--class_join_code", default=DEFAULT_CLASS_JOIN_CODE, help="Class join code")
    parser.add_argument("--deployment_id", default=DEFAULT_DEPLOYMENT_ID, help="Parent deployment UUID")

    args = parser.parse_args()

    print("=" * 70)
    print("🧪 LEARNING COMMUNITY GROUPING TEST DATA GENERATOR")
    print("=" * 70)
    print("📋 Configuration:")
    print(f"  - Base URL: {args.base_url}")
    print(f"  - Class Code: {args.class_join_code}")
    print(f"  - Parent Deployment ID: {args.deployment_id}")
    print(f"  - Page Deployment ID: {args.deployment_id}_page_1")
    print(f"  - submission_index 0: Classroom implementation ideas")
    print(f"  - submission_index 1: Field connections and examples")
    print(f"  - Available classroom idea sets: {len(CLASSROOM_IMPLEMENTATION_IDEAS)}")
    print(f"  - Available field connection sets: {len(FIELD_CONNECTIONS_EXAMPLES)}")

    # Quick server check
    try:
        ping = requests.get(f"{args.base_url}/auth/me", timeout=5)
        print("✅ Server reachable")
    except requests.exceptions.ConnectionError:
        print("❌ Server is not running. Please start the backend server first (python main.py)")
        return
    except Exception:
        print("✅ Server reachable (auth may require session)")

    driver = LearningCommunityTestData(
        base_url=args.base_url,
        join_code=args.class_join_code,
        parent_deployment_id=args.deployment_id,
    )

    students = driver.generate_students(args.count)

    print(f"\n🎯 Processing {len(students)} students with learning community responses...")
    print(f"📊 Each student will submit:")
    print(f"  - 1 list of classroom implementation ideas")
    print(f"  - 1 list of field connections and examples")
    print(f"📝 Sample classroom ideas from first student: {', '.join(students[0]['classroom_ideas'][:3])}...")
    print(f"📝 Sample field connections from first student: {', '.join(students[0]['field_connections'][:3])}...")
    
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
        print("\n🎉 Success! Learning community responses have been submitted.")
        print("🔬 You can now run the group assignment behavior that uses text embeddings.")
        print(f"📈 Total submissions created: {successful * 2}")
        print(f"📊 Classroom ideas recorded: {successful}")
        print(f"📊 Field connections recorded: {successful}")
        print("\n💡 Example prompt questions answered:")
        print('   Question 1: "Please add any ideas or insights you may have about how the')
        print('   learning community perspective could be added into classrooms..."')
        print('   Question 2: "Please add any examples you can think of, or connections to')
        print('   other fields or situations..."')


if __name__ == "__main__":
    main()
