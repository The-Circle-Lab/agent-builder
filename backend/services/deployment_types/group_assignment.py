from json import tool
import numpy as np
from scipy.cluster.hierarchy import linkage, to_tree
from scipy.spatial.distance import pdist, squareform

from langchain.tools import tool
from langchain_community.embeddings import FastEmbedEmbeddings
from langchain_community.vectorstores import Qdrant
from langchain_openai import ChatOpenAI
from langchain.schema import SystemMessage, HumanMessage
import os

# Later, extras can be used to store additional metadata about the student
# for example grades, their name, program, profile interests etc.
def student_to_vector(text, extras:dict = None):
    embedder = FastEmbedEmbeddings()
    vector = embedder.embed_query(text)

    # add metadata
    for key, value in (extras or {}).items():
        # for now, the weighting is relatively light and abitrary, we will potentially 
        # add a more sophisticated weighting scheme later
        vector += hash(f"{key}:{value}") % 997 * 1e-5

    return vector

# Gets the distance between all vectors in the list
def compute_linkage(vectors, method="average", metric="cosine"):
    dist_matrix = pdist(vectors, metric=metric)
    return linkage(dist_matrix, method=method)

# Balance groups to target size using hierarchical clustering
def _cut_to_buckets(link, group_size, strategy: str = "homogeneous"):
    from scipy.cluster.hierarchy import fcluster
    
    # Get the number of students
    n = link.shape[0] + 1
    
    # Calculate optimal number of groups
    num_groups = (n + group_size - 1) // group_size
    
    # Get cluster assignments - start with more clusters than needed
    initial_clusters = min(n, num_groups * 2)
    clusters = fcluster(link, initial_clusters, criterion='maxclust')
    
    # Group students by cluster
    cluster_groups = {}
    for i, cluster_id in enumerate(clusters):
        if cluster_id not in cluster_groups:
            cluster_groups[cluster_id] = []
        cluster_groups[cluster_id].append(i)
    
    # Convert to list and sort by size
    groups = sorted(cluster_groups.values(), key=len, reverse=True)
    
    # Redistribute students to balance group sizes
    final_groups = [[] for _ in range(num_groups)]
    all_students = [student for group in groups for student in group]
    
    # Distribute students round-robin to balance groups
    for i, student in enumerate(all_students):
        final_groups[i % num_groups].append(student)
    
    # Remove empty groups
    return [group for group in final_groups if group]

def _hierarchical_assign(vectors, group_size, mode):
    link = compute_linkage(np.asarray(vectors), method="average", metric="cosine")
    return _cut_to_buckets(link, group_size, mode)

