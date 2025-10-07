"""
Submission Matcher - Finds the most similar website submission to a summary

This script uses AI to analyze a batch of website data submissions and identify
which one is most similar to a summary provided by the user/instructor.
"""

import asyncio
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
import json
import os
from datetime import datetime

# LLM imports using existing patterns from your codebase
try:
    from langchain_openai import ChatOpenAI
    from langchain.schema import HumanMessage, SystemMessage
    from langchain_core.output_parsers import StrOutputParser
except ImportError:
    print("Warning: Could not import LangChain. Please install langchain and langchain-openai.")


@dataclass
class WebsiteSubmission:
    """Represents a single website submission from a student"""
    student_name: str
    url: str
    name: str
    purpose: str
    platform: str
    raw_data: Optional[Dict[str, Any]] = None


@dataclass
class SummaryData:
    """Represents the summary data from the form"""
    category: str
    purpose: str
    platform: str
    strategy: str


@dataclass
class MatchResult:
    """Result of the matching process"""
    best_match_student: str
    best_match_submission: WebsiteSubmission
    similarity_score: float
    reasoning: str
    all_scores: Dict[str, float]
    timestamp: datetime = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()


class SubmissionMatcher:
    """Main class for matching summaries to website submissions"""
    
    def __init__(self, model_name: str = "gpt-5", temperature: float = 0.3, max_tokens: int = 2000):
        """
        Initialize the submission matcher
        
        Args:
            model_name: The LLM model to use for matching (defaults to GPT-5)
            temperature: Temperature for LLM responses (lower = more deterministic)
            max_tokens: Maximum tokens for LLM responses
        """
        self.model_name = model_name
        self.temperature = temperature
        self.max_tokens = max_tokens
        
        # Check if OpenAI API key is available
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is required for SubmissionMatcher")
        
        # Initialize ChatOpenAI with API key
        self._llm = ChatOpenAI(
            model=model_name,
            api_key=api_key,
            max_tokens=max_tokens,
        )
        
        print(f"🔍 SubmissionMatcher initialized with {model_name} (temperature: {temperature})")
    
    async def find_best_match(
        self,
        summary: SummaryData,
        submissions: List[WebsiteSubmission],
        matching_strategy: str = "comprehensive"  # "comprehensive", "purpose_focused", "platform_focused"
    ) -> MatchResult:
        """
        Find the website submission that best matches the summary
        
        Args:
            summary: The summary data to match against
            submissions: List of website submissions to compare
            matching_strategy: Strategy for matching
            
        Returns:
            MatchResult with the best matching submission and reasoning
        """
        if not submissions:
            raise ValueError("No submissions provided for matching")
        
        if len(submissions) == 1:
            # If only one submission, return it with high confidence
            return MatchResult(
                best_match_student=submissions[0].student_name,
                best_match_submission=submissions[0],
                similarity_score=1.0,
                reasoning="Only one submission available, selected by default.",
                all_scores={submissions[0].student_name: 1.0}
            )
        
        # Build the matching prompt
        prompt = self._build_matching_prompt(summary, submissions, matching_strategy)
        
        # Get analysis from LLM
        analysis_result = await self._get_llm_analysis(prompt)
        
        # Parse the result
        best_match_student, similarity_score, reasoning, all_scores = self._parse_llm_result(
            analysis_result, 
            submissions
        )
        
        # Find the matching submission
        best_submission = next(
            (s for s in submissions if s.student_name == best_match_student),
            submissions[0]  # Fallback to first if not found
        )
        
        return MatchResult(
            best_match_student=best_match_student,
            best_match_submission=best_submission,
            similarity_score=similarity_score,
            reasoning=reasoning,
            all_scores=all_scores
        )
    
    def _build_matching_prompt(
        self,
        summary: SummaryData,
        submissions: List[WebsiteSubmission],
        matching_strategy: str
    ) -> str:
        """Build the prompt for LLM matching analysis"""
        
        strategy_instructions = {
            "comprehensive": """
            Analyze all aspects of the submissions to find the best match:
            - How well does the submission's purpose align with the summary purpose?
            - Does the platform match or relate to the summary platform?
            - Does the website exemplify the category mentioned in the summary?
            - Would this website be a good representative example of the pattern described?
            - Consider both explicit matches and conceptual alignment
            """,
            "purpose_focused": """
            Focus primarily on the purpose alignment:
            - Which submission's purpose most closely matches the summary purpose?
            - Look for semantic similarity, not just keyword matching
            - Consider the underlying intent and goals
            """,
            "platform_focused": """
            Focus primarily on the platform:
            - Which submission uses the platform mentioned in the summary?
            - If no exact match, which platform is most similar or related?
            - Consider platform categories (social media, news, etc.)
            """
        }
        
        prompt = f"""You are an expert at analyzing website submissions and matching them to summary descriptions.

SUMMARY TO MATCH:
Category: {summary.category}
Purpose: {summary.purpose}
Platform: {summary.platform}
Strategy: {summary.strategy}

WEBSITE SUBMISSIONS TO COMPARE ({len(submissions)} total):
"""
        
        for i, submission in enumerate(submissions, 1):
            prompt += f"""
Submission {i} - {submission.student_name}:
  Website Name: {submission.name}
  URL: {submission.url}
  Purpose: {submission.purpose}
  Platform: {submission.platform}
"""
        
        prompt += f"""

TASK:
{strategy_instructions.get(matching_strategy, strategy_instructions["comprehensive"])}

Analyze each submission and determine which one BEST matches the summary provided above.

IMPORTANT MATCHING CRITERIA:
1. The submission should exemplify the category described in the summary
2. The purpose should align with or be a specific example of the summary purpose
3. The platform should match or be closely related to the summary platform
4. Consider whether this would be a representative example for the strategy mentioned

Please provide your analysis in the following format:

ANALYSIS:
[Provide a brief analysis of how each submission compares to the summary]

BEST_MATCH: [Student name of the best matching submission]
CONFIDENCE: [A number between 0.0 and 1.0 indicating confidence]
REASONING: [2-3 sentences explaining why this is the best match]

SCORES:
[For each submission, provide a score from 0.0 to 1.0]
- {submissions[0].student_name}: [score]
- {submissions[1].student_name if len(submissions) > 1 else 'N/A'}: [score]
[Continue for all submissions]
"""
        
        return prompt
    
    async def _get_llm_analysis(self, prompt: str) -> str:
        """Get matching analysis from LLM"""
        
        try:
            print(f"🤖 Calling {self.model_name} for submission matching analysis...")
            
            # Create messages
            messages = [
                SystemMessage(content=(
                    "You are an expert AI assistant specialized in analyzing and matching website submissions "
                    "to summary descriptions. You excel at understanding semantic similarity, identifying patterns, "
                    "and determining which specific examples best represent broader categories or themes. "
                    "Your analysis is precise, well-reasoned, and based on careful comparison of all available data."
                )),
                HumanMessage(content=prompt)
            ]
            
            # Call the LLM
            result = await self._llm.ainvoke(messages)
            response = result.content if hasattr(result, "content") else str(result)
            
            print(f"🤖 {self.model_name} response received (length: {len(response)} chars)")
            
            return response
            
        except Exception as e:
            print(f"❌ Error getting LLM analysis: {e}")
            import traceback
            print(f"LLM error traceback:\n{traceback.format_exc()}")
            raise
    
    def _parse_llm_result(
        self, 
        response: str, 
        submissions: List[WebsiteSubmission]
    ) -> Tuple[str, float, str, Dict[str, float]]:
        """
        Parse LLM response to extract best match, score, reasoning, and all scores
        
        Returns:
            Tuple of (best_match_student, similarity_score, reasoning, all_scores_dict)
        """
        
        try:
            lines = response.strip().split('\n')
            best_match = None
            confidence = 0.5
            reasoning = ""
            all_scores = {}
            current_section = None
            
            for line in lines:
                line = line.strip()
                
                if line.upper().startswith('BEST_MATCH:'):
                    best_match = line.split(':', 1)[1].strip()
                elif line.upper().startswith('CONFIDENCE:'):
                    try:
                        confidence = float(line.split(':', 1)[1].strip())
                    except:
                        confidence = 0.5
                elif line.upper().startswith('REASONING:'):
                    reasoning = line.split(':', 1)[1].strip()
                    current_section = 'reasoning'
                elif line.upper().startswith('SCORES:'):
                    current_section = 'scores'
                elif current_section == 'reasoning' and line and not line.upper().startswith('SCORES:'):
                    reasoning += " " + line
                elif current_section == 'scores' and line.startswith('-'):
                    # Parse score line: "- Student Name: 0.85"
                    try:
                        parts = line[1:].strip().split(':')
                        if len(parts) == 2:
                            student_name = parts[0].strip()
                            score = float(parts[1].strip())
                            all_scores[student_name] = score
                    except:
                        pass
            
            # Validate and clean up the best match name
            if best_match:
                # Try to find exact match in submissions
                submission_names = [s.student_name for s in submissions]
                if best_match not in submission_names:
                    # Try fuzzy matching
                    for name in submission_names:
                        if name.lower() in best_match.lower() or best_match.lower() in name.lower():
                            best_match = name
                            break
                    else:
                        # If still no match, use first submission as fallback
                        best_match = submission_names[0]
                        print(f"⚠️ Could not match '{best_match}' to any submission, using fallback")
            else:
                best_match = submissions[0].student_name
                print(f"⚠️ No best match found in response, using fallback")
            
            # If no reasoning found, create a basic one
            if not reasoning:
                reasoning = f"Selected {best_match} as the best match based on overall similarity analysis."
            
            # If no scores found, create basic scores
            if not all_scores:
                all_scores = {s.student_name: (confidence if s.student_name == best_match else confidence * 0.5) 
                             for s in submissions}
            
            return best_match, confidence, reasoning.strip(), all_scores
            
        except Exception as e:
            print(f"Error parsing LLM result: {e}")
            # Fallback: return first submission
            return (
                submissions[0].student_name,
                0.5,
                "Analysis parsing failed, selected first submission as fallback.",
                {s.student_name: 0.5 for s in submissions}
            )


