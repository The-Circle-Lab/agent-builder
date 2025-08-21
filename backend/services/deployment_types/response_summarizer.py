"""
Response Summarizer - Creates summaries of student responses to questions

This script analyzes student submissions to questions and generates summaries
either for individual groups or across all students.
"""

import asyncio
from typing import List, Dict, Any, Optional, Union
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
class StudentResponse:
    """Represents a single student's response to a question"""
    student_id: str
    student_name: str
    response_text: str
    timestamp: Optional[datetime] = None
    group_id: Optional[str] = None


@dataclass
class QuestionContext:
    """Context information about the question that was asked"""
    question_text: str
    question_type: str = "open_ended"  # open_ended, multiple_choice, etc.
    additional_context: Optional[str] = None
    prompt_id: Optional[str] = None


@dataclass
class SummaryResult:
    """Result of the summarization process"""
    summary_text: str
    key_themes: List[str]
    student_count: int
    group_id: Optional[str] = None
    timestamp: datetime = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()


class ResponseSummarizer:
    """Main class for summarizing student responses"""
    
    def __init__(self, model_name: str = "gpt-5", temperature: float = 1.0, max_tokens: int = 1500):
        """
        Initialize the response summarizer with GPT-5
        
        Args:
            model_name: The LLM model to use for summarization (defaults to GPT-5)
            temperature: Temperature for LLM responses (GPT-5 only supports default value of 1.0)
            max_tokens: Maximum tokens for LLM responses
        """
        self.model_name = model_name
        self.temperature = temperature
        self.max_tokens = max_tokens
        
        # Initialize GPT-5 - note that GPT-5 only supports temperature=1.0
        if model_name == "gpt-5":
            if temperature != 1.0:
                print(f"⚠️  GPT-5 only supports temperature=1.0, adjusting from {temperature} to 1.0")
            self._llm = ChatOpenAI(
                model=model_name,
                temperature=1.0,  # GPT-5 only supports default temperature
                max_tokens=max_tokens,
            )
        else:
            # For other models, use the specified temperature
            self._llm = ChatOpenAI(
                model=model_name,
                temperature=temperature,
                max_tokens=max_tokens,
            )
        
        print(f"🤖 ResponseSummarizer initialized with {model_name} (temperature: {1.0 if model_name == 'gpt-5' else temperature})")
    
    async def summarize_responses(
        self,
        question_context: QuestionContext,
        student_responses: List[StudentResponse],
        group_by: str = "all",  # "all", "group", or "individual"
        summary_style: str = "comprehensive"  # "comprehensive", "brief", "themes_only"
    ) -> Union[SummaryResult, List[SummaryResult]]:
        """
        Summarize student responses to a question
        
        Args:
            question_context: Information about the question that was asked
            student_responses: List of student responses to summarize
            group_by: How to group the responses ("all", "group", "individual")
            summary_style: Style of summary to generate
            
        Returns:
            Single SummaryResult or list of SummaryResults depending on grouping
        """
        if not student_responses:
            return SummaryResult(
                summary_text="No student responses to summarize.",
                key_themes=[],
                student_count=0
            )
        
        if group_by == "all":
            return await self._summarize_all_responses(question_context, student_responses, summary_style)
        elif group_by == "group":
            return await self._summarize_by_groups(question_context, student_responses, summary_style)
        elif group_by == "individual":
            return await self._summarize_individual_responses(question_context, student_responses, summary_style)
        else:
            raise ValueError(f"Invalid group_by option: {group_by}")
    
    async def _summarize_all_responses(
        self,
        question_context: QuestionContext,
        student_responses: List[StudentResponse],
        summary_style: str
    ) -> SummaryResult:
        """Summarize all responses together"""
        
        # Prepare the prompt for the LLM
        prompt = self._build_summarization_prompt(
            question_context, 
            student_responses, 
            summary_style,
            group_context="all students"
        )
        
        # Get summary from LLM
        summary_text, key_themes = await self._get_llm_summary(prompt, summary_style)
        
        return SummaryResult(
            summary_text=summary_text,
            key_themes=key_themes,
            student_count=len(student_responses)
        )
    
    async def _summarize_by_groups(
        self,
        question_context: QuestionContext,
        student_responses: List[StudentResponse],
        summary_style: str
    ) -> List[SummaryResult]:
        """Summarize responses grouped by student groups"""
        
        # Group responses by group_id
        grouped_responses = {}
        for response in student_responses:
            group_id = response.group_id or "no_group"
            if group_id not in grouped_responses:
                grouped_responses[group_id] = []
            grouped_responses[group_id].append(response)
        
        # Create summaries for each group
        summaries = []
        for group_id, group_responses in grouped_responses.items():
            prompt = self._build_summarization_prompt(
                question_context,
                group_responses,
                summary_style,
                group_context=f"Group {group_id}"
            )
            
            summary_text, key_themes = await self._get_llm_summary(prompt, summary_style)
            
            summaries.append(SummaryResult(
                summary_text=summary_text,
                key_themes=key_themes,
                student_count=len(group_responses),
                group_id=group_id
            ))
        
        return summaries
    
    async def _summarize_individual_responses(
        self,
        question_context: QuestionContext,
        student_responses: List[StudentResponse],
        summary_style: str
    ) -> List[SummaryResult]:
        """Create individual summaries for each response (useful for detailed analysis)"""
        
        summaries = []
        for response in student_responses:
            prompt = self._build_summarization_prompt(
                question_context,
                [response],
                summary_style,
                group_context=f"Student {response.student_name}"
            )
            
            summary_text, key_themes = await self._get_llm_summary(prompt, summary_style)
            
            summaries.append(SummaryResult(
                summary_text=summary_text,
                key_themes=key_themes,
                student_count=1,
                group_id=response.group_id
            ))
        
        return summaries
    
    def _build_summarization_prompt(
        self,
        question_context: QuestionContext,
        responses: List[StudentResponse],
        summary_style: str,
        group_context: str
    ) -> str:
        """Build the prompt for LLM summarization"""
        
        style_instructions = {
            "comprehensive": """
            Create a comprehensive summary that synthesizes the student responses by:
            - Identifying the main themes and ideas that emerged from the students' actual responses
            - Highlighting different perspectives and viewpoints students shared
            - Noting areas where students agreed or disagreed
            - Capturing specific insights, examples, or connections students made
            - Drawing meaningful conclusions based on what students actually wrote
            - Focus on the CONTENT of their responses, not generic observations about engagement
            """,
            "brief": """
            Create a brief, focused summary that captures:
            - The main themes that emerged from students' responses
            - Key points of agreement or consensus among students
            - The most significant insights students shared
            - Base this entirely on what students actually wrote, not assumptions
            """,
            "themes_only": """
            Extract the main themes directly from student responses:
            - Identify 3-7 key themes based on what students actually said
            - Provide brief explanation for each theme with examples from responses
            - Note how many students mentioned each theme
            """
        }
        
        prompt = f"""You are analyzing student responses to an educational question. Please create a {summary_style} summary for {group_context}.

QUESTION CONTEXT:
Question: {question_context.question_text}
Type: {question_context.question_type}
{f"Additional Context: {question_context.additional_context}" if question_context.additional_context else ""}

STUDENT RESPONSES ({len(responses)} total):
"""
        
        for i, response in enumerate(responses, 1):
            prompt += f"""
Response {i} - {response.student_name}:
{response.response_text}
"""
        
        prompt += f"""

INSTRUCTIONS:
{style_instructions.get(summary_style, style_instructions["comprehensive"])}

IMPORTANT: 
- Analyze the actual content of each student's response
- Do NOT use generic phrases like "students showed good engagement" or "varying levels of depth"
- Focus on the specific ideas, opinions, examples, and insights students shared
- Reference what students actually said in their responses

Please format your response as:
SUMMARY:
[Your detailed summary based on the actual student responses above]

KEY_THEMES:
- Theme 1: [Description based on what students wrote]
- Theme 2: [Description based on what students wrote]
- Theme 3: [Description based on what students wrote]
[Continue as needed]
"""
        
        return prompt
    
    async def _get_llm_summary(self, prompt: str, summary_style: str) -> tuple[str, List[str]]:
        """Get summary from LLM and parse the response"""
        
        try:
            print(f"🤖 Calling GPT-5 for advanced group response summarization...")
            
            # Create messages for GPT-5
            messages = [
                SystemMessage(content=(
                    "You are an advanced AI educational assistant powered by GPT-5, specialized in analyzing and "
                    "synthesizing student responses to academic discussion questions. Your enhanced reasoning capabilities "
                    "allow you to identify nuanced themes, subtle connections between ideas, and meaningful patterns "
                    "in student thinking. "
                    "\n\n"
                    "Your objectives:\n"
                    "- Extract and synthesize the core ideas from actual student responses\n"
                    "- Identify sophisticated themes and intellectual connections students are making\n"
                    "- Recognize diverse perspectives and how they complement or contrast with each other\n"
                    "- Highlight innovative insights, creative connections, or particularly thoughtful analysis\n"
                    "- Focus entirely on the substance of what students wrote, not their engagement level\n"
                    "- Use your advanced reasoning to find deeper patterns that might not be immediately obvious"
                )),
                HumanMessage(content=prompt)
            ]
            
            # Call the LLM using the same pattern as your existing code
            result = await self._llm.ainvoke(messages)
            response = result.content if hasattr(result, "content") else str(result)
            
            print(f"🤖 GPT-5 response received (length: {len(response)} chars)")
            
            # Parse the response to extract summary and themes
            summary_text, key_themes = self._parse_llm_response(response)
            
            return summary_text, key_themes
            
        except Exception as e:
            print(f"❌ Error getting LLM summary: {e}")
            import traceback
            print(f"LLM error traceback:\n{traceback.format_exc()}")
            return self._create_fallback_summary(prompt), []
    
    def _parse_llm_response(self, response: str) -> tuple[str, List[str]]:
        """Parse LLM response to extract summary and themes"""
        
        try:
            lines = response.strip().split('\n')
            summary_lines = []
            theme_lines = []
            current_section = None
            
            for line in lines:
                line = line.strip()
                if line.upper().startswith('SUMMARY:'):
                    current_section = 'summary'
                    summary_content = line[8:].strip()  # Remove "SUMMARY:" prefix
                    if summary_content:
                        summary_lines.append(summary_content)
                elif line.upper().startswith('KEY_THEMES:'):
                    current_section = 'themes'
                elif current_section == 'summary' and line:
                    summary_lines.append(line)
                elif current_section == 'themes' and line.startswith('-'):
                    theme_lines.append(line[1:].strip())  # Remove "- " prefix
            
            summary_text = '\n'.join(summary_lines).strip()
            key_themes = [theme for theme in theme_lines if theme]
            
            if not summary_text:
                summary_text = response  # Fallback to full response
            
            return summary_text, key_themes
            
        except Exception as e:
            print(f"Error parsing LLM response: {e}")
            return response, []
    
    def _create_fallback_summary(self, prompt: str) -> str:
        """Create a basic fallback summary when LLM is unavailable"""
        return "Summary generation temporarily unavailable. Please check LLM configuration."


