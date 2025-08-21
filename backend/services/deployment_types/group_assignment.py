import numpy as np
from scipy.cluster.hierarchy import linkage, to_tree
from scipy.spatial.distance import pdist, squareform
from typing import Dict, Any, List, Optional, Tuple

from langchain.tools import tool
from langchain_community.embeddings import FastEmbedEmbeddings
from langchain_community.vectorstores import Qdrant
from langchain_openai import ChatOpenAI
from langchain.schema import SystemMessage, HumanMessage
import os

class GroupAssignmentBehavior:
    """
    Handles group assignment functionality using hierarchical clustering and AI-generated explanations.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the group assignment behavior with configuration.
        
        Args:
            config: Dictionary containing group assignment configuration
        """
        self.group_size = config.get('group_size', 4)
        self.grouping_method = config.get('grouping_method', 'mixed')  # homogeneous, diverse, mixed
        self.include_explanations = config.get('include_explanations', True)
        self.label = config.get('label', 'Group Assignment')
        self.selected_submission_prompts = config.get('selected_submission_prompts', [])
    
    def execute(self, student_data: List[Dict[str, Any]], db_session: Optional[Any] = None, prompt_context: Optional[str] = None) -> Dict[str, Any]:
        """
        Execute group assignment with the provided student data.
        
        Args:
            student_data: List of student dictionaries with 'name' and 'text' keys
            
        Returns:
            Dictionary with group assignments and metadata
        """
        # Validate input data
        self._validate_input(student_data)
        
        try:
            # Filter student data to only use selected submission prompts
            filtered_student_data = self._filter_student_data_by_selected_prompts(student_data)
            
            # Incorporate vectors from PDFs when available
            try:
                students_with_vectors = self._build_student_vectors(filtered_student_data, db_session)
            except Exception as e:
                # Fall back to text-only vectors
                print(f"Warning: PDF vector enrichment failed, using text only. Error: {e}")
                students_with_vectors = [(s["name"], student_to_vector(s.get("text", ""))) for s in filtered_student_data]

            names = [name for name, _ in students_with_vectors]
            vectors = [vec for _, vec in students_with_vectors]

            # Perform grouping using our computed vectors
            group_indices = _hierarchical_assign(np.asarray(vectors), self.group_size, self.grouping_method)
            groups: Dict[str, List[str]] = {f"Group{i+1}": [names[j] for j in idxs] for i, idxs in enumerate(group_indices)}

            if self.include_explanations:
                explanations = _generate_group_explanations(
                    groups, 
                    filtered_student_data, 
                    self.grouping_method, 
                    db_session=db_session, 
                    prompt_context=prompt_context,
                    selected_prompts=self.selected_submission_prompts
                )
                return {
                    "success": True,
                    "groups": groups,
                    "explanations": explanations,
                    "metadata": {
                        "total_students": len(student_data),
                        "total_groups": len(groups),
                        "group_size_target": self.group_size,
                        "grouping_method": self.grouping_method,
                        "includes_explanations": True,
                        "label": self.label
                    }
                }
            else:
                return {
                    "success": True,
                    "groups": groups,
                    "metadata": {
                        "total_students": len(student_data),
                        "total_groups": len(groups),
                        "group_size_target": self.group_size,
                        "grouping_method": self.grouping_method,
                        "includes_explanations": False,
                        "label": self.label
                    }
                }
                
        except Exception as e:
            raise ValueError(f"Group assignment failed: {str(e)}")
    
    def generate_explanations_for_existing_groups(
        self, 
        groups: Dict[str, List[str]], 
        student_data: List[Dict[str, Any]]
    ) -> Dict[str, str]:
        """
        Generate explanations for existing group assignments.
        
        Args:
            groups: Dictionary mapping group names to lists of student names
            student_data: List of student dictionaries with 'name' and 'text' keys
            
        Returns:
            Dictionary mapping group names to explanation strings
        """
        try:
            return _generate_group_explanations(
                groups=groups,
                student_data=student_data,
                strategy=self.grouping_method,
                selected_prompts=self.selected_submission_prompts
            )
        except Exception as e:
            raise ValueError(f"Explanation generation failed: {str(e)}")
    
    def _validate_input(self, student_data: List[Dict[str, Any]]) -> None:
        """
        Validate input data for group assignment.
        
        Args:
            student_data: List of student dictionaries to validate
            
        Raises:
            ValueError: If input data is invalid
        """
        if student_data is None:
            raise ValueError(
                "No student data provided. The group assignment behavior needs student input data. "
                "Please ensure this behavior is connected to a page that collects student submissions "
                "or to a variable that contains student data in the format: "
                "[{'name': 'Student Name', 'text': 'Student response'}, ...]"
            )
        
        if not isinstance(student_data, list):
            raise ValueError(
                f"Student data must be a list, but received {type(student_data).__name__}. "
                "Expected format: [{'name': 'Student Name', 'text': 'Student response'}, ...]"
            )
        
        if not student_data:
            raise ValueError(
                "Student data list is empty. The group assignment behavior needs at least one student "
                "to create groups. Please ensure there are student submissions or data available."
            )
        
        if len(student_data) < 2:
            raise ValueError(
                f"Need at least 2 students to create groups, but only received {len(student_data)} student(s). "
                "Please ensure there are enough student submissions."
            )
        
        # Validate that each student has required fields
        for i, student in enumerate(student_data):
            if not isinstance(student, dict):
                raise ValueError(
                    f"Student {i} must be a dictionary with 'name' and 'text' fields, "
                    f"but received {type(student).__name__}"
                )
            if 'name' not in student:
                raise ValueError(
                    f"Student {i} missing required 'name' field. "
                    f"Expected format: {{'name': 'Student Name', 'text': 'Student response'}}"
                )
            if 'text' not in student:
                raise ValueError(
                    f"Student {i} missing required 'text' field. "
                    f"Expected format: {{'name': 'Student Name', 'text': 'Student response'}}"
                )
            
            # Validate that the fields contain actual data
            if not student['name'] or not isinstance(student['name'], str):
                raise ValueError(
                    f"Student {i} has invalid 'name' field. Name must be a non-empty string."
                )
            if (not student.get('text') or not isinstance(student.get('text'), str)) and not (
                isinstance(student.get('pdf_document_ids'), list) and len(student.get('pdf_document_ids')) > 0
            ):
                raise ValueError(
                    f"Student {i} must have non-empty 'text' or at least one PDF document id."
                )

    def _filter_student_data_by_selected_prompts(self, student_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Filter student data to only include responses from selected submission prompts.
        
        Args:
            student_data: List of student dictionaries with submission data
            
        Returns:
            List of student dictionaries with filtered text data from selected prompts only
        """
        if not self.selected_submission_prompts:
            # If no specific prompts selected, use all available data (backward compatibility)
            return student_data
        
        # Create a set of selected prompt IDs for quick lookup
        # Handle both string and dict formats for selected_submission_prompts
        selected_prompt_ids = set()
        for prompt in self.selected_submission_prompts:
            if isinstance(prompt, dict):
                prompt_id = prompt.get('id')
                if prompt_id:
                    selected_prompt_ids.add(prompt_id)
            elif isinstance(prompt, str):
                # If it's a string, treat it as the prompt ID directly
                selected_prompt_ids.add(prompt)
            else:
                print(f"🔍 FILTER WARNING: Unexpected prompt format: {type(prompt)} = {prompt}")
        
        if not selected_prompt_ids:
            print("Warning: No valid prompt IDs found in selected_submission_prompts, using all student data")
            return student_data
        
        filtered_students = []
        for student in student_data:
            student_copy = student.copy()
            
            # Filter submission responses to only include selected prompts
            if 'submission_responses' in student:
                filtered_responses = {}
                selected_texts = []
                
                # Since the submission keys are currently submission_0, submission_1, etc.,
                # and we have actual prompt IDs, we need a different approach.
                # For now, if we have selected prompts, we'll use the first submission only
                # This assumes the first submission corresponds to the first/main prompt
                
                if len(self.selected_submission_prompts) > 0:
                    # Get the first submission (submission_0) - assumes this is the main prompt response
                    first_submission_key = "submission_0"
                    if first_submission_key in student['submission_responses']:
                        response = student['submission_responses'][first_submission_key]
                        
                        # Only include text submissions when filtering by prompts
                        if response.get('media_type') == 'text':
                            filtered_responses[first_submission_key] = response
                            
                            # Extract text content for grouping
                            if isinstance(response, dict):
                                text_content = response.get('text', '') or response.get('response', '')
                            else:
                                text_content = str(response)
                            
                            if text_content:
                                selected_texts.append(text_content)
                
                student_copy['submission_responses'] = filtered_responses
                
                # Combine selected prompt responses into the main 'text' field for vector creation
                if selected_texts:
                    student_copy['text'] = ' '.join(selected_texts)
                else:
                    # No matching responses found, use empty text but keep student for consistency
                    student_copy['text'] = ''
                
                # Clear PDF IDs when filtering by specific prompts to avoid PDF interference
                student_copy['pdf_document_ids'] = []
            
            filtered_students.append(student_copy)
        
        # Log which prompts are being used for grouping
        prompt_labels = [prompt.get('prompt', prompt.get('id', 'Unknown'))[:50] for prompt in self.selected_submission_prompts]
        print(f"Grouping students based on {len(self.selected_submission_prompts)} selected prompts: {prompt_labels}")
        
        return filtered_students

    def _build_student_vectors(self, student_data: List[Dict[str, Any]], db_session: Optional[Any]) -> List[Tuple[str, List[float]]]:
        """Construct a vector per student using text and any PDF submissions.
        - If `pdf_document_ids` present in student dict, fetch vectors from Qdrant for those IDs.
        - Combine with text embedding by averaging.
        - If no PDF vectors found, use text embedding only.
        """
        from scripts.utils import create_qdrant_client
        from qdrant_client.models import Filter, FieldCondition, MatchValue
        from models.database.db_models import Document

        embeddings = FastEmbedEmbeddings()
        qdrant_client = create_qdrant_client()

        results: List[Tuple[str, List[float]]] = []

        for student in student_data:
            name = student["name"]
            text = student.get("text", "")
            pdf_ids = student.get("pdf_document_ids", []) or []

            text_vec = embeddings.embed_query(text) if text else None

            pdf_vectors: List[List[float]] = []
            # Fetch vectors from Qdrant using the document upload_id within the user-specific collection
            for doc_id in pdf_ids:
                try:
                    doc = None
                    if db_session is not None:
                        doc = db_session.get(Document, doc_id)
                    if not doc or not doc.is_active:
                        continue
                    collection_name = doc.user_collection_name
                    upload_id = doc.upload_id
                    recs, _ = qdrant_client.scroll(
                        collection_name=collection_name,
                        scroll_filter=Filter(must=[FieldCondition(key="upload_id", match=MatchValue(value=upload_id))]),
                        limit=2048
                    )
                    for rec in recs:
                        vec = getattr(rec, 'vector', None)
                        if vec is None and getattr(rec, 'vectors', None):
                            # For named vectors collections
                            if isinstance(rec.vectors, dict):
                                # pick the first vector
                                first_key = next(iter(rec.vectors))
                                vec = rec.vectors[first_key]
                        if vec is not None:
                            pdf_vectors.append(vec)
                except Exception:
                    continue

            combined_vec = None
            if text_vec is not None and pdf_vectors:
                # Average all vectors: text + pdfs
                import numpy as np
                stacked = np.vstack([text_vec] + pdf_vectors)
                combined_vec = stacked.mean(axis=0).tolist()
            elif pdf_vectors:
                import numpy as np
                stacked = np.vstack(pdf_vectors)
                combined_vec = stacked.mean(axis=0).tolist()
            elif text_vec is not None:
                combined_vec = text_vec
            else:
                combined_vec = embeddings.embed_query("")

            results.append((name, combined_vec))

        return results
    
    def get_config(self) -> Dict[str, Any]:
        """Get the current configuration of the group assignment behavior."""
        return {
            "group_size": self.group_size,
            "grouping_method": self.grouping_method,
            "include_explanations": self.include_explanations,
            "label": self.label,
            "selected_submission_prompts": self.selected_submission_prompts
        }
    
    def update_config(self, config: Dict[str, Any]) -> None:
        """Update the configuration of the group assignment behavior."""
        if 'group_size' in config:
            self.group_size = config['group_size']
        if 'grouping_method' in config:
            self.grouping_method = config['grouping_method']
        if 'include_explanations' in config:
            self.include_explanations = config['include_explanations']
        if 'label' in config:
            self.label = config['label']
        if 'selected_submission_prompts' in config:
            self.selected_submission_prompts = config['selected_submission_prompts']

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

def _generate_group_explanations(groups: dict, student_data: list, strategy: str, use_llm: bool = True, db_session: Optional[Any] = None, prompt_context: Optional[str] = None, selected_prompts: Optional[List[Dict[str, Any]]] = None) -> dict:
    """Generate explanations for why students were grouped together using LLM or simple rules."""
    # Create a lookup dictionary for student descriptions and enrich with PDF snippets if available
    student_profiles = {student.get("name", ""): student.get("text", "") for student in student_data}
    student_pdf_map = {student.get("name", ""): (student.get("pdf_document_ids") or []) for student in student_data}
    
    # Attempt to retrieve brief snippets from PDFs for each student via Qdrant
    try:
        if db_session is not None:
            from scripts.utils import create_qdrant_client
            from qdrant_client.models import Filter, FieldCondition, MatchValue
            from models.database.db_models import Document
            qdrant_client = create_qdrant_client()
            for name, pdf_ids in student_pdf_map.items():
                if not pdf_ids:
                    continue
                snippets: list[str] = []
                for doc_id in pdf_ids:
                    try:
                        doc = db_session.get(Document, int(doc_id))
                        if not doc or not doc.is_active:
                            continue
                        
                        # Try Qdrant first
                        try:
                            recs, _ = qdrant_client.scroll(
                                collection_name=doc.user_collection_name,
                                scroll_filter=Filter(must=[FieldCondition(key="upload_id", match=MatchValue(value=doc.upload_id))]),
                                limit=32
                            )
                            for rec in recs:
                                payload = getattr(rec, 'payload', {}) or {}
                                # LangChain typically stores 'text' or 'page_content'
                                text = payload.get('text') or payload.get('page_content') or ""
                                if text:
                                    snippets.append(text)
                                if len(snippets) >= 5:
                                    break
                        except Exception as qdrant_err:
                            pass  # Qdrant retrieval failed, try fallback
                        
                        # If no Qdrant results, try fallback to stored snippets in doc_metadata
                        if not snippets and doc.doc_metadata and 'snippets' in doc.doc_metadata:
                            fallback_snippets = doc.doc_metadata['snippets']
                            if isinstance(fallback_snippets, list):
                                snippets.extend(fallback_snippets[:5])
                        
                        if len(snippets) >= 5:
                            break
                    except Exception:
                        continue
                if snippets:
                    # Append a compact snippet to the student's profile text
                    merged = "\n".join(snippets)
                    merged = merged.replace("\n\n", "\n").strip()
                    # keep at most ~800 chars to keep prompts brief
                    merged = merged[:800]
                    base_text = student_profiles.get(name, "") or ""
                    student_profiles[name] = (base_text + ("\n" if base_text else "") + f"PDF snippets: {merged}").strip()
    except Exception as e:
        # If RAG enrichment fails, continue with base profiles
        print(f"RAG enrichment for explanations failed: {e}")
    
    explanations = {}
    
    if use_llm and os.getenv("OPENAI_API_KEY"):
        # Initialize the LLM
        try:
            llm = ChatOpenAI(
                model="gpt-5-mini", 
                api_key=os.getenv("OPENAI_API_KEY")
            )
            
            for group_id, members in groups.items():
                # Get the profiles for members in this group
                member_profiles = [f"{name}: {student_profiles.get(name, 'No description')}" 
                                  for name in members]
                profiles_text = "\n".join(member_profiles)

                # Add guidance and require citing concrete traits/interests or brief quotes from PDF snippets.
                guidance = (
                    "When possible, cite specific phrases or concrete topics from the PDF snippets (e.g., 'robotics', 'data visualization', 'sustainability'). "
                    "Avoid generic statements. Two concise sentences maximum."
                )
                
                # Build the assignment context
                assignment_context = ""
                if prompt_context:
                    assignment_context = f"\nOriginal assignment: {prompt_context}\n"
                
                # Build context about which prompts were used for grouping
                prompts_context = ""
                if selected_prompts:
                    prompt_questions = [prompt.get('prompt', 'Unknown prompt')[:100] for prompt in selected_prompts]
                    prompts_context = f"\nGrouping was based on responses to these specific questions: {'; '.join(prompt_questions)}\n"
                
                # Create the explanation prompt
                prompt = f"""You are an instructor assistant helping students understand their team formation.
The course is forming project teams using a '{strategy}' strategy.{assignment_context}{prompts_context}
Students in **{group_id}**: {', '.join(members)}.

Student profiles (including content from their submitted documents):
{profiles_text}

Write 2 concise sentences explaining why these students were grouped together for this assignment. Base your explanation on specific themes, topics, or approaches from their submitted materials. {guidance}"""

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
        
        # Build context about selected prompts for rule-based explanations
        prompts_info = ""
        if selected_prompts:
            prompt_count = len(selected_prompts)
            prompts_info = f" based on responses to {prompt_count} selected submission prompt{'s' if prompt_count != 1 else ''}"
        
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
                explanation = f"This group shares interests in {', '.join(common_interests[:2])}{prompts_info}. The diverse perspectives within the group will complement each other well for collaborative projects."
            else:
                explanation = f"This group brings together diverse backgrounds and skills using the {strategy} strategy{prompts_info}. The variety of experiences will create opportunities for mutual learning and innovation."
            
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
    
    print("\n=== Group Assignment with Explanations ===")
    # Test group assignment with explanations
    groups_with_explanations = assign_groups_with_explanations.func(
        student_json=students,
        mode="mixed",
        group_size=4
    )
    
    print("Groups:")
    for group_id, members in groups_with_explanations["groups"].items():
        print(f"{group_id}: {members}")
    
    print("\nExplanations:")
    for group_id, explanation in groups_with_explanations["explanations"].items():
        print(f"{group_id}: {explanation}")
        print()


