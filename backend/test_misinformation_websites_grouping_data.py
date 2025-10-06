#!/usr/bin/env python3
"""
Test script to create student users and have them submit websiteInfo data
about misinformation and fact-checking resources for testing the grouping agent.

Usage:
  python test_misinformation_websites_grouping_data.py \
    --count 30 \
    --base_url http://localhost:8000 \
    --class_join_code 99IBJ9HB \
    --deployment_id <PARENT_DEPLOYMENT_UUID> \
    --registration_key <REG_KEY>

Notes:
  - The script assumes the prompt page has 1 submission requirement:
    - submission_index 0: Website info (mediaType: 'websiteInfo')
  - Each student submits JSON with: url, name, purpose, platform
  - Websites cover various misinformation topics and fact-checking platforms
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

# 50+ diverse website entries about misinformation, fact-checking, and media literacy
MISINFORMATION_WEBSITES = [
    {
        "url": "https://www.snopes.com",
        "name": "Snopes",
        "purpose": "Fact-checking urban legends, rumors, and misinformation",
        "platform": "Independent fact-checking website"
    },
    {
        "url": "https://www.factcheck.org",
        "name": "FactCheck.org",
        "purpose": "Monitoring factual accuracy of political claims",
        "platform": "Non-partisan fact-checking organization"
    },
    {
        "url": "https://www.politifact.com",
        "name": "PolitiFact",
        "purpose": "Rating accuracy of political statements with Truth-O-Meter",
        "platform": "Political fact-checking website"
    },
    {
        "url": "https://fullfact.org",
        "name": "Full Fact",
        "purpose": "UK-based fact-checking charity for truthful information",
        "platform": "Independent fact-checking organization"
    },
    {
        "url": "https://www.mediamatters.org",
        "name": "Media Matters",
        "purpose": "Monitoring conservative misinformation in media",
        "platform": "Progressive media watchdog"
    },
    {
        "url": "https://www.bellingcat.com",
        "name": "Bellingcat",
        "purpose": "Open-source investigative journalism and verification",
        "platform": "Investigative journalism collective"
    },
    {
        "url": "https://firstdraftnews.org",
        "name": "First Draft",
        "purpose": "Fighting misinformation and disinformation online",
        "platform": "Research and training organization"
    },
    {
        "url": "https://www.poynter.org/ifcn",
        "name": "International Fact-Checking Network",
        "purpose": "Promoting best practices in fact-checking worldwide",
        "platform": "Professional fact-checking network"
    },
    {
        "url": "https://www.checkology.org",
        "name": "Checkology",
        "purpose": "Teaching students how to identify credible information",
        "platform": "Educational media literacy platform"
    },
    {
        "url": "https://www.newsguardtech.com",
        "name": "NewsGuard",
        "purpose": "Rating news website credibility and reliability",
        "platform": "News rating and reliability tool"
    },
    
    {
        "url": "https://www.adfontesmedia.com",
        "name": "Ad Fontes Media",
        "purpose": "Mapping media bias and reliability scientifically",
        "platform": "Media bias assessment organization"
    },
    {
        "url": "https://misinforeview.hks.harvard.edu",
        "name": "Misinformation Review",
        "purpose": "Academic research on misinformation and its effects",
        "platform": "Harvard Kennedy School research journal"
    },
    {
        "url": "https://www.teyit.org",
        "name": "Teyit",
        "purpose": "Turkish fact-checking and verification platform",
        "platform": "Independent fact-checking organization"
    },
    {
        "url": "https://africacheck.org",
        "name": "Africa Check",
        "purpose": "Fact-checking claims across African continent",
        "platform": "African fact-checking network"
    },
    {
        "url": "https://www.stopfake.org",
        "name": "StopFake",
        "purpose": "Countering Russian disinformation about Ukraine",
        "platform": "Anti-propaganda fact-checking project"
    },
    {
        "url": "https://www.altnews.in",
        "name": "Alt News",
        "purpose": "Fact-checking and debunking misinformation in India",
        "platform": "Indian fact-checking website"
    },
    {
        "url": "https://www.maldita.es",
        "name": "Maldita",
        "purpose": "Spanish fact-checking and misinformation combat",
        "platform": "Spanish fact-checking organization"
    },
    {
        "url": "https://www.sciencefeedback.co",
        "name": "Science Feedback",
        "purpose": "Fact-checking scientific claims and health information",
        "platform": "Scientific fact-checking network"
    },
    {
        "url": "https://healthfeedback.org",
        "name": "Health Feedback",
        "purpose": "Verifying health and medical information accuracy",
        "platform": "Health misinformation monitoring"
    },
    {
        "url": "https://climatefeedback.org",
        "name": "Climate Feedback",
        "purpose": "Evaluating climate science accuracy in media",
        "platform": "Climate science fact-checking"
    },
    
    {
        "url": "https://www.thisisnotatest.org",
        "name": "This Is Not a Test",
        "purpose": "Analyzing election misinformation and interference",
        "platform": "Election integrity monitoring"
    },
    {
        "url": "https://reporterslab.org",
        "name": "Duke Reporters' Lab",
        "purpose": "Tracking global fact-checking trends and tools",
        "platform": "Academic fact-checking research"
    },
    {
        "url": "https://www.misinfosec.com",
        "name": "MisinfoSec",
        "purpose": "Applying security frameworks to misinformation",
        "platform": "Information security approach"
    },
    {
        "url": "https://correctiv.org",
        "name": "CORRECTIV",
        "purpose": "German investigative journalism and fact-checking",
        "platform": "Non-profit investigative newsroom"
    },
    {
        "url": "https://www.logically.ai",
        "name": "Logically",
        "purpose": "AI-powered fact-checking and content moderation",
        "platform": "Technology fact-checking platform"
    },
    {
        "url": "https://www.truthorfiction.com",
        "name": "Truth or Fiction",
        "purpose": "Verifying viral stories and internet rumors",
        "platform": "Rumor verification website"
    },
    {
        "url": "https://www.hoax-slayer.net",
        "name": "Hoax-Slayer",
        "purpose": "Debunking email hoaxes and online scams",
        "platform": "Hoax debunking resource"
    },
    {
        "url": "https://leadstories.com",
        "name": "Lead Stories",
        "purpose": "Fact-checking viral content and trending claims",
        "platform": "Real-time fact-checking platform"
    },
    {
        "url": "https://www.polygraph.info",
        "name": "Polygraph.info",
        "purpose": "Fact-checking Russian disinformation",
        "platform": "VOA/RFE fact-checking project"
    },
    {
        "url": "https://euvsdisinfo.eu",
        "name": "EUvsDisinfo",
        "purpose": "Tracking pro-Kremlin disinformation campaigns",
        "platform": "EU anti-disinformation task force"
    },
    
    {
        "url": "https://www.checkyourfact.com",
        "name": "Check Your Fact",
        "purpose": "Fact-checking political and viral claims",
        "platform": "Daily Caller fact-checking division"
    },
    {
        "url": "https://www.truthsocial.com",
        "name": "Truth Social",
        "purpose": "Social media platform with moderation concerns",
        "platform": "Social media network"
    },
    {
        "url": "https://www.gettr.com",
        "name": "GETTR",
        "purpose": "Alternative social platform often spreading unverified claims",
        "platform": "Social media platform"
    },
    {
        "url": "https://www.infowars.com",
        "name": "InfoWars",
        "purpose": "Conspiracy theories and controversial content",
        "platform": "Conspiracy theory website"
    },
    {
        "url": "https://www.breitbart.com",
        "name": "Breitbart News",
        "purpose": "Conservative news with history of misleading stories",
        "platform": "Conservative news aggregator"
    },
    {
        "url": "https://www.naturalnews.com",
        "name": "Natural News",
        "purpose": "Alternative health claims, often scientifically dubious",
        "platform": "Health conspiracy website"
    },
    {
        "url": "https://www.theepochtimes.com",
        "name": "The Epoch Times",
        "purpose": "News outlet known for spreading conspiracy theories",
        "platform": "Conservative news organization"
    },
    {
        "url": "https://www.thegatewaypundit.com",
        "name": "The Gateway Pundit",
        "purpose": "Far-right news site with frequent misinformation",
        "platform": "Conservative blog"
    },
    {
        "url": "https://www.yournewswire.com",
        "name": "YourNewsWire",
        "purpose": "Known for publishing fake news and hoaxes",
        "platform": "Fake news website"
    },
    {
        "url": "https://www.beforeitsnews.com",
        "name": "Before It's News",
        "purpose": "User-generated content, often unverified claims",
        "platform": "Citizen journalism platform"
    },
    
    {
        "url": "https://www.factcheckni.org",
        "name": "FactCheckNI",
        "purpose": "Fact-checking claims in Northern Ireland",
        "platform": "Regional fact-checking service"
    },
    {
        "url": "https://www.newtral.es",
        "name": "Newtral",
        "purpose": "Spanish fact-checking and media verification",
        "platform": "Spanish digital media outlet"
    },
    {
        "url": "https://www.boomlive.in",
        "name": "BOOM",
        "purpose": "Indian fact-checking and media literacy",
        "platform": "Fact-checking journalism platform"
    },
    {
        "url": "https://www.vishvasnews.com",
        "name": "Vishvas News",
        "purpose": "Hindi and English fact-checking in India",
        "platform": "Indian fact-checking portal"
    },
    {
        "url": "https://www.aosfatos.org",
        "name": "Aos Fatos",
        "purpose": "Brazilian fact-checking and journalism",
        "platform": "Brazilian fact-checking organization"
    },
    {
        "url": "https://www.chequeado.com",
        "name": "Chequeado",
        "purpose": "Argentine fact-checking and public discourse",
        "platform": "Latin American fact-checking pioneer"
    },
    {
        "url": "https://www.lemonde.fr/verification",
        "name": "Le Monde Verification",
        "purpose": "French newspaper's fact-checking division",
        "platform": "Mainstream media fact-checking"
    },
    {
        "url": "https://www.bbc.com/news/reality_check",
        "name": "BBC Reality Check",
        "purpose": "BBC's fact-checking and analysis team",
        "platform": "Public broadcaster fact-checking"
    },
    {
        "url": "https://www.washingtonpost.com/news/fact-checker",
        "name": "Washington Post Fact Checker",
        "purpose": "Rating political claims with Pinocchios",
        "platform": "Newspaper fact-checking column"
    },
    {
        "url": "https://apnews.com/APFactCheck",
        "name": "AP Fact Check",
        "purpose": "Associated Press fact-checking initiative",
        "platform": "Wire service fact-checking"
    },
    
    {
        "url": "https://www.reuters.com/fact-check",
        "name": "Reuters Fact Check",
        "purpose": "Global news agency's fact-checking service",
        "platform": "News wire fact-checking"
    },
    {
        "url": "https://www.usatoday.com/news/factcheck",
        "name": "USA TODAY Fact Check",
        "purpose": "Newspaper fact-checking claims and rumors",
        "platform": "National newspaper fact-checking"
    },
    {
        "url": "https://www.channel4.com/news/factcheck",
        "name": "Channel 4 FactCheck",
        "purpose": "UK broadcaster's fact-checking service",
        "platform": "TV news fact-checking"
    },
    {
        "url": "https://www.abc.net.au/news/factcheck",
        "name": "ABC Fact Check",
        "purpose": "Australian broadcaster fact-checking claims",
        "platform": "Public broadcaster fact-checking"
    },
    {
        "url": "https://observers.france24.com",
        "name": "France 24 Observers",
        "purpose": "Verifying user-generated content and citizen journalism",
        "platform": "International news verification"
    },
    {
        "url": "https://www.knowledgefight.com",
        "name": "Knowledge Fight",
        "purpose": "Debunking conspiracy theories from InfoWars",
        "platform": "Podcast and research project"
    },
    {
        "url": "https://qanonanonymous.com",
        "name": "QAnon Anonymous",
        "purpose": "Analyzing and debunking QAnon conspiracy theories",
        "platform": "Research and education podcast"
    },
    {
        "url": "https://www.disinformationindex.org",
        "name": "Global Disinformation Index",
        "purpose": "Tracking disinformation websites and ad funding",
        "platform": "Disinformation research nonprofit"
    },
    {
        "url": "https://www.propublica.org",
        "name": "ProPublica",
        "purpose": "Investigative journalism exposing misinformation",
        "platform": "Non-profit investigative newsroom"
    },
    {
        "url": "https://www.cjr.org",
        "name": "Columbia Journalism Review",
        "purpose": "Analyzing media accuracy and accountability",
        "platform": "Academic journalism publication"
    }
]


class MisinformationWebsitesTestData:
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
            
            # Select website from the list, with variation for extra students
            website = MISINFORMATION_WEBSITES[i % len(MISINFORMATION_WEBSITES)]
            if i >= len(MISINFORMATION_WEBSITES):
                # Add some variation to avoid exact duplicates
                website = MISINFORMATION_WEBSITES[i % len(MISINFORMATION_WEBSITES)].copy()
                website["purpose"] = website["purpose"] + " (educational research)"
            
            students.append({
                "first_name": first,
                "last_name": last,
                "email": email,
                "password": f"password{i+1}23!",
                "website": website
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

    def submit_website_info(self, student: Dict, submission_index: int = 0) -> bool:
        """Submit websiteInfo JSON for mediaType 'websiteInfo'"""
        try:
            # Format website info as JSON string
            website_json = json.dumps(student["website"])
            
            resp = self.session.post(f"{self.base_url}/api/deploy/{self.page_deployment_id}/prompt/submit", json={
                "submission_index": submission_index,
                "response": website_json
            })
            if resp.status_code == 200:
                print(f"✅ {student['first_name']} submitted website: {student['website']['name']}")
                return True
            print(f"❌ Failed to submit website for {student['email']}: {resp.status_code} - {resp.text}")
            return False
        except Exception as e:
            print(f"❌ Error submitting website for {student['email']}: {e}")
            return False

    def process_student(self, student: Dict) -> bool:
        print(f"\n🔄 Processing student: {student['first_name']} {student['last_name']}")
        website = student["website"]
        print(f"   🌐 Website: {website['name']} - {website['url']}")
        print(f"   📝 Purpose: {website['purpose'][:60]}...")

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

        # Submit to submission_index 0: Website info
        if not self.submit_website_info(student, submission_index=0):
            return False

        return True


def main():
    parser = argparse.ArgumentParser(description="Generate students and submit websiteInfo about misinformation sources for grouping testing")
    parser.add_argument("--count", type=int, default=30, help="Number of students to simulate")
    parser.add_argument("--base_url", default=DEFAULT_BASE_URL, help="Backend base URL")
    parser.add_argument("--class_join_code", default=DEFAULT_CLASS_JOIN_CODE, help="Class join code")
    parser.add_argument("--deployment_id", default=DEFAULT_DEPLOYMENT_ID, help="Parent deployment UUID")

    args = parser.parse_args()

    print("=" * 80)
    print("🧪 MISINFORMATION WEBSITES GROUPING TEST DATA GENERATOR")
    print("=" * 80)
    print("📋 Configuration:")
    print(f"  - Base URL: {args.base_url}")
    print(f"  - Class Code: {args.class_join_code}")
    print(f"  - Parent Deployment ID: {args.deployment_id}")
    print(f"  - Page Deployment ID: {args.deployment_id}_page_1")
    print(f"  - submission_index 0: Website info (mediaType: 'websiteInfo')")
    print(f"  - Available websites: {len(MISINFORMATION_WEBSITES)}")

    # Quick server check
    try:
        ping = requests.get(f"{args.base_url}/auth/me", timeout=5)
        print("✅ Server reachable")
    except requests.exceptions.ConnectionError:
        print("❌ Server is not running. Please start the backend server first (python main.py)")
        return
    except Exception:
        print("✅ Server reachable (auth may require session)")

    driver = MisinformationWebsitesTestData(
        base_url=args.base_url,
        join_code=args.class_join_code,
        parent_deployment_id=args.deployment_id,
    )

    students = driver.generate_students(args.count)

    print(f"\n🎯 Processing {len(students)} students with misinformation website data...")
    print(f"📊 Each student will submit:")
    print(f"  - 1 websiteInfo JSON (url, name, purpose, platform)")
    print(f"📝 Sample website from first student:")
    print(f"  - Name: {students[0]['website']['name']}")
    print(f"  - URL: {students[0]['website']['url']}")
    print(f"  - Purpose: {students[0]['website']['purpose']}")
    print(f"  - Platform: {students[0]['website']['platform']}")
    
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
        print("\n🎉 Success! Website data submissions have been recorded.")
        print("🔬 You can now run the group assignment behavior that uses websiteInfo embeddings.")
        print(f"📈 Total submissions created: {successful}")
        print(f"📊 Websites submitted: {successful}")
        print("\n💡 Dataset includes:")
        print("   - Fact-checking organizations (Snopes, FactCheck.org, PolitiFact, etc.)")
        print("   - Media literacy platforms (Checkology, NewsGuard, etc.)")
        print("   - Regional fact-checkers (Africa Check, Alt News, Maldita, etc.)")
        print("   - Research organizations (First Draft, Bellingcat, etc.)")
        print("   - Misinformation sources (for educational analysis)")
        print("\n🎓 Example prompt question answered:")
        print('   "Submit a website related to misinformation, fact-checking, or media literacy')
        print('    Include the URL, name, purpose, and platform type."')


if __name__ == "__main__":
    main()