# Utility functions for easy usage

async def summarize_student_responses(
    question_text: str,
    responses_data: List[Dict[str, Any]],
    group_by: str = "all",
    summary_style: str = "comprehensive",
    model_name: str = "gpt-5"
) -> Union[SummaryResult, List[SummaryResult]]:
    """
    Convenient function to summarize student responses
    
    Args:
        question_text: The question that was asked
        responses_data: List of dicts with student response data
        group_by: How to group responses ("all", "group", "individual")
        summary_style: Style of summary ("comprehensive", "brief", "themes_only")
        llm_provider: LLM provider to use
    
    Returns:
        Summary result(s)
    """
    
    # Convert response data to StudentResponse objects
    student_responses = []
    for data in responses_data:
        response = StudentResponse(
            student_id=data.get('student_id', ''),
            student_name=data.get('student_name', 'Unknown'),
            response_text=data.get('response_text', ''),
            group_id=data.get('group_id'),
            timestamp=data.get('timestamp')
        )
        student_responses.append(response)
    
    # Create question context
    question_context = QuestionContext(
        question_text=question_text,
        question_type=responses_data[0].get('question_type', 'open_ended') if responses_data else 'open_ended',
        additional_context=responses_data[0].get('additional_context') if responses_data else None
    )
    
    # Create summarizer and generate summary
    summarizer = ResponseSummarizer(model_name=model_name)
    return await summarizer.summarize_responses(
        question_context=question_context,
        student_responses=student_responses,
        group_by=group_by,
        summary_style=summary_style
    )