# Utility function for easy usage

async def match_summary_to_submission(
    summary_data: Dict[str, str],
    website_submissions: List[Dict[str, Any]],
    matching_strategy: str = "comprehensive",
    model_name: str = "gpt-5"
) -> MatchResult:
    """
    Convenient function to match a summary to website submissions
    
    Args:
        summary_data: Dict with 'category', 'purpose', 'platform', 'strategy' keys
        website_submissions: List of dicts with website submission data
        matching_strategy: Strategy for matching
        model_name: LLM model to use
    
    Returns:
        MatchResult with the best match
    """
    
    # Convert summary data to SummaryData object
    summary = SummaryData(
        category=summary_data.get('category', ''),
        purpose=summary_data.get('purpose', ''),
        platform=summary_data.get('platform', ''),
        strategy=summary_data.get('strategy', '')
    )
    
    # Convert submissions to WebsiteSubmission objects
    submissions = []
    for sub in website_submissions:
        submission = WebsiteSubmission(
            student_name=sub.get('student_name', 'Unknown'),
            url=sub.get('url', ''),
            name=sub.get('name', ''),
            purpose=sub.get('purpose', ''),
            platform=sub.get('platform', ''),
            raw_data=sub
        )
        submissions.append(submission)
    
    # Create matcher and find best match
    matcher = SubmissionMatcher(model_name=model_name)
    return await matcher.find_best_match(
        summary=summary,
        submissions=submissions,
        matching_strategy=matching_strategy
    )


