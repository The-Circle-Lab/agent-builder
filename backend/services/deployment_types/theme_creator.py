from typing import Any, Dict, List, Optional, Tuple
import os
import numpy as np
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer
from collections import Counter

from langchain_community.embeddings import FastEmbedEmbeddings
from langchain_openai import ChatOpenAI
from langchain.schema import SystemMessage, HumanMessage

# Force single-threaded execution to prevent hanging
os.environ['MKL_NUM_THREADS'] = '1'
os.environ['OMP_NUM_THREADS'] = '1'
os.environ['OPENBLAS_NUM_THREADS'] = '1'
os.environ['TOKENIZERS_PARALLELISM'] = 'false'


class ThemeCreatorBehavior:
    """
    Handles theme creation functionality using KMeans clustering and TF-IDF analysis.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the theme creator behavior with configuration.
        
        Args:
            config: Dictionary containing theme creation configuration
        """
        self.num_themes = config.get('num_themes', 3)
        self.label = config.get('label', 'Theme Creator')
        self.selected_submission_prompts = config.get('selected_submission_prompts', [])
        self.use_llm_polish = config.get('use_llm_polish', True)  # Default to True for better theme names
        self.llm_polish_prompt = config.get('llm_polish_prompt', '')  # Optional teacher context for theme structuring
        self.filter_web_content = config.get('filter_web_content', True)  # Enhanced filtering for web/PDF artifacts
        self.enhance_with_web_search = config.get('enhance_with_web_search', False)  # Connect themes to recent events

    def execute(self, student_data: List[Dict[str, Any]], db_session: Optional[Any] = None, prompt_context: Optional[str] = None, deployment_context: Optional[str] = None, progress_callback: Optional[callable] = None) -> Dict[str, Any]:
        """
        Execute theme creation with the provided student data.
        Optimized for async execution with better memory management and error handling.
        
        Args:
            student_data: List of student dictionaries with 'name' and 'text' keys
            db_session: Optional database session for PDF vector retrieval
            prompt_context: Optional context about the assignment prompts
            deployment_context: Optional deployment context for auto-fetching student data
            
        Returns:
            Dictionary with themes, metadata, and clustering results
        """
        print(f"🔍 THEME CREATOR EXECUTE: Initial student_data type: {type(student_data)}")
        print(f"🔍 THEME CREATOR EXECUTE: student_data is None: {student_data is None}")
        
        # Auto-fetch student data if None but we have selected submission prompts
        if student_data is None and self.selected_submission_prompts:
            print(f"🔍 THEME CREATOR EXECUTE: Auto-fetching student data from prompt pages")
            print(f"🔍 THEME CREATOR EXECUTE: Selected submission prompts: {self.selected_submission_prompts}")
            print(f"🔍 THEME CREATOR EXECUTE: Deployment context: {deployment_context}")
            student_data = self._auto_fetch_student_data_from_prompts(db_session, deployment_context)
            print(f"🔍 THEME CREATOR EXECUTE: Auto-fetched {len(student_data) if student_data else 'None'} students")
        
        # Validate input data
        self._validate_input(student_data)
        
        # Store original count for metrics
        original_student_count = len(student_data)
        
        # Basic validation logging
        print(f"🎯 Theme Creator: Processing {original_student_count} students with {self.num_themes} target themes")
        
        try:
            # Report initial progress
            if progress_callback:
                progress_callback(40, "Filtering student data...")
            
            # Filter student data to only use selected submission prompts
            filtered_student_data = self._filter_student_data_by_selected_prompts(student_data)
            
            # Memory optimization: Clear original data after filtering
            del student_data
            
            # Store data for chunk-based analysis
            self._current_student_data = filtered_student_data
            self._current_db_session = db_session
            
            # Report progress for vector building
            if progress_callback:
                progress_callback(50, "Building vectors for clustering...")
            
            # Build vectors for clustering (text + PDF embeddings)
            try:
                students_with_vectors = self._build_student_vectors(filtered_student_data, db_session)
            except Exception as e:
                # Fall back to text-only vectors - use the same pattern as group assignment
                print(f"Warning: PDF vector enrichment failed, using text only. Error: {e}")
                
                # Import the same function group assignment uses for fallback
                from services.deployment_types.group_assignment import student_to_vector
                
                students_with_vectors = []
                for s in filtered_student_data:
                    if isinstance(s, dict):
                        name = s.get("name", "Unknown")
                        text = s.get("text", "")
                        students_with_vectors.append((name, student_to_vector(text)))
                    else:
                        # Handle case where s is not a dict (e.g., a string)
                        print(f"Warning: Invalid student data format: {type(s)} = {s}")
                        continue

            if len(students_with_vectors) < self.num_themes:
                # Adjust number of themes if we have fewer students than requested themes
                actual_num_themes = max(1, len(students_with_vectors) // 2)
                print(f"Warning: Reducing number of themes from {self.num_themes} to {actual_num_themes} due to limited data")
            else:
                actual_num_themes = self.num_themes
            
            # Ensure we have at least 2 themes for meaningful analysis
            if actual_num_themes < 2:
                actual_num_themes = min(2, len(students_with_vectors))
                print(f"📈 Forcing at least 2 themes for meaningful analysis: {actual_num_themes}")

            # Report progress for clustering
            if progress_callback:
                progress_callback(60, "Performing theme clustering...")
            
            # Memory optimization: Extract data and clear large objects
            names = [name for name, _ in students_with_vectors]
            vectors = np.array([vec for _, vec in students_with_vectors])
            
            # Free up memory from students_with_vectors
            del students_with_vectors
            
            # Extract texts only from valid students (to match names/vectors arrays)
            # For PDF-only themes, we need to extract text content from PDFs for TF-IDF analysis
            texts = []
            valid_student_names = set(names)  # Names from successfully processed students
            
            for student in filtered_student_data:
                if isinstance(student, dict) and student.get("name") in valid_student_names:
                    student_text = student.get("text", "")
                    
                    # If no text but has PDFs, try to extract PDF text for theme analysis
                    if not student_text and student.get("pdf_document_ids") and db_session:
                        print(f"  Extracting PDF text for theme analysis: {student.get('name', 'Unknown')}")
                        pdf_text = self._extract_pdf_text_for_themes(student.get("pdf_document_ids", []), db_session)
                        if pdf_text:
                            student_text = pdf_text
                            print(f"    Extracted {len(pdf_text)} chars from PDFs")
                    
                    texts.append(student_text)
            
            # Ensure texts array matches the length of names/vectors
            while len(texts) < len(names):
                texts.append("")

            # Perform KMeans clustering with enhanced error handling
            try:
                cluster_assignments, cluster_centers = self._perform_clustering(vectors, actual_num_themes)
            except Exception as e:
                print(f"⚠️  Clustering failed, falling back to simple distribution: {e}")
                # Simple fallback: distribute students evenly across themes
                cluster_assignments = np.array([i % actual_num_themes for i in range(len(names))])
                cluster_centers = None
            
            # Memory cleanup
            del vectors
            
            # Report progress for theme labeling
            if progress_callback:
                progress_callback(70, "Generating theme labels...")
            
            # Auto-label clusters using TF-IDF with enhanced error handling
            try:
                themes_data = self._auto_label_themes(cluster_assignments, texts, names, actual_num_themes)
            except Exception as e:
                print(f"⚠️  Theme labeling failed, creating basic themes: {e}")
                # Fallback: create basic themes
                themes_data = []
                for i in range(actual_num_themes):
                    student_names_in_cluster = [names[j] for j, cluster_id in enumerate(cluster_assignments) if cluster_id == i]
                    themes_data.append({
                        "title": f"Theme {i + 1}",
                        "description": f"Theme based on {len(student_names_in_cluster)} student responses",
                        "keywords": [],
                        "snippets": [],
                        "document_count": len(student_names_in_cluster),
                        "cluster_id": i,
                        "student_names": student_names_in_cluster,
                        "student_count": len(student_names_in_cluster)
                    })
            
            # Enhanced features with graceful degradation
            # Enhance themes with recent events via web search if enabled
            if self.enhance_with_web_search and os.getenv("OPENAI_API_KEY"):
                if progress_callback:
                    progress_callback(80, "Enhancing themes with web search...")
                try:
                    print("🌐 Enhancing themes with recent events via web search...")
                    themes_data = self._enhance_themes_with_web_search(themes_data, prompt_context)
                except Exception as e:
                    print(f"⚠️  Web search enhancement failed, continuing without: {e}")
                    # Continue with the existing themes_data
            
            # Polish theme names with LLM if enabled (skip if likely to hang)
            if self.use_llm_polish and os.getenv("OPENAI_API_KEY"):
                if progress_callback:
                    progress_callback(85, "Polishing theme names with LLM...")
                try:
                    print("🎨 Attempting LLM theme polishing...")
                    themes_data = self._polish_theme_names(themes_data, prompt_context)
                except Exception as e:
                    print(f"⚠️  LLM polishing failed, continuing with auto-generated names: {e}")
                    # Continue with the existing themes_data (auto-generated names)
            
            # Final cleanup
            del texts, names, cluster_assignments, filtered_student_data
            if hasattr(self, '_current_student_data'):
                delattr(self, '_current_student_data')
            if hasattr(self, '_current_db_session'):
                delattr(self, '_current_db_session')
            
            # Note: Theme persistence is handled by pages_manager.save_behavior_execution
            # No need to save here as it's done automatically in the execution pipeline

            result = {
                "success": True,
                "themes": themes_data,
                "output_themes_created": actual_num_themes,  # Add this for behavior execution history
                "output_written_to_variable": None,  # Will be set if behavior writes to variable
                "metadata": {
                    "total_students": original_student_count,
                    "total_themes": actual_num_themes,
                    "requested_themes": self.num_themes,
                    "clustering_method": "kmeans",
                    "includes_llm_polish": self.use_llm_polish and os.getenv("OPENAI_API_KEY") is not None,
                    "llm_polish_prompt": self.llm_polish_prompt,
                    "enhance_with_web_search": self.enhance_with_web_search,
                    "web_search_attempted": self.enhance_with_web_search and os.getenv("OPENAI_API_KEY") is not None,
                    "label": self.label,
                    "selected_prompts_count": len(self.selected_submission_prompts)
                }
            }
            
            print(f"🚀 THEME CREATOR RETURNING RESULT WITH:")
            print(f"   Success: {result['success']}")
            print(f"   Themes: {len(themes_data)}")
            print(f"   Original students: {original_student_count}")
            print(f"   Actual themes created: {actual_num_themes}")
            
            return result
                
        except Exception as e:
            # Enhanced error logging for async debugging
            import traceback
            error_trace = traceback.format_exc()
            print(f"❌ THEME CREATOR ERROR: {str(e)}")
            print(f"   Traceback: {error_trace}")
            raise ValueError(f"Theme creation failed: {str(e)}")

    def _validate_input(self, student_data: List[Dict[str, Any]]) -> None:
        """
        Validate input data for theme creation.
        
        Args:
            student_data: List of student dictionaries to validate
            
        Raises:
            ValueError: If input data is invalid
        """
        if student_data is None:
            raise ValueError(
                "No student data provided. The theme creator behavior needs student input data. "
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
                "Student data list is empty. The theme creator behavior needs at least one student "
                "to create themes. Please ensure there are student submissions or data available."
            )
        
        if len(student_data) < 2:
            raise ValueError(
                f"Need at least 2 students to create themes, but only received {len(student_data)} student(s). "
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
        
        print(f"🔍 THEME FILTER: Processing {len(self.selected_submission_prompts)} selected submission prompts")
        
        # Handle both legacy string format and new variable object format
        selected_variable_names = set()
        for prompt in self.selected_submission_prompts:
            if isinstance(prompt, dict):
                # New format: full variable object with metadata
                variable_name = prompt.get('variableName') or prompt.get('id')
                if variable_name:
                    selected_variable_names.add(variable_name)
                    print(f"   ✅ Added variable: {variable_name} (origin: {prompt.get('origin')}, type: {prompt.get('type')})")
            elif isinstance(prompt, str):
                # Legacy format: string prompt ID
                selected_variable_names.add(prompt)
                print(f"   ✅ Added legacy prompt: {prompt}")
            else:
                print(f"   ❌ Unexpected prompt format: {type(prompt)} = {prompt}")
        
        if not selected_variable_names:
            print("⚠️  No valid variable names found in selected_submission_prompts, using all student data")
            return student_data
        
        filtered_students = []
        for student in student_data:
            student_copy = student.copy()
            
            # Filter submission responses to only include selected variable submissions
            if 'submission_responses' in student:
                filtered_responses = {}
                selected_texts = []
                selected_pdf_ids = []
                
                print(f"  📝 Processing student: {student.get('name', 'Unknown')}")
                
                # Map variable names to submission indices for filtering
                # variable names like "prompt_1_text_0" -> submission_0
                # variable names like "prompt_1_pdf_1" -> submission_1
                for variable_name in selected_variable_names:
                    # Extract submission index from variable name
                    # Format: prompt_{page}_{type}_{index}
                    parts = variable_name.split('_')
                    if len(parts) >= 4 and parts[0] == 'prompt':
                        try:
                            submission_index = int(parts[-1])  # Last part is the index
                            submission_key = f"submission_{submission_index}"
                            variable_type = parts[-2]  # Second to last is the type (text/pdf/list/dynamic_list/hyperlink)
                            normalized_var_type = (
                                'list' if variable_type == 'dynamic_list' else
                                'text' if variable_type == 'textarea' else
                                variable_type
                            )
                            
                            if submission_key in student['submission_responses']:
                                response = student['submission_responses'][submission_key]
                                media_type = response.get('media_type', '')

                                print(f"    🔍 Found {submission_key}: {media_type} type")

                                # Normalize type matching including list/dynamic_list and hyperlink/text
                                type_match = False
                                if normalized_var_type == media_type:
                                    type_match = True
                                elif normalized_var_type == 'list' and media_type in ('list', 'dynamic_list'):
                                    type_match = True
                                elif normalized_var_type in ('text', 'hyperlink') and media_type in ('text', 'hyperlink'):
                                    type_match = True

                                if type_match:
                                    filtered_responses[submission_key] = response

                                    if media_type == 'text' or media_type == 'hyperlink':
                                        text_content = response.get('text', '') or response.get('response', '')
                                        if text_content:
                                            selected_texts.append(text_content)
                                            print(f"      ✅ Added text: {text_content[:50]}...")
                                    elif media_type == 'list' or media_type == 'dynamic_list':
                                        items = response.get('items') or []
                                        if isinstance(items, list) and items:
                                            list_text = ' '.join([str(i) for i in items if str(i).strip()])
                                            if list_text:
                                                selected_texts.append(list_text)
                                                print(f"      ✅ Added {media_type} items text: {list_text[:50]}...")
                                    elif media_type == 'pdf':
                                        try:
                                            pdf_id = int(response.get('response', ''))
                                            selected_pdf_ids.append(pdf_id)
                                            print(f"      ✅ Added PDF ID: {pdf_id}")
                                        except (ValueError, TypeError):
                                            print(f"      ❌ Invalid PDF ID: {response.get('response')}")
                                else:
                                    print(f"      ⚠️  Type mismatch: variable type '{variable_type}' vs media type '{media_type}'")
                            else:
                                print(f"      ❌ Submission {submission_key} not found")
                        except (ValueError, IndexError) as e:
                            print(f"      ❌ Error parsing variable name '{variable_name}': {e}")
                
                student_copy['submission_responses'] = filtered_responses
                
                # Combine selected text responses into the main 'text' field for vector creation
                has_pdf_submissions = bool(selected_pdf_ids)
                
                if selected_texts:
                    # Use text from selected prompts
                    student_copy['text'] = ' '.join(selected_texts)
                    print(f"    📄 Combined text from {len(selected_texts)} submissions")
                elif has_pdf_submissions:
                    # PDF-only theme creation: clear text field to force PDF-only vector creation
                    student_copy['text'] = ''
                    print(f"    📄 PDF-only theme creation: cleared text field")
                else:
                    # No matching responses found, use original text as fallback
                    student_copy['text'] = student.get('text', '')
                    print(f"    📄 No matching submissions, using original text")
                
                # Set PDF IDs from selected PDF submissions
                student_copy['pdf_document_ids'] = selected_pdf_ids
                if selected_pdf_ids:
                    print(f"    📎 Set {len(selected_pdf_ids)} PDF IDs: {selected_pdf_ids}")
                else:
                    print(f"    📎 No PDF submissions selected")
            else:
                print(f"  ⚠️  Student has no submission_responses")
            
            # Only include students who have submissions for the selected prompts
            has_relevant_submissions = bool(filtered_responses) or bool(selected_texts) or bool(selected_pdf_ids)
            if has_relevant_submissions:
                filtered_students.append(student_copy)
                print(f"  ✅ Included {student.get('name', 'Unknown')} (has relevant submissions)")
            else:
                filtered_students.append(student_copy)  # Include anyway for theme creation
                print(f"  ⚠️  Included {student.get('name', 'Unknown')} (no specific submissions but keeping for consistency)")
        
        # Log filtering results
        original_count = len(student_data)
        filtered_count = len(filtered_students)
        
        print(f"🎯 THEME FILTER RESULTS:")
        print(f"   Original students: {original_count}")
        print(f"   Filtered students: {filtered_count}")
        print(f"   Selected variables: {list(selected_variable_names)}")
        
        return filtered_students

    def _build_student_vectors(self, student_data: List[Dict[str, Any]], db_session: Optional[Any]) -> List[Tuple[str, List[float]]]:
        """
        Construct a vector per student using text and any PDF submissions.
        Identical to group assignment logic to ensure consistency.
        """
        from scripts.utils import create_qdrant_client
        from qdrant_client.models import Filter, FieldCondition, MatchValue
        from models.database.db_models import Document

        # Initialize embeddings and qdrant client once for efficiency
        embeddings = FastEmbedEmbeddings()
        qdrant_client = create_qdrant_client()

        results: List[Tuple[str, List[float]]] = []

        print(f"📊 Building vectors for {len(student_data)} students...")

        try:
            for i, student in enumerate(student_data):
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
                            limit=2048  # Same limit as group assignment
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
                    except Exception as e:
                        # Suppress detailed error logging to reduce noise
                        continue

                combined_vec = None
                if text_vec is not None and pdf_vectors:
                    # Average all vectors: text + pdfs
                    stacked = np.vstack([text_vec] + pdf_vectors)
                    combined_vec = stacked.mean(axis=0).tolist()
                elif pdf_vectors:
                    stacked = np.vstack(pdf_vectors)
                    combined_vec = stacked.mean(axis=0).tolist()
                elif text_vec is not None:
                    combined_vec = text_vec
                else:
                    combined_vec = embeddings.embed_query("")

                results.append((name, combined_vec))
                
                if (i + 1) % 3 == 0:  # Progress update every 3 students
                    print(f"  Processed {i + 1}/{len(student_data)} students...")

        finally:
            # Allow garbage collection of large objects
            pass

        print(f"✅ Vector building complete: {len(results)} students processed")
        return results

    def _extract_pdf_text_for_themes(self, pdf_ids: List[int], db_session) -> str:
        """
        Extract text content from PDFs for theme analysis.
        Returns combined text from all PDF chunks for TF-IDF analysis.
        """
        try:
            from scripts.utils import create_qdrant_client
            from qdrant_client.models import Filter, FieldCondition, MatchValue
            from models.database.db_models import Document
            
            qdrant_client = create_qdrant_client()
            extracted_texts = []
            
            for doc_id in pdf_ids:
                try:
                    doc = db_session.get(Document, doc_id)
                    if not doc or not doc.is_active:
                        continue
                    
                    # Extract text from Qdrant vectors
                    recs, _ = qdrant_client.scroll(
                        collection_name=doc.user_collection_name,
                        scroll_filter=Filter(must=[FieldCondition(key="upload_id", match=MatchValue(value=doc.upload_id))]),
                        limit=50  # Get more content for theme analysis
                    )
                    
                    for rec in recs:
                        payload = getattr(rec, 'payload', {}) or {}
                        text = payload.get('text') or payload.get('page_content') or ""
                        if text and len(text.strip()) > 10:  # Only meaningful text
                            extracted_texts.append(text.strip())
                        
                        # Limit total extracted text to prevent memory issues
                        if len(extracted_texts) >= 20:
                            break
                    
                    # Also try fallback to stored snippets
                    if not extracted_texts and doc.doc_metadata and 'snippets' in doc.doc_metadata:
                        fallback_snippets = doc.doc_metadata['snippets']
                        if isinstance(fallback_snippets, list):
                            extracted_texts.extend(fallback_snippets[:10])
                    
                except Exception as e:
                    print(f"    Error extracting from PDF {doc_id}: {e}")
                    continue
            
            # Combine all extracted text
            combined_text = ' '.join(extracted_texts)
            
            # Limit size to prevent memory issues
            if len(combined_text) > 5000:
                combined_text = combined_text[:5000] + "..."
            
            return combined_text
            
        except Exception as e:
            print(f"  Error in PDF text extraction: {e}")
            return ""

    def _extract_pdf_chunks_with_vectors(self, pdf_ids: List[int], db_session) -> List[Tuple[str, List[float]]]:
        """
        Extract PDF text chunks along with their vectors for advanced theme analysis.
        Returns list of (text_chunk, vector) tuples.
        """
        try:
            from scripts.utils import create_qdrant_client
            from qdrant_client.models import Filter, FieldCondition, MatchValue
            from models.database.db_models import Document
            
            qdrant_client = create_qdrant_client()
            chunk_data = []
            
            for doc_id in pdf_ids:
                try:
                    doc = db_session.get(Document, doc_id)
                    if not doc or not doc.is_active:
                        continue
                    
                    # Extract chunks with vectors from Qdrant
                    recs, _ = qdrant_client.scroll(
                        collection_name=doc.user_collection_name,
                        scroll_filter=Filter(must=[FieldCondition(key="upload_id", match=MatchValue(value=doc.upload_id))]),
                        limit=100  # Get more chunks for better diversity
                    )
                    
                    for rec in recs:
                        payload = getattr(rec, 'payload', {}) or {}
                        text = payload.get('text') or payload.get('page_content') or ""
                        
                        # Get the vector
                        vec = getattr(rec, 'vector', None)
                        if vec is None and getattr(rec, 'vectors', None):
                            # For named vectors collections
                            if isinstance(rec.vectors, dict):
                                first_key = next(iter(rec.vectors))
                                vec = rec.vectors[first_key]
                        
                        if text and len(text.strip()) > 20 and vec is not None:  # Only meaningful chunks
                            chunk_data.append((text.strip(), vec))
                        
                        # Limit total chunks to prevent memory issues
                        if len(chunk_data) >= 50:
                            break
                    
                except Exception as e:
                    print(f"    Error extracting chunks from PDF {doc_id}: {e}")
                    continue
            
            print(f"    Extracted {len(chunk_data)} PDF chunks with vectors")
            return chunk_data
            
        except Exception as e:
            print(f"  Error in PDF chunk extraction: {e}")
            return []

    def _perform_clustering(self, vectors: np.ndarray, num_themes: int) -> Tuple[np.ndarray, np.ndarray]:
        """
        Perform KMeans clustering on the student vectors.
        
        Args:
            vectors: Array of student vectors
            num_themes: Number of themes/clusters to create
            
        Returns:
            Tuple of (cluster_assignments, cluster_centers)
        """
        print(f"🔄 Starting KMeans clustering with {num_themes} clusters...")
        
        # Force single-threaded execution to avoid hanging issues
        import os
        old_mkl_threading = os.environ.get('MKL_NUM_THREADS')
        old_omp_threads = os.environ.get('OMP_NUM_THREADS')
        old_openblas_threads = os.environ.get('OPENBLAS_NUM_THREADS')
        
        try:
            # Set environment variables to force single-threading
            os.environ['MKL_NUM_THREADS'] = '1'
            os.environ['OMP_NUM_THREADS'] = '1' 
            os.environ['OPENBLAS_NUM_THREADS'] = '1'
            
            # Use minimal settings to avoid hanging
            kmeans = KMeans(
                n_clusters=num_themes, 
                random_state=42, 
                n_init=5,  # Reduced from 10 to 5 for speed
                max_iter=100,  # Reduced max iterations
                algorithm='lloyd'  # Use specific algorithm
            )
            
            print(f"  Fitting KMeans with {len(vectors)} vectors...")
            cluster_assignments = kmeans.fit_predict(vectors)
            cluster_centers = kmeans.cluster_centers_.copy()
            
            # Check if we got fewer clusters than requested
            unique_clusters = len(np.unique(cluster_assignments))
            if unique_clusters < num_themes:
                print(f"  ⚠️  KMeans found only {unique_clusters} distinct clusters out of {num_themes} requested")
                print(f"  📊 This suggests PDF content is very similar - using force distribution")
                
                # Force distribute students across requested number of themes
                cluster_assignments = self._force_distribute_clusters(cluster_assignments, vectors, num_themes)
                unique_clusters = len(np.unique(cluster_assignments))
                print(f"  ✅ Forced distribution resulted in {unique_clusters} clusters")
            
            print(f"✅ KMeans clustering completed successfully")
            
            return cluster_assignments, cluster_centers
            
        finally:
            # Restore original threading settings
            if old_mkl_threading is not None:
                os.environ['MKL_NUM_THREADS'] = old_mkl_threading
            elif 'MKL_NUM_THREADS' in os.environ:
                del os.environ['MKL_NUM_THREADS']
                
            if old_omp_threads is not None:
                os.environ['OMP_NUM_THREADS'] = old_omp_threads
            elif 'OMP_NUM_THREADS' in os.environ:
                del os.environ['OMP_NUM_THREADS']
                
            if old_openblas_threads is not None:
                os.environ['OPENBLAS_NUM_THREADS'] = old_openblas_threads
            elif 'OPENBLAS_NUM_THREADS' in os.environ:
                del os.environ['OPENBLAS_NUM_THREADS']
                
            # Clean up kmeans object
            try:
                del kmeans
            except:
                pass

    def _force_distribute_clusters(self, original_assignments: np.ndarray, vectors: np.ndarray, target_num_themes: int) -> np.ndarray:
        """
        Force distribute students across the target number of themes when KMeans produces fewer clusters.
        Uses balanced k-means++ style initialization to create more evenly distributed and coherent themes.
        """
        try:
            from scipy.spatial.distance import pdist, squareform
            import numpy as np
            
            total_students = len(vectors)
            target_size = total_students // target_num_themes
            remainder = total_students % target_num_themes
            
            print(f"    Redistributing {total_students} students into {target_num_themes} balanced themes")
            print(f"    Target sizes: {target_size} per theme, with {remainder} themes getting +1 student")
            
            # Calculate pairwise distances between all vectors
            distances = pdist(vectors, metric='cosine')
            distance_matrix = squareform(distances)
            
            # Start fresh with balanced K-means++ style initialization
            new_assignments = np.full(total_students, -1)
            cluster_centers = []
            
            # Step 1: Select diverse seed points using k-means++ approach
            seed_indices = []
            
            # Pick first seed randomly from all students
            first_seed = np.random.randint(0, total_students)
            seed_indices.append(first_seed)
            cluster_centers.append(vectors[first_seed])
            
            # Pick remaining seeds with probability proportional to distance from existing seeds
            for _ in range(1, target_num_themes):
                max_min_distance = -1
                best_candidate = None
                
                for candidate_idx in range(total_students):
                    if candidate_idx in seed_indices:
                        continue
                    
                    # Find minimum distance to any existing seed
                    min_distance = min(distance_matrix[candidate_idx][seed_idx] 
                                     for seed_idx in seed_indices)
                    
                    if min_distance > max_min_distance:
                        max_min_distance = min_distance
                        best_candidate = candidate_idx
                
                if best_candidate is not None:
                    seed_indices.append(best_candidate)
                    cluster_centers.append(vectors[best_candidate])
            
            # Step 2: Assign initial cluster IDs to seeds
            for i, seed_idx in enumerate(seed_indices):
                new_assignments[seed_idx] = i
            
            # Step 3: Balanced assignment of remaining students
            remaining_students = [i for i in range(total_students) if i not in seed_indices]
            
            # Calculate target size for each cluster (some get +1 if remainder > 0)
            cluster_target_sizes = []
            for i in range(target_num_themes):
                size = target_size + (1 if i < remainder else 0)
                cluster_target_sizes.append(size)
            
            cluster_current_sizes = [1] * target_num_themes  # Each cluster has 1 seed
            
            # Assign remaining students to balance clusters while maintaining coherence
            for student_idx in remaining_students:
                best_cluster = None
                best_score = float('inf')
                
                for cluster_id in range(target_num_themes):
                    # Skip if cluster is already full
                    if cluster_current_sizes[cluster_id] >= cluster_target_sizes[cluster_id]:
                        continue
                    
                    # Calculate distance to cluster center (seed)
                    distance_to_center = distance_matrix[student_idx][seed_indices[cluster_id]]
                    
                    # Add penalty for oversized clusters to encourage balance
                    size_penalty = cluster_current_sizes[cluster_id] * 0.1
                    total_score = distance_to_center + size_penalty
                    
                    if total_score < best_score:
                        best_score = total_score
                        best_cluster = cluster_id
                
                # If no cluster has space, assign to the cluster with minimum size
                if best_cluster is None:
                    best_cluster = np.argmin(cluster_current_sizes)
                
                new_assignments[student_idx] = best_cluster
                cluster_current_sizes[best_cluster] += 1
            
            # Verify the distribution
            final_counts = [np.sum(new_assignments == i) for i in range(target_num_themes)]
            print(f"    Final distribution: {final_counts}")
            
            return new_assignments
            
        except Exception as e:
            print(f"    Error in balanced force distribution: {e}")
            return original_assignments

    def _auto_label_themes(self, cluster_assignments: np.ndarray, texts: List[str], names: List[str], num_themes: int) -> List[Dict[str, Any]]:
        """
        Auto-label themes using chunk-based analysis with cosine similarity to centroids.
        
        Args:
            cluster_assignments: Array of cluster assignments for each student
            texts: List of student text responses
            names: List of student names
            num_themes: Number of themes created
            
        Returns:
            List of theme dictionaries with title, keywords, and snippets
        """
        themes_data = []
        
        # Group texts and names by cluster
        cluster_texts = {}
        cluster_names = {}
        for i, cluster_id in enumerate(cluster_assignments):
            if cluster_id not in cluster_texts:
                cluster_texts[cluster_id] = []
                cluster_names[cluster_id] = []
            cluster_texts[cluster_id].append(texts[i])
            cluster_names[cluster_id].append(names[i])
        
        print(f"🔍 Theme Analysis: Found {len(cluster_texts)} non-empty clusters out of {num_themes} requested")
        
        # For each cluster, perform enhanced analysis using PDF chunks if available
        for cluster_id in range(num_themes):
            if cluster_id not in cluster_texts or not cluster_texts[cluster_id]:
                # Empty cluster - create a minimal theme
                themes_data.append({
                    "title": f"Theme {cluster_id + 1}",
                    "description": "Empty theme with no student responses",
                    "keywords": [],
                    "snippets": [],
                    "document_count": 0,
                    "cluster_id": cluster_id,
                    "student_names": [],
                    "student_count": 0
                })
                print(f"  Cluster {cluster_id}: Empty (0 students)")
                continue
                
            cluster_text_list = cluster_texts[cluster_id]
            cluster_name_list = cluster_names[cluster_id]
            
            print(f"  Cluster {cluster_id}: Analyzing {len(cluster_name_list)} students")
            
            # Try enhanced PDF chunk-based analysis first
            theme_data = self._analyze_cluster_with_chunks(cluster_id, cluster_name_list, cluster_text_list)
            
            # Fallback to traditional text analysis if chunk analysis fails
            if not theme_data or not theme_data.get("keywords"):
                print(f"    Falling back to traditional text analysis for cluster {cluster_id}")
                theme_data = self._analyze_cluster_traditional(cluster_id, cluster_name_list, cluster_text_list)
            
            themes_data.append(theme_data)
        
        return themes_data

    def _analyze_cluster_with_chunks(self, cluster_id: int, student_names: List[str], student_texts: List[str]) -> Dict[str, Any]:
        """
        Analyze cluster using balanced PDF sampling and content filtering to prevent single PDF dominance.
        """
        try:
            # Extract PDF chunks with balanced sampling per student
            all_chunks = []
            chunks_per_student = {}
            
            for i, name in enumerate(student_names):
                # Find the original student data to get PDF IDs
                for student in getattr(self, '_current_student_data', []):
                    if student.get('name') == name and student.get('pdf_document_ids'):
                        # Extract chunks with vectors for this student
                        raw_chunks = self._extract_pdf_chunks_with_vectors(
                            student['pdf_document_ids'], 
                            getattr(self, '_current_db_session', None)
                        )
                        
                        # Filter and balance chunks per student to prevent PDF dominance
                        filtered_chunks = self._filter_and_balance_chunks(raw_chunks, name)
                        chunks_per_student[name] = len(filtered_chunks)
                        all_chunks.extend(filtered_chunks)
                        break
            
            if not all_chunks:
                return {}  # No PDF chunks available, fall back
            
            print(f"    Analyzing {len(all_chunks)} filtered PDF chunks for cluster {cluster_id}")
            print(f"    Chunks per student: {chunks_per_student}")
            
            # Extract texts from chunks
            chunk_texts = [chunk[0] for chunk in all_chunks]
            chunk_vectors = np.array([chunk[1] for chunk in all_chunks])
            
            # Use improved TF-IDF with content filtering
            vectorizer = TfidfVectorizer(
                max_features=100,
                stop_words='english',
                ngram_range=(1, 2),
                min_df=2,  # Require terms to appear in at least 2 chunks
                max_df=0.7,  # Filter overly common terms
                token_pattern=r'\b[a-zA-Z][a-zA-Z]+\b'  # Only alphabetic tokens, min 2 chars
            )
            
            try:
                tfidf_matrix = vectorizer.fit_transform(chunk_texts)
                feature_names = vectorizer.get_feature_names_out()
                
                # Get mean TF-IDF scores
                mean_scores = np.mean(tfidf_matrix.toarray(), axis=0)
                
                # Filter out overly specific or generic terms
                filtered_keywords = self._filter_keywords(feature_names, mean_scores)
                
                # Clean up to prevent memory leaks
                del vectorizer, tfidf_matrix, feature_names, mean_scores
                
            except Exception as e:
                print(f"    TF-IDF failed for cluster {cluster_id}: {e}")
                filtered_keywords = []
            
            # Select representative snippets using diversity sampling
            snippets = self._select_diverse_snippets(chunk_texts, max_snippets=4)
            
            # Generate theme title from filtered keywords
            if filtered_keywords:
                title_words = filtered_keywords[:2]  # Use fewer words for cleaner titles
                title = ' & '.join(title_words).title()
            else:
                title = f"Theme {cluster_id + 1}"
            
            return {
                "title": title,
                "description": f"Theme based on {len(student_names)} student PDF submissions",
                "keywords": filtered_keywords,
                "snippets": snippets,
                "document_count": len(student_names),
                "cluster_id": cluster_id,
                "student_names": student_names,
                "student_count": len(student_names)
            }
            
        except Exception as e:
            print(f"    Error in chunk-based analysis for cluster {cluster_id}: {e}")
            return {}

    def _filter_and_balance_chunks(self, raw_chunks: List[Tuple[str, List[float]]], student_name: str, max_chunks_per_student: int = 8) -> List[Tuple[str, List[float]]]:
        """
        Filter out irrelevant content and balance chunks per student to prevent single PDF dominance.
        """
        if not raw_chunks:
            return []
        
        # Step 1: Content filtering - remove ads, headers, footers, navigation
        filtered_chunks = []
        for text, vector in raw_chunks:
            # Apply enhanced filtering if enabled, otherwise use basic length filter
            if self.filter_web_content:
                if self._is_relevant_content(text):
                    filtered_chunks.append((text, vector))
            else:
                # Basic filtering - just length and basic quality
                if 30 <= len(text.strip()) <= 1000 and '.' in text:
                    filtered_chunks.append((text, vector))
        
        if not filtered_chunks:
            # If all filtered out, take the longest chunks as likely content
            filtered_chunks = sorted(raw_chunks, key=lambda x: len(x[0]), reverse=True)[:max_chunks_per_student//2]
        
        # Step 2: Diversity sampling - select diverse chunks to represent the student's content
        if len(filtered_chunks) > max_chunks_per_student:
            filtered_chunks = self._sample_diverse_chunks(filtered_chunks, max_chunks_per_student)
        
        print(f"      {student_name}: {len(raw_chunks)} -> {len(filtered_chunks)} chunks after filtering")
        return filtered_chunks

    def _is_relevant_content(self, text: str) -> bool:
        """
        Enhanced filter to remove irrelevant content like ads, navigation, headers, footers.
        Specifically designed to handle news website content and PDF artifacts.
        """
        text_lower = text.lower().strip()
        original_text = text.strip()
        
        # Skip very short or very long chunks
        if len(text_lower) < 40 or len(text_lower) > 1000:
            return False
        
        # Enhanced patterns for news websites and web content
        exclude_patterns = [
            # Common ad/promotional content
            'advertisement', 'sponsored', 'click here', 'subscribe', 'newsletter',
            'sign in', 'sign up', 'log in', 'login', 'register', 'create account',
            'follow us', 'social media', 'twitter', 'facebook', 'instagram', 'linkedin',
            'cookie policy', 'privacy policy', 'terms of service', 'contact us',
            'navigation', 'menu', 'home page', 'about us',
            'copyright', '© 20', 'all rights reserved', 'powered by',
            'share this', 'print this', 'email this', 'bookmark', 'save article',
            'prev', 'next', 'page 1', 'page 2', 'download pdf',
            
            # News website specific patterns
            'trending', 'featured', 'lifestyle', 'entertainment', 'sports',
            'weather', 'horoscope', 'astrology', 'celebrity', 'gossip',
            'tired of too many ads', 'go ad free', 'premium subscription',
            'breaking news', 'live updates', 'just in', 'developing story',
            'photo gallery', 'video gallery', 'slideshow',
            'related articles', 'you may also like', 'recommended reading',
            'popular stories', 'most read', 'trending now',
            
            # Website navigation and metadata
            'updated:', 'published:', 'ist', 'pst', 'est', 'gmt',
            'etimes.in', 'indiatimes', 'toi lifestyle', 'times of india',
            'news/', 'lifestyle/', 'sports/', 'entertainment/',
            'breadcrumb', 'tags:', 'category:', 'section:',
            
            # Generic website elements
            'load more', 'read more', 'view all', 'see all', 'show more',
            'comments', 'reactions', 'likes', 'shares', 'replies',
            'user agreement', 'terms and conditions', 'disclaimer',
            
            # Specific patterns from the example
            'friendzoned', 'sweat to skin', 'infections', '5 signs your',
            'relationship is ready', 'how to spot the fakes',
            'aa a', 'share aa a'  # Common artifact patterns
        ]
        
        # Check for exclude patterns (more sensitive threshold)
        exclude_count = sum(1 for pattern in exclude_patterns if pattern in text_lower)
        if exclude_count >= 2:
            return False
        
        # Filter out chunks with excessive navigation/UI elements
        ui_indicators = ['sign in', 'menu', 'home', 'search', 'filter', 'sort by']
        ui_count = sum(1 for indicator in ui_indicators if indicator in text_lower)
        if ui_count >= 2:
            return False
        
        # Filter chunks that are mostly punctuation or repeated characters
        words = text_lower.split()
        if len(words) < 8:  # Increased minimum word count
            return False
        
        # Check for excessive capitalization (often indicates titles/headers)
        capital_ratio = sum(1 for c in original_text if c.isupper()) / len(original_text)
        if capital_ratio > 0.3:  # More than 30% capitals suggests header/title
            return False
        
        # Filter out chunks with too many special characters
        special_chars = sum(1 for c in text if not c.isalnum() and not c.isspace())
        if special_chars > len(text) * 0.2:  # More than 20% special characters
            return False
        
        # Enhanced content quality indicators
        quality_indicators = [
            # Academic/research terms
            'research', 'study', 'analysis', 'findings', 'conclusion',
            'evidence', 'data', 'results', 'method', 'approach',
            'according', 'however', 'therefore', 'furthermore', 'moreover',
            'researchers', 'scientists', 'experts', 'professor', 'university',
            
            # News content indicators
            'investigation', 'report', 'sources', 'officials', 'authorities',
            'confirmed', 'revealed', 'discovered', 'announced', 'stated',
            'interview', 'statement', 'press release', 'spokesperson',
            'alleged', 'claimed', 'accused', 'charged', 'convicted',
            
            # Substantial content words
            'because', 'although', 'despite', 'meanwhile', 'subsequently',
            'consequently', 'nevertheless', 'furthermore', 'additionally',
            'specifically', 'particularly', 'generally', 'typically',
            'approximately', 'estimated', 'calculated', 'determined'
        ]
        
        quality_count = sum(1 for indicator in quality_indicators if indicator in text_lower)
        
        # Balanced quality requirements - not too strict
        has_quality_content = quality_count >= 1 or len(words) >= 15
        
        # Additional check: does it look like actual article content?
        has_sentences = '.' in text and len([s for s in text.split('.') if len(s.strip()) > 8]) >= 1
        
        # Allow content that doesn't have obvious exclusion patterns even if it lacks quality indicators
        has_no_major_exclusions = exclude_count == 0 and ui_count == 0
        
        return (has_quality_content and has_sentences) or (has_no_major_exclusions and len(words) >= 12 and has_sentences)

    def _sample_diverse_chunks(self, chunks: List[Tuple[str, List[float]]], max_chunks: int) -> List[Tuple[str, List[float]]]:
        """
        Sample diverse chunks to represent the content without redundancy.
        """
        if len(chunks) <= max_chunks:
            return chunks
        
        try:
            from scipy.spatial.distance import pdist, squareform
            
            # Extract vectors
            vectors = np.array([chunk[1] for chunk in chunks])
            
            # Calculate pairwise distances
            distances = pdist(vectors, metric='cosine')
            distance_matrix = squareform(distances)
            
            # Greedy selection for maximum diversity
            selected_indices = []
            remaining_indices = list(range(len(chunks)))
            
            # Start with a random chunk
            first_idx = remaining_indices[0]
            selected_indices.append(first_idx)
            remaining_indices.remove(first_idx)
            
            # Select subsequent chunks that are maximally distant
            for _ in range(max_chunks - 1):
                if not remaining_indices:
                    break
                
                max_min_distance = -1
                best_candidate = None
                
                for candidate_idx in remaining_indices:
                    # Find minimum distance to any selected chunk
                    min_distance = min(distance_matrix[candidate_idx][selected_idx] 
                                     for selected_idx in selected_indices)
                    
                    if min_distance > max_min_distance:
                        max_min_distance = min_distance
                        best_candidate = candidate_idx
                
                if best_candidate is not None:
                    selected_indices.append(best_candidate)
                    remaining_indices.remove(best_candidate)
            
            return [chunks[i] for i in selected_indices]
            
        except Exception as e:
            print(f"      Error in diverse sampling: {e}")
            # Fallback: take evenly spaced chunks
            step = len(chunks) // max_chunks
            return [chunks[i * step] for i in range(max_chunks)]

    def _filter_keywords(self, feature_names: np.ndarray, scores: np.ndarray) -> List[str]:
        """
        Filter keywords to remove overly specific, generic, or irrelevant terms.
        """
        # Get top scoring terms
        top_indices = np.argsort(scores)[-20:][::-1]
        candidate_keywords = [(feature_names[i], scores[i]) for i in top_indices if scores[i] > 0]
        
        filtered_keywords = []
        
        # Filter patterns
        overly_specific = [
            # Location-specific terms that are too narrow
            r'\b\w*israel\w*\b', r'\b\w*gaza\w*\b', r'\b\w*campus\w*\b',
            # Brand/product names
            r'\b\w*microsoft\w*\b', r'\b\w*google\w*\b', r'\b\w*apple\w*\b',
            # Website-specific terms
            r'\b\w*etimes\w*\b', r'\b\w*indiatimes\w*\b', r'\b\w*toi\w*\b',
            r'\b\w*guardian\w*\b', r'\b\w*cnn\w*\b', r'\b\w*bbc\w*\b',
            # Time-specific terms
            r'\b20\d{2}\b', r'\b\w*pandemic\w*\b', r'\b\w*covid\w*\b'
        ]
        
        # Enhanced filtering for web content artifacts
        web_artifacts = [
            # Website/navigation terms
            'sign', 'login', 'home', 'menu', 'page', 'site', 'web', 'link', 'click',
            'view', 'read', 'more', 'next', 'prev', 'back', 'top', 'bottom',
            'search', 'filter', 'sort', 'category', 'tag', 'section',
            
            # News website terms
            'news', 'article', 'story', 'report', 'update', 'latest', 'breaking',
            'trending', 'featured', 'popular', 'lifestyle', 'entertainment',
            'toi', 'times', 'india', 'desk', 'staff', 'correspondent',
            
            # Social media/sharing
            'share', 'like', 'follow', 'subscribe', 'comment', 'reply',
            'facebook', 'twitter', 'instagram', 'youtube', 'linkedin',
            
            # Ad/promotional terms
            'ads', 'advertisement', 'sponsored', 'premium', 'subscription',
            'offer', 'deal', 'discount', 'sale', 'buy', 'shop', 'store',
            
            # Generic UI terms
            'button', 'form', 'input', 'submit', 'cancel', 'close', 'open',
            'save', 'download', 'upload', 'print', 'email', 'send',
            
            # Date/time artifacts
            'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul',
            'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
            'ist', 'pst', 'est', 'gmt', 'am', 'pm', 'updated', 'published'
        ]
        
        overly_generic = [
            'people', 'things', 'way', 'time', 'year', 'day', 'new', 'good', 'great',
            'important', 'different', 'help', 'work', 'make', 'use', 'get', 'go',
            'know', 'see', 'come', 'think', 'take', 'want', 'give', 'say', 'tell',
            'able', 'like', 'just', 'also', 'well', 'still', 'even', 'much', 'many',
            'most', 'some', 'any', 'all', 'every', 'each', 'other', 'same', 'such'
        ] + web_artifacts
        
        import re
        
        for keyword, score in candidate_keywords:
            keyword_lower = keyword.lower()
            
            # Skip overly generic terms
            if keyword_lower in overly_generic:
                continue
            
            # Skip overly specific patterns
            if any(re.search(pattern, keyword_lower) for pattern in overly_specific):
                continue
            
            # Skip terms that are too short or contain numbers/symbols
            if len(keyword) < 3 or not keyword.replace(' ', '').isalpha():
                continue
            
            # Prefer terms that are not too common but not too rare
            if 0.1 < score < 0.8:
                filtered_keywords.append(keyword)
            
            # Limit to top keywords
            if len(filtered_keywords) >= 8:
                break
        
        return filtered_keywords

    def _select_diverse_snippets(self, chunk_texts: List[str], max_snippets: int = 4) -> List[str]:
        """
        Select diverse representative snippets from chunk texts, filtering out web artifacts.
        """
        if not chunk_texts:
            return []
        
        # Filter out chunks that look like web content artifacts
        clean_chunks = []
        for text in chunk_texts:
            if self._is_relevant_content(text):  # Reuse our content filter
                clean_chunks.append(text)
        
        if not clean_chunks:
            clean_chunks = chunk_texts  # Fallback if all filtered out
        
        if len(clean_chunks) <= max_snippets:
            texts_to_process = clean_chunks
        else:
            # Sample evenly across clean chunks
            step = len(clean_chunks) // max_snippets
            texts_to_process = [clean_chunks[i * step] for i in range(max_snippets)]
        
        snippets = []
        web_indicators = [
            'sign in', 'login', 'menu', 'home', 'click here', 'read more', 'share',
            'subscribe', 'follow', 'advertisement', 'sponsored', 'lifestyle',
            'trending', 'featured', 'updated:', 'published:', 'toi', 'etimes',
            'tired of too many ads', 'go ad free', 'aa a', 'breaking news'
        ]
        
        for text in texts_to_process:
            # Try to extract the most substantive sentences
            sentences = [s.strip() for s in text.split('.') if len(s.strip()) > 25]
            
            best_sentence = None
            for sentence in sentences:
                sentence_lower = sentence.lower()
                
                # Skip sentences with web artifacts
                has_web_artifacts = any(indicator in sentence_lower for indicator in web_indicators)
                if has_web_artifacts:
                    continue
                
                # Skip sentences that are mostly capitalized (likely headers)
                capital_ratio = sum(1 for c in sentence if c.isupper()) / max(len(sentence), 1)
                if capital_ratio > 0.3:
                    continue
                
                # Skip sentences with too many special characters
                special_ratio = sum(1 for c in sentence if not c.isalnum() and not c.isspace()) / max(len(sentence), 1)
                if special_ratio > 0.15:
                    continue
                
                # Prefer sentences with substantive content
                quality_words = ['research', 'study', 'found', 'shows', 'according', 'reported', 
                               'investigation', 'analysis', 'evidence', 'data', 'experts', 'officials']
                has_quality = any(word in sentence_lower for word in quality_words)
                
                if has_quality or len(sentence.split()) >= 10:
                    best_sentence = sentence
                    break
            
            if best_sentence:
                # Clean up the sentence
                snippet = best_sentence.strip()
                if not snippet.endswith('.'):
                    snippet += '.'
                
                # Final length check and cleanup
                if 40 <= len(snippet) <= 200:
                    # Remove any remaining artifacts at the beginning
                    snippet = self._clean_snippet_start(snippet)
                    if snippet:
                        snippets.append(snippet)
            elif len(text) > 40:
                # Fallback: use middle portion of text to avoid headers/footers
                start_pos = len(text) // 4
                end_pos = min(start_pos + 150, len(text))
                snippet = text[start_pos:end_pos].strip()
                if snippet and len(snippet) >= 40:
                    snippets.append(snippet + '...')
        
        return snippets[:max_snippets]
    
    def _clean_snippet_start(self, snippet: str) -> str:
        """
        Clean up the beginning of a snippet to remove common web artifacts.
        """
        # Remove common prefixes that might be web artifacts
        prefixes_to_remove = [
            'Sign In ', 'Login ', 'Home ', 'Menu ', 'Search ', 'Filter ',
            'Updated: ', 'Published: ', 'Breaking: ', 'Latest: ',
            'TOI ', 'Times ', 'News/ ', 'Lifestyle/ ', 'Featured ',
            'Trending ', 'Popular ', 'Related ', 'More ', 'View ',
            'Share ', 'Like ', 'Follow ', 'Subscribe '
        ]
        
        snippet_cleaned = snippet
        for prefix in prefixes_to_remove:
            if snippet_cleaned.startswith(prefix):
                snippet_cleaned = snippet_cleaned[len(prefix):].strip()
        
        # Remove leading punctuation or symbols
        while snippet_cleaned and not snippet_cleaned[0].isalnum():
            snippet_cleaned = snippet_cleaned[1:].strip()
        
        return snippet_cleaned if len(snippet_cleaned) >= 20 else snippet

    def _analyze_cluster_traditional(self, cluster_id: int, student_names: List[str], student_texts: List[str]) -> Dict[str, Any]:
        """
        Traditional text-based cluster analysis (fallback method).
        """
        # Combine all texts in this cluster for TF-IDF
        combined_text = " ".join(student_texts)
        
        # Get top TF-IDF terms for this cluster
        try:
            # Use TF-IDF to find distinctive terms
            vectorizer = TfidfVectorizer(
                max_features=100,
                stop_words='english',
                ngram_range=(1, 2),
                min_df=1,
                max_df=0.8
            )
            
            # We need multiple documents for TF-IDF, so if we only have one text,
            # split it into sentences
            if len(student_texts) == 1:
                sentences = combined_text.split('. ')
                if len(sentences) > 1:
                    tfidf_docs = sentences
                else:
                    tfidf_docs = [combined_text]
            else:
                tfidf_docs = student_texts
            
            tfidf_matrix = vectorizer.fit_transform(tfidf_docs)
            feature_names = vectorizer.get_feature_names_out()
            
            # Get mean TF-IDF scores for each term across all documents in cluster
            mean_scores = np.mean(tfidf_matrix.toarray(), axis=0)
            
            # Get top terms
            top_indices = np.argsort(mean_scores)[-10:][::-1]
            top_keywords = [feature_names[i] for i in top_indices if mean_scores[i] > 0]
            
            # Clean up vectorizer and matrix to prevent memory leaks
            del vectorizer, tfidf_matrix, feature_names, mean_scores
            
        except Exception as e:
            print(f"    TF-IDF analysis failed for cluster {cluster_id}: {e}")
            # Fallback to simple word frequency
            words = combined_text.lower().split()
            word_freq = Counter(words)
            # Filter out common words manually
            common_words = {'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them'}
            filtered_freq = {word: count for word, count in word_freq.items() if word not in common_words and len(word) > 2}
            top_keywords = [word for word, count in sorted(filtered_freq.items(), key=lambda x: x[1], reverse=True)[:10]]
        
        # Extract representative snippets
        snippets = []
        for text in student_texts[:3]:  # Take up to 3 representative snippets
            # Take first sentence or first 100 characters
            sentences = text.split('. ')
            if sentences and len(sentences[0]) > 10:
                snippet = sentences[0] + ('.' if not sentences[0].endswith('.') else '')
            else:
                snippet = text[:100] + ('...' if len(text) > 100 else '')
            snippets.append(snippet)
        
        # Generate theme title from top keywords
        if top_keywords:
            # Use top 2-3 keywords to create a theme title
            title_words = top_keywords[:3]
            title = ' & '.join(title_words).title()
        else:
            title = f"Theme {cluster_id + 1}"
        
        return {
            "title": title,
            "description": f"Theme based on {len(student_names)} student responses",
            "keywords": top_keywords,
            "snippets": snippets,
            "document_count": len(student_names),
            "cluster_id": cluster_id,
            "student_names": student_names,
            "student_count": len(student_names)
        }

    def _polish_theme_names(self, themes_data: List[Dict[str, Any]], prompt_context: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Use LLM to polish and improve theme names based on keywords and snippets.
        Incorporates teacher-provided context for better theme structuring.
        
        Args:
            themes_data: List of theme dictionaries
            prompt_context: Optional context about the assignment
            
        Returns:
            Updated themes_data with polished titles
        """
        if not os.getenv("OPENAI_API_KEY"):
            print("No OpenAI API key found, skipping theme name polishing")
            return themes_data
        
        try:
            # Initialize LLM with same settings as group assignment
            llm = ChatOpenAI(
                model="gpt-5-mini", 
                api_key=os.getenv("OPENAI_API_KEY")
            )
            
            print(f"🎨 Polishing {len(themes_data)} theme names with LLM...")
            if self.llm_polish_prompt:
                print(f"  Using teacher context: {self.llm_polish_prompt[:100]}...")
            
            for i, theme in enumerate(themes_data):
                keywords = theme.get('keywords', [])
                snippets = theme.get('snippets', [])
                current_title = theme.get('title', '')
                
                if not keywords and not snippets:
                    print(f"  Theme {i+1}: Skipping (no keywords/snippets)")
                    continue
                
                try:
                    # Create context for LLM with teacher guidance
                    context_parts = []
                    
                    # Add teacher's custom structuring guidance if provided
                    if self.llm_polish_prompt:
                        context_parts.append(f"Teacher guidance: {self.llm_polish_prompt}")
                    
                    if prompt_context:
                        context_parts.append(f"Assignment context: {prompt_context}")
                    
                    if keywords:
                        context_parts.append(f"Key terms: {', '.join(keywords[:5])}")
                    
                    if snippets:
                        context_parts.append(f"Representative responses: {' | '.join(snippets[:2])}")
                    
                    context = '\n'.join(context_parts)
                    
                    # Enhanced prompt that incorporates teacher guidance
                    base_requirements = [
                        "- Professional but engaging",
                        "- Specific enough to distinguish from other themes", 
                        "- Accessible to students and educators",
                        "- Based on the key terms and response content"
                    ]
                    
                    if self.llm_polish_prompt:
                        prompt = f"""You are helping to create clear, engaging theme names for student response analysis.

Current theme: "{current_title}"

Context:
{context}

Create a concise, clear theme name (2-4 words) that captures the essence of this theme. The name should be:
{chr(10).join(base_requirements)}
- Aligned with the teacher's guidance about theme structure

Return only the theme name, nothing else."""
                    else:
                        prompt = f"""You are helping to create clear, engaging theme names for student response analysis.

Current theme: "{current_title}"

Context:
{context}

Create a concise, clear theme name (2-4 words) that captures the essence of this theme. The name should be:
{chr(10).join(base_requirements)}

Return only the theme name, nothing else."""

                    # Use same invocation pattern as group assignment
                    response = llm.invoke([
                        SystemMessage(content="You are a helpful educational content assistant."),
                        HumanMessage(content=prompt)
                    ])
                    
                    polished_title = response.content.strip().strip('"').strip("'")
                    
                    # Validate and apply the polished title
                    if polished_title and len(polished_title) < 50 and polished_title != current_title:
                        theme['title'] = polished_title
                        print(f"  Theme {i+1}: '{current_title}' -> '{polished_title}'")
                    else:
                        print(f"  Theme {i+1}: Keeping original title '{current_title}'")
                    
                except Exception as e:
                    print(f"  Theme {i+1}: Error polishing '{current_title}': {e}")
                    # Keep original title and continue
                    continue
                    
        except Exception as e:
            print(f"Error with LLM theme polishing: {e}")
            print("Continuing with auto-generated theme names...")
        
        return themes_data

    def _enhance_themes_with_web_search(self, themes_data: List[Dict[str, Any]], prompt_context: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Enhance themes by connecting them to recent events using web search and ChatOpenAI.
        
        Args:
            themes_data: List of theme dictionaries
            prompt_context: Optional context about the assignment
            
        Returns:
            Enhanced themes_data with recent event connections
        """
        if not os.getenv("OPENAI_API_KEY"):
            print("No OpenAI API key found, skipping web search enhancement")
            return themes_data
        
        try:
            from langchain_openai import ChatOpenAI
            from langchain.schema import SystemMessage, HumanMessage
            
            # Initialize LLM for web search queries and analysis
            llm = ChatOpenAI(
                model="gpt-4o-mini", 
                api_key=os.getenv("OPENAI_API_KEY")
            )
            
            print(f"🌐 Enhancing {len(themes_data)} themes with recent events...")
            
            enhanced_themes = []
            
            for i, theme in enumerate(themes_data):
                theme_title = theme.get('title', '')
                keywords = theme.get('keywords', [])
                snippets = theme.get('snippets', [])
                
                if not theme_title or not keywords:
                    print(f"  Theme {i+1}: Skipping (insufficient data)")
                    enhanced_themes.append(theme)
                    continue
                
                try:
                    # Generate web search query based on theme
                    search_query = self._generate_search_query(theme_title, keywords, prompt_context)
                    
                    if not search_query:
                        enhanced_themes.append(theme)
                        continue
                    
                    print(f"  Theme {i+1} '{theme_title}': Searching for '{search_query}'")
                    
                    # Perform web search using the web_search tool available in the environment
                    try:
                        search_results = self._perform_web_search(search_query)
                        
                        if search_results:
                            # Analyze search results and enhance theme
                            enhanced_theme = self._analyze_search_results_for_theme(
                                theme.copy(), search_results, search_query, llm
                            )
                            enhanced_themes.append(enhanced_theme)
                            print(f"    ✅ Enhanced with recent events")
                        else:
                            enhanced_themes.append(theme)
                            print(f"    ⚠️  No relevant search results found")
                    
                    except Exception as search_error:
                        print(f"    ⚠️  Search failed: {search_error}")
                        enhanced_themes.append(theme)
                        
                except Exception as e:
                    print(f"  Theme {i+1}: Error enhancing '{theme_title}': {e}")
                    enhanced_themes.append(theme)
                    continue
            
            return enhanced_themes
            
        except Exception as e:
            print(f"Error with web search enhancement: {e}")
            print("Continuing with original themes...")
            return themes_data

    def _generate_search_query(self, theme_title: str, keywords: List[str], prompt_context: Optional[str] = None) -> str:
        """
        Generate an effective web search query based on theme content.
        """
        try:
            # Use top keywords to create a focused search query
            top_keywords = keywords[:3] if keywords else []
            
            # Create search query combining theme and keywords
            if top_keywords:
                # Combine theme title with top keywords for better search results
                query_parts = [theme_title] + top_keywords
                search_query = ' '.join(query_parts)
                
                # Add recent events context
                search_query += " recent news 2024 2025"
                
                # Add context from prompt if available
                if prompt_context and len(prompt_context) < 100:
                    search_query += f" {prompt_context}"
                
                # Limit query length for better search results
                if len(search_query) > 100:
                    search_query = search_query[:100].rsplit(' ', 1)[0]
                
                return search_query
            else:
                return theme_title + " recent news"
                
        except Exception as e:
            print(f"Error generating search query: {e}")
            return theme_title

    def _perform_web_search(self, query: str) -> Optional[str]:
        """
        Perform web search using DuckDuckGo API for recent information.
        """
        try:
            import requests
            import json
            from urllib.parse import quote
            
            print(f"    Searching web for: {query}")
            
            # Use DuckDuckGo Instant Answer API (free and doesn't require API key)
            encoded_query = quote(query)
            url = f"https://api.duckduckgo.com/?q={encoded_query}&format=json&no_html=1&skip_disambig=1"
            
            # Make the request with a timeout
            response = requests.get(url, timeout=10, headers={
                'User-Agent': 'Mozilla/5.0 (compatible; ThemeCreator/1.0)'
            })
            
            if response.status_code == 200:
                data = response.json()
                
                # Extract relevant information from DuckDuckGo response
                search_results = []
                
                # Get abstract (main result)
                if data.get('Abstract'):
                    search_results.append(f"Summary: {data['Abstract']}")
                
                # Get related topics
                if data.get('RelatedTopics'):
                    for topic in data['RelatedTopics'][:3]:  # Limit to top 3
                        if isinstance(topic, dict) and topic.get('Text'):
                            search_results.append(f"Related: {topic['Text']}")
                
                # Get definition if available
                if data.get('Definition'):
                    search_results.append(f"Definition: {data['Definition']}")
                
                if search_results:
                    combined_results = ' '.join(search_results)
                    print(f"    Found {len(search_results)} search results")
                    return combined_results[:1000]  # Limit length
                else:
                    print(f"    No relevant results found")
                    return None
            else:
                print(f"    Search API returned status {response.status_code}")
                return None
                
        except requests.RequestException as e:
            print(f"    Web search request failed: {e}")
            return None
        except Exception as e:
            print(f"    Web search error: {e}")
            return None

    def _analyze_search_results_for_theme(self, theme: Dict[str, Any], search_results: str, 
                                        search_query: str, llm) -> Dict[str, Any]:
        """
        Analyze search results and enhance theme with recent events context.
        """
        try:
            theme_title = theme.get('title', '')
            keywords = theme.get('keywords', [])
            original_description = theme.get('description', '')
            
            # Create prompt for LLM to analyze search results and enhance theme
            enhancement_prompt = f"""You are analyzing a theme from student responses and connecting it to recent events.

THEME INFORMATION:
- Title: {theme_title}
- Keywords: {', '.join(keywords)}
- Original Description: {original_description}
- Search Query Used: {search_query}

SEARCH RESULTS:
{search_results}

TASK: Based on the theme content and search results, provide a brief enhancement that connects this theme to recent events, current context, or broader implications. Keep it factual and educational.

REQUIREMENTS:
- Write 1-2 sentences maximum
- Focus on recent events, current trends, or broader context from search results
- Be factual and cite information when possible
- Make it educational and relevant for students
- Connect the theme to larger patterns or recent developments
- If no meaningful connection exists, return "No recent connection found"

ENHANCED DESCRIPTION:"""

            response = llm.invoke([
                SystemMessage(content="You are an educational content assistant helping students understand current events."),
                HumanMessage(content=enhancement_prompt)
            ])
            
            enhancement = response.content.strip()
            
            # Only add enhancement if it's meaningful
            if enhancement and enhancement != "No recent connection found" and len(enhancement) > 20:
                # Add the enhancement to the theme description
                if original_description:
                    theme['description'] = f"{original_description} Recent context: {enhancement}"
                else:
                    theme['description'] = f"Recent context: {enhancement}"
                
                # Mark theme as enhanced
                theme['enhanced_with_web_search'] = True
                print(f"    Enhanced: {enhancement[:60]}...")
            else:
                theme['enhanced_with_web_search'] = False
            
            return theme
            
        except Exception as e:
            print(f"Error analyzing search results: {e}")
            theme['enhanced_with_web_search'] = False
            return theme

    def get_config(self) -> Dict[str, Any]:
        """Get the current configuration of the theme creator behavior."""
        return {
            "num_themes": self.num_themes,
            "label": self.label,
            "selected_submission_prompts": self.selected_submission_prompts,
            "use_llm_polish": self.use_llm_polish,
            "llm_polish_prompt": self.llm_polish_prompt,
            "filter_web_content": self.filter_web_content,
            "enhance_with_web_search": self.enhance_with_web_search
        }
    
    def _auto_fetch_student_data_from_prompts(self, db_session: Optional[Any] = None, deployment_context: Optional[str] = None) -> Optional[List[Dict[str, Any]]]:
        """
        Auto-fetch student data from prompt pages when no input is provided but selected_submission_prompts exist.
        This method tries to find the prompt page deployment based on the selected submission prompts configuration.
        """
        print(f"🔍 THEME AUTO-FETCH: Starting auto-fetch of student data")
        
        if not self.selected_submission_prompts:
            print(f"🔍 THEME AUTO-FETCH: No selected submission prompts, cannot auto-fetch")
            return None
        
        if not db_session:
            print(f"🔍 THEME AUTO-FETCH: No database session available, cannot auto-fetch")
            return None
        
        try:
            # Extract node information from selected submission prompts
            print(f"🔍 THEME AUTO-FETCH: Analyzing {len(self.selected_submission_prompts)} selected submission prompts")
            
            # Import the helper function to get submissions
            from api.deployments.deployment_prompt_routes import get_all_prompt_submissions_for_deployment
            from models.database.db_models import Deployment
            from sqlmodel import select
            
            # Strategy 1: Look for deployments with prompt submissions
            # Prioritize the current deployment context if available
            
            deployments_to_check = []
            
            # If we have deployment context, prioritize the corresponding page deployment
            if deployment_context:
                # Extract base deployment ID and look for page_1 deployment
                # deployment_context format: "d43c7ffe-bebd-497c-8685-b8b50b86f7c2_behavior_2"
                base_deployment_id = deployment_context.replace('_behavior_2', '').replace('_behavior_3', '')
                target_page_deployment = f"{base_deployment_id}_page_1"
                print(f"🔍 THEME AUTO-FETCH: Deployment context: {deployment_context}")
                print(f"🔍 THEME AUTO-FETCH: Prioritizing target deployment: {target_page_deployment}")
                
                # Get the target deployment first
                target_deployment = db_session.exec(
                    select(Deployment).where(
                        Deployment.is_active == True,
                        Deployment.deployment_id == target_page_deployment
                    )
                ).first()
                
                if target_deployment:
                    deployments_to_check.append(target_deployment)
                    print(f"🔍 THEME AUTO-FETCH: ✅ Found and prioritized target deployment: {target_page_deployment}")
                else:
                    print(f"🔍 THEME AUTO-FETCH: ❌ Target deployment not found: {target_page_deployment}")
            
            # Get all other page deployments as fallback
            all_page_deployments = db_session.exec(
                select(Deployment).where(
                    Deployment.is_active == True,
                    Deployment.deployment_id.like('%_page_%')
                )
            ).all()
            
            # Add other deployments that aren't already in our priority list
            for deployment in all_page_deployments:
                if deployment not in deployments_to_check:
                    deployments_to_check.append(deployment)
            
            print(f"🔍 THEME AUTO-FETCH: Found {len(deployments_to_check)} page deployments to check")
            
            # Try each deployment to find one with student submissions
            for deployment in deployments_to_check:
                try:
                    print(f"🔍 THEME AUTO-FETCH: Checking deployment: {deployment.deployment_id}")
                    result = get_all_prompt_submissions_for_deployment(deployment.deployment_id, db_session)
                    
                    if isinstance(result, dict):
                        students = result.get("students", [])
                        if students and len(students) > 0:
                            print(f"🔍 THEME AUTO-FETCH: Found {len(students)} students in deployment {deployment.deployment_id}")
                            
                            # Validate the student data format
                            valid_students = []
                            for student in students:
                                if isinstance(student, dict) and 'name' in student:
                                    valid_students.append(student)
                            
                            if valid_students:
                                print(f"🔍 THEME AUTO-FETCH: Successfully auto-fetched {len(valid_students)} valid students")
                                return valid_students
                    
                except Exception as e:
                    print(f"🔍 THEME AUTO-FETCH: Error checking deployment {deployment.deployment_id}: {e}")
                    continue
            
            print(f"🔍 THEME AUTO-FETCH: No student submissions found in any page deployment")
            return None
            
        except Exception as e:
            print(f"🔍 THEME AUTO-FETCH: Error during auto-fetch: {e}")
            import traceback
            print(f"🔍 THEME AUTO-FETCH: Traceback: {traceback.format_exc()}")
            return None
    
    def update_config(self, config: Dict[str, Any]) -> None:
        """Update the configuration of the theme creator behavior."""
        if 'num_themes' in config:
            self.num_themes = config['num_themes']
        if 'label' in config:
            self.label = config['label']
        if 'selected_submission_prompts' in config:
            self.selected_submission_prompts = config['selected_submission_prompts']
        if 'use_llm_polish' in config:
            self.use_llm_polish = config['use_llm_polish']
        if 'llm_polish_prompt' in config:
            self.llm_polish_prompt = config['llm_polish_prompt']
        if 'filter_web_content' in config:
            self.filter_web_content = config['filter_web_content']
        if 'enhance_with_web_search' in config:
            self.enhance_with_web_search = config['enhance_with_web_search']

# Database persistence is handled by pages_manager.save_behavior_execution
# Theme creator only focuses on theme generation, not persistence