def save_summary_to_file(summary: Union[SummaryResult, List[SummaryResult]], filepath: str):
    """Save summary results to a JSON file"""
    
    def summary_to_dict(s: SummaryResult) -> Dict[str, Any]:
        return {
            'summary_text': s.summary_text,
            'key_themes': s.key_themes,
            'student_count': s.student_count,
            'group_id': s.group_id,
            'timestamp': s.timestamp.isoformat() if s.timestamp else None
        }
    
    if isinstance(summary, list):
        data = [summary_to_dict(s) for s in summary]
    else:
        data = summary_to_dict(summary)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


# Example usage and testing
if __name__ == "__main__":
    async def test_summarizer():
        """Test the response summarizer with sample data"""
        
        # Sample student responses
        sample_responses = [
            {
                'student_id': 'student1',
                'student_name': 'Alice Johnson',
                'response_text': 'I think climate change is one of the most pressing issues of our time. We need to transition to renewable energy sources and implement carbon pricing to reduce emissions.',
                'group_id': 'Group1'
            },
            {
                'student_id': 'student2',
                'student_name': 'Bob Smith',
                'response_text': 'While climate change is important, I believe we also need to address economic inequality. Environmental policies should consider their impact on working families.',
                'group_id': 'Group1'
            },
            {
                'student_id': 'student3',
                'student_name': 'Carol Davis',
                'response_text': 'Technology will be key to solving environmental challenges. Innovation in clean energy, carbon capture, and sustainable agriculture can help us address climate issues.',
                'group_id': 'Group2'
            },
            {
                'student_id': 'student4',
                'student_name': 'David Wilson',
                'response_text': 'I think individual actions matter too. People need to change their consumption habits and lifestyle choices to reduce their environmental impact.',
                'group_id': 'Group2'
            }
        ]
        
        # Test different summarization approaches
        question = "What do you think is the most important environmental issue facing society today, and what solutions would you propose?"
        
        print("Testing Response Summarizer...")
        print("=" * 50)
        
        # Test summarizing all responses together using GPT-5
        all_summary = await summarize_student_responses(
            question_text=question,
            responses_data=sample_responses,
            group_by="all",
            summary_style="comprehensive",
            model_name="gpt-5"
        )
        
        print("ALL STUDENTS SUMMARY:")
        print(f"Summary: {all_summary.summary_text}")
        print(f"Key Themes: {all_summary.key_themes}")
        print(f"Student Count: {all_summary.student_count}")
        print()
        
        # Test summarizing by groups using GPT-5
        group_summaries = await summarize_student_responses(
            question_text=question,
            responses_data=sample_responses,
            group_by="group",
            summary_style="brief",
            model_name="gpt-5"
        )
        
        print("GROUP SUMMARIES:")
        for summary in group_summaries:
            print(f"Group {summary.group_id}:")
            print(f"  Summary: {summary.summary_text}")
            print(f"  Key Themes: {summary.key_themes}")
            print(f"  Student Count: {summary.student_count}")
            print()
    
    # Run the test
    asyncio.run(test_summarizer())
