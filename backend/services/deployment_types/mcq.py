from __future__ import annotations

import random
from typing import Any, Dict, List, Optional

from services.deployment_types.chat import Chat


class MCQQuestion:
    def __init__(
        self,
        *,
        identifier: int,
        question: str,
        answers: List[str],
        correct_answer_index: int,
        wrong_answer_messages: Optional[List[str]] = None,
    ) -> None:
        self.identifier = identifier
        self.question = question
        self.answers = answers
        self.correct_answer_index = correct_answer_index

        sanitized_messages: List[str] = []
        if isinstance(wrong_answer_messages, list):
            for message in wrong_answer_messages:
                sanitized_messages.append(str(message or "").strip())

        if len(sanitized_messages) < len(self.answers):
            sanitized_messages.extend([""] * (len(self.answers) - len(sanitized_messages)))
        elif len(sanitized_messages) > len(self.answers):
            sanitized_messages = sanitized_messages[: len(self.answers)]

        self.wrong_answer_messages = sanitized_messages

    @property
    def correct_answer(self) -> str:
        try:
            return self.answers[self.correct_answer_index]
        except (IndexError, TypeError):
            return ""

    def has_feedback_messages(self) -> bool:
        for idx, message in enumerate(self.wrong_answer_messages):
            if idx == self.correct_answer_index:
                continue
            if message:
                return True
        return False

    def get_feedback_for_answer(self, selected_answer: str) -> Optional[str]:
        if not selected_answer:
            return None

        try:
            answer_index = self.answers.index(selected_answer)
        except ValueError:
            return None

        if answer_index == self.correct_answer_index:
            return None

        if answer_index < len(self.wrong_answer_messages):
            message = self.wrong_answer_messages[answer_index].strip()
            if message:
                return message
        return None