def _generate_group_explanations(groups: dict, student_data: list, strategy: str, use_llm: bool = True) -> dict:
    """Generate explanations for why students were grouped together using LLM or simple rules."""
    # Create a lookup dictionary for student descriptions
    student_profiles = {student["name"]: student["text"] for student in student_data}
    
    explanations = {}
    
    if use_llm and os.getenv("OPENAI_API_KEY"):
        # Initialize the LLM
        try:
            llm = ChatOpenAI(
                model="gpt-4o-mini", 
                temperature=0.3,
                api_key=os.getenv("OPENAI_API_KEY")
            )
            
            for group_id, members in groups.items():
                # Get the profiles for members in this group
                member_profiles = [f"{name}: {student_profiles.get(name, 'No description')}" 
                                  for name in members]
                profiles_text = "\n".join(member_profiles)
                
                # Create the explanation prompt
                prompt = f"""You are an instructor assistant.
The course is forming project teams using a '{strategy}' strategy.
Students in **{group_id}**: {', '.join(members)}.

Student profiles:
{profiles_text}

Write 2 concise sentences that explain to the team why they've been grouped together based on their inputs.
Avoid generic praise; reference at least one shared or complementary interest you infer from their profiles."""

                try:
                    # Get explanation from LLM
                    response = llm.invoke([
                        SystemMessage(content="You are a helpful academic writing assistant."),
                        HumanMessage(content=prompt)
                    ])
                    explanations[group_id] = response.content.strip()
                except Exception as e:
                    print(f"Error generating explanation for {group_id}: {e}")
                    explanations[group_id] = f"This group has been formed based on the {strategy} strategy to balance skills and interests."
        except Exception as e:
            print(f"Error initializing LLM: {e}")
            use_llm = False
    
    # Fallback to rule-based explanations if LLM is not available
    if not use_llm or not os.getenv("OPENAI_API_KEY"):
        print("Using rule-based explanations (no OpenAI API key found)")
        for group_id, members in groups.items():
            # Simple rule-based explanation
            member_texts = [student_profiles.get(name, "") for name in members]
            
            # Look for common keywords
            common_interests = []
            all_text = " ".join(member_texts).lower()
            
            # Check for common themes
            if any(word in all_text for word in ["programming", "coding", "development", "software"]):
                common_interests.append("programming/development")
            if any(word in all_text for word in ["research", "science", "lab"]):
                common_interests.append("research")
            if any(word in all_text for word in ["art", "design", "creative"]):
                common_interests.append("creative work")
            if any(word in all_text for word in ["data", "analytics", "visualization"]):
                common_interests.append("data analysis")
            if any(word in all_text for word in ["business", "finance", "economics"]):
                common_interests.append("business/economics")
            
            if common_interests:
                explanation = f"This group shares interests in {', '.join(common_interests[:2])}. The diverse perspectives within the group will complement each other well for collaborative projects."
            else:
                explanation = f"This group brings together diverse backgrounds and skills using the {strategy} strategy. The variety of experiences will create opportunities for mutual learning and innovation."
            
            explanations[group_id] = explanation
    
    return explanations

@tool
def assign_groups(student_json: list, group_size: int = 4, mode:str = "homogeneous"):
    """Assign students to groups by converting their text descriptions to vectors and using hierarchical clustering.
    
    Args:
        student_json: List of student dictionaries with 'text' and 'name' keys
        group_size: Target size for each group
        mode: Clustering strategy ('homogeneous', 'diverse', or 'mixed')
    
    Returns:
        Dictionary mapping group names to lists of student names
    """
    vectors, names = [], []
    for students in student_json:
        vec = student_to_vector(students["text"])
        vectors.append(vec)
        names.append(students["name"])

    groups = _hierarchical_assign(vectors, group_size, mode)
    return {f"Group{i+1}": [names[j] for j in group] 
            for i, group in enumerate(groups)}

@tool
def assign_groups_with_explanations(student_json: list, group_size: int = 4, mode: str = "homogeneous"):
    """Assign students to groups and provide AI-generated explanations for each group formation.
    
    Args:
        student_json: List of student dictionaries with 'text' and 'name' keys
        group_size: Target size for each group
        mode: Clustering strategy ('homogeneous', 'diverse', or 'mixed')
    
    Returns:
        Dictionary with 'groups' and 'explanations' keys
    """
    # First get the groups
    groups = assign_groups.func(student_json, group_size, mode)
    
    # Generate explanations
    explanations = _generate_group_explanations(groups, student_json, mode)
    
    return {
        "groups": groups,
        "explanations": explanations
    }

@tool
def generate_explanations_for_groups(groups: dict, student_json: list, mode: str = "mixed"):
    """Generate explanations for existing group assignments.
    
    Args:
        groups: Dictionary mapping group names to lists of student names
        student_json: List of student dictionaries with 'text' and 'name' keys
        mode: Strategy used for grouping ('homogeneous', 'diverse', or 'mixed')
    
    Returns:
        Dictionary mapping group names to explanation strings
    """
    return _generate_group_explanations(groups, student_json, mode)