# Example usage and testing
if __name__ == "__main__":
    async def test_matcher():
        """Test the submission matcher with sample data"""
        
        # Sample summary from the form
        summary_data = {
            'category': 'Misinformation Websites',
            'purpose': 'These websites spread false health information and conspiracy theories',
            'platform': 'Independent news sites and blogs',
            'strategy': 'Teach students to verify sources and check for credible citations'
        }
        
        # Sample website submissions
        website_submissions = [
            {
                'student_name': 'Alice Johnson',
                'url': 'https://naturalnewsexample.com',
                'name': 'Natural News',
                'purpose': 'Spreads health misinformation and conspiracy theories',
                'platform': 'Independent blog'
            },
            {
                'student_name': 'Bob Smith',
                'url': 'https://infowarsexample.com',
                'name': 'InfoWars',
                'purpose': 'Political conspiracy theories and fake news',
                'platform': 'Independent news site'
            },
            {
                'student_name': 'Carol Davis',
                'url': 'https://healthyhomeexample.com',
                'name': 'Healthy Home',
                'purpose': 'Alternative medicine advice without scientific backing',
                'platform': 'Health blog'
            },
            {
                'student_name': 'David Wilson',
                'url': 'https://truthseekerexample.com',
                'name': 'Truth Seeker',
                'purpose': 'Questions mainstream science and promotes pseudoscience',
                'platform': 'Independent website'
            }
        ]
        
        print("Testing Submission Matcher...")
        print("=" * 50)
        
        # Test matching
        result = await match_summary_to_submission(
            summary_data=summary_data,
            website_submissions=website_submissions,
            matching_strategy="comprehensive"
        )
        
        print(f"\nBEST MATCH FOUND:")
        print(f"Student: {result.best_match_student}")
        print(f"Website: {result.best_match_submission.name}")
        print(f"URL: {result.best_match_submission.url}")
        print(f"Confidence Score: {result.similarity_score:.2f}")
        print(f"\nReasoning: {result.reasoning}")
        print(f"\nAll Scores:")
        for student, score in result.all_scores.items():
            print(f"  {student}: {score:.2f}")
    
    # Run the test
    asyncio.run(test_matcher())