class MCQDeployment:
    DEFAULT_CHAT_MODEL = "gpt-4o-2024-08-06"

    def __init__(
        self,
        *,
        name: str,
        description: str,
        questions: List[MCQQuestion],
        question_count: int = -1,
        randomize: bool = True,
        one_question_at_a_time: bool = False,
        tell_answer_after_each_question: bool = False,
        add_chatbot_after_wrong_answer: bool = False,
        chatbot_system_prompt: str = "",
        add_message_after_wrong_answer: bool = False,
        wrong_answer_message: str = "",
    ) -> None:
        self.name = name
        self.description = description
        self.questions = questions
        self.question_count = question_count
        self.randomize = randomize
        self.one_question_at_a_time = one_question_at_a_time
        self.tell_answer_after_each_question = tell_answer_after_each_question
        self.add_chatbot_after_wrong_answer = add_chatbot_after_wrong_answer
        self.chatbot_system_prompt = chatbot_system_prompt.strip()
        self.add_message_after_wrong_answer = add_message_after_wrong_answer
        self.wrong_answer_message = wrong_answer_message.strip()

    @classmethod
    def from_config(cls, node_config: Dict[str, Any]) -> "MCQDeployment":
        config = node_config.get("config", {})
        attachments = node_config.get("attachments", {})
        questions_blob = attachments.get("questions", [])

        raw_question_entries: List[Dict[str, Any]] = []
        if isinstance(questions_blob, list):
            for q_attachment in questions_blob:
                q_config = q_attachment.get("config", {}) if isinstance(q_attachment, dict) else {}

                embedded_questions = q_config.get("questions")
                if isinstance(embedded_questions, list) and embedded_questions:
                    raw_question_entries.extend(embedded_questions)
                elif q_config:
                    raw_question_entries.append(q_config)

        if not raw_question_entries:
            fallback_questions = config.get("questions")
            if isinstance(fallback_questions, list):
                raw_question_entries.extend(fallback_questions)

        questions: List[MCQQuestion] = []
        for idx, question_payload in enumerate(raw_question_entries):
            answers = question_payload.get("answers") or []
            correct_index = question_payload.get("correctAnswer")
            if correct_index is None and question_payload.get("correct_answer") is not None:
                correct_index = question_payload["correct_answer"]
            if correct_index is None and question_payload.get("correctAnswerIndex") is not None:
                correct_index = question_payload["correctAnswerIndex"]

            wrong_messages_payload = question_payload.get("wrongAnswerMessages")
            if wrong_messages_payload is None and question_payload.get("wrong_answer_messages") is not None:
                wrong_messages_payload = question_payload["wrong_answer_messages"]

            try:
                answers_list = list(answers)
            except TypeError:
                answers_list = []

            if not all(isinstance(answer, str) for answer in answers_list):
                answers_list = [str(answer) for answer in answers_list]

            try:
                wrong_messages_list = list(wrong_messages_payload) if isinstance(wrong_messages_payload, list) else []
            except TypeError:
                wrong_messages_list = []

            try:
                resolved_correct_index = int(correct_index) if correct_index is not None else 0
            except (TypeError, ValueError):
                resolved_correct_index = 0

            if resolved_correct_index < 0:
                resolved_correct_index = 0
            if answers_list:
                resolved_correct_index = min(resolved_correct_index, len(answers_list) - 1)
            else:
                resolved_correct_index = 0

            questions.append(
                MCQQuestion(
                    identifier=idx,
                    question=str(question_payload.get("text") or question_payload.get("question") or ""),
                    answers=answers_list,
                    correct_answer_index=resolved_correct_index,
                    wrong_answer_messages=wrong_messages_list,
                )
            )

        node_meta = questions_blob[0].get("config", {}) if questions_blob else node_config.get("config", {})
        node_config_meta = node_config.get("config", {})

        name = (
            node_meta.get("title")
            or node_config_meta.get("title")
            or node_meta.get("label")
            or node_config_meta.get("label")
            or node_config.get("label")
            or "MCQ"
        )
        description = (
            node_meta.get("description")
            or node_config_meta.get("description")
            or ""
        )

        raw_question_count = node_config_meta.get("questionsGiven", -1)
        try:
            question_count = int(raw_question_count)
        except (TypeError, ValueError):
            question_count = -1

        if question_count < 0 or question_count > len(questions):
            question_count = len(questions)

        return cls(
            name=name,
            description=description,
            questions=questions,
            question_count=question_count,
            randomize=bool(config.get("randomizeQuestions", True)),
            one_question_at_a_time=bool(config.get("one_question_at_a_time", False)),
            tell_answer_after_each_question=bool(config.get("tell_answer_after_each_question", False)),
            add_chatbot_after_wrong_answer=bool(config.get("add_chatbot_after_wrong_answer", False)),
            chatbot_system_prompt=str(config.get("chatbot_system_prompt", "") or ""),
            add_message_after_wrong_answer=bool(config.get("add_message_after_wrong_answer", False)),
            wrong_answer_message=str(config.get("wrong_answer_message", "") or ""),
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "questions": [
                {
                    "question": q.question,
                    "answers": q.answers,
                    "correct_answer": q.correct_answer,
                }
                for q in self.questions
            ],
            "question_count": self.question_count,
            "randomize": self.randomize,
            "one_question_at_a_time": self.one_question_at_a_time,
            "tell_answer_after_each_question": self.tell_answer_after_each_question,
            "add_chatbot_after_wrong_answer": self.add_chatbot_after_wrong_answer,
            "chatbot_system_prompt": self.chatbot_system_prompt,
            "add_message_after_wrong_answer": self.add_message_after_wrong_answer,
            "wrong_answer_message": self.wrong_answer_message,
        }

    def create_question_set(self, question_count: int, randomize: bool = True) -> List[int]:
        if question_count == -1:
            question_count = len(self.questions)
        available_indices = list(range(len(self.questions)))

        if randomize:
            random.shuffle(available_indices)

        return available_indices[: min(question_count, len(self.questions))]

    def get_question_title(self, question_id: int) -> str:
        return self.questions[question_id].question

    def get_question_possible_answers(self, question_id: int) -> List[str]:
        return self.questions[question_id].answers

    def get_question_correct_answer(self, question_id: int) -> str:
        return self.questions[question_id].correct_answer

    def should_reveal_correct_answer(self, *, session_completed: bool = False) -> bool:
        if self.tell_answer_after_each_question:
            return True
        return session_completed

    def feedback_message_enabled(self) -> bool:
        if not self.add_message_after_wrong_answer:
            return False
        if self.wrong_answer_message:
            return True
        return any(question.has_feedback_messages() for question in self.questions)

    def get_feedback_message(self) -> Optional[str]:
        if not self.add_message_after_wrong_answer:
            return None
        return self.wrong_answer_message or None

    def get_feedback_message_for_answer(self, question_index: int, selected_answer: str) -> Optional[str]:
        if not self.add_message_after_wrong_answer:
            return None

        try:
            question = self.questions[question_index]
        except IndexError:
            return self.get_feedback_message()

        message = question.get_feedback_for_answer(selected_answer)
        if message:
            return message

        return self.get_feedback_message()

    def chatbot_enabled(self) -> bool:
        return self.add_chatbot_after_wrong_answer and self.tell_answer_after_each_question

    def _build_chat_config(self) -> Dict[str, Any]:
        system_prompt = self.chatbot_system_prompt or (
            "You are a helpful tutor. Explain the reasoning for the correct answer and provide study tips."
        )

        return {
            "has_mcp": False,
            "mcp_has_documents": False,
            "collection_name": None,
            "use_extended_tools": False,
            "llm_config": {
                "model": self.DEFAULT_CHAT_MODEL,
                "temperature": 0.7,
                "max_tokens": 600,
                "top_p": 0.9,
            },
            "agent_config": {
                "prompt": "{input}",
                "system_prompt": system_prompt,
            },
        }

    async def run_chat(
        self,
        *,
        message: str,
        history: Optional[List[List[str]]] = None,
        user_id: Optional[int] = None,
        context: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not self.chatbot_enabled():
            raise ValueError("Chatbot is not enabled for this MCQ deployment")

        chat_service = Chat(
            config=self._build_chat_config(),
            rag_used=False,
            collection_name="",
        )
        composed_message = message
        if context:
            context_block = context.strip()
            if context_block:
                composed_message = (
                    "Here is context about the student's incorrect answers so far:\n"
                    f"{context_block}\n\n"
                    f"Student question: {message}"
                )

        return await chat_service.chat(composed_message, history or [], user_id=user_id)