if __name__ == "__main__":
    students = [
        {"name": "Amira Khan",     "text": "Interested in AI ethics and digital storytelling.",                "major": "CS",        "year": 2},
        {"name": "Ben Zhang",      "text": "Builds robots and loves competitive programming.",                "major": "MechEng",   "year": 3},
        {"name": "Claire Wilson",  "text": "Passionate about early childhood education and psychology.",      "major": "Psych",     "year": 2},
        {"name": "David Patel",    "text": "Back-end dev using Django, also volunteers at a food bank.",      "major": "CS",        "year": 3},
        {"name": "Ella Garcia",    "text": "Studying microbiology, loves lab work and hiking.",               "major": "Bio",       "year": 2},
        {"name": "Farid Mohammed", "text": "Writes poetry, builds mobile apps, and plays guitar.",            "major": "CS",        "year": 1},
        {"name": "Georgia Lin",    "text": "Graphic designer who also loves UI/UX research.",                 "major": "Design",    "year": 3},
        {"name": "Hassan Riaz",    "text": "Interested in sustainable energy systems and climate modeling.",  "major": "EnvSci",    "year": 4},
        {"name": "Isla Murphy",    "text": "Loves neuroscience and human behavior research.",                 "major": "Neuro",     "year": 2},
        {"name": "Jack Li",        "text": "AI researcher, published paper on transformers.",                 "major": "CS",        "year": 4},
        {"name": "Kiran Doshi",    "text": "Interested in game development and digital art.",                 "major": "CS",        "year": 1},
        {"name": "Lena Schwartz",  "text": "Public health student into data visualization and Tableau.",      "major": "HealthSci", "year": 3},
        {"name": "Marcus Evans",   "text": "Electrical engineer who builds audio amplifiers and loves jazz.", "major": "ElecEng",   "year": 2},
        {"name": "Nadia Noor",     "text": "Criminology student focused on justice reform and podcasting.",   "major": "Crim",      "year": 2},
        {"name": "Owen Reid",      "text": "Statistics major into baseball analytics and machine learning.",  "major": "Stats",     "year": 3},
        {"name": "Priya Malhotra", "text": "Feminist theory, social justice, and community theatre.",         "major": "Soc",       "year": 4},
        {"name": "Quinn Baker",    "text": "Cybersecurity enthusiast, plays Capture The Flag challenges.",    "major": "CS",        "year": 3},
        {"name": "Rosa Alvarez",   "text": "Biochem major, interested in pharmacology and plant science.",    "major": "BioChem",   "year": 1},
        {"name": "Sami Youssef",   "text": "Finance student who codes Python trading bots.",                  "major": "Econ",      "year": 4},
        {"name": "Talia Nguyen",   "text": "Studies visual culture and does freelance video editing.",        "major": "Media",     "year": 3},
        {"name": "Usman Habib",    "text": "Loves computer vision and autonomous drones.",                    "major": "ElecEng",   "year": 2},
        {"name": "Vanessa Roy",    "text": "Interested in AI & law and works at a legal tech startup.",       "major": "CS",        "year": 4},
        {"name": "William Chen",   "text": "Math major interested in topology and jazz piano.",               "major": "Math",      "year": 2},
        {"name": "Xinyi Zhao",     "text": "Anthropology major who writes zines on urban culture.",           "major": "Anthro",    "year": 3},
        {"name": "Yousef El-Masri", "text": "Mechanical engineer who races go-karts and builds engines.",     "major": "MechEng",   "year": 2},
    ]
    """
    # Test basic group assignment
    print("=== Basic Group Assignment ===")
    groups = assign_groups.run({
        "student_json": students,
        "mode": "mixed",        # 'homogeneous' | 'diverse' | 'mixed'
        "group_size": 4
    })
    print(groups)
    """ 
    print("\n=== Group Assignment with Explanations ===")
    # Test group assignment with explanations
    groups_with_explanations = assign_groups_with_explanations.run({
        "student_json": students,
        "mode": "mixed",
        "group_size": 4
    })
    
    print("Groups:")
    for group_id, members in groups_with_explanations["groups"].items():
        print(f"{group_id}: {members}")
    
    print("\nExplanations:")
    for group_id, explanation in groups_with_explanations["explanations"].items():
        print(f"{group_id}: {explanation}")
        print()


