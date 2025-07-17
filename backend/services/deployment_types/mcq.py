import uuid
import random

class MCQQuestion:
    def __init__(self, question: str, answers: list[str], correct_answer: int):
        self.question = question
        self.answers = answers
        self.correct_answer = answers[correct_answer]

class MCQDeployment:
    def __init__(self, name: str, description: str, questions: list[MCQQuestion], question_count: int = -1, randomize: bool = True):
        self.name = name
        self.description = description
        self.questions = questions
        self.question_count = question_count
        self.randomize = randomize

    @staticmethod
    def from_questions_json(questions_data: list[dict]) -> list[MCQQuestion]:
        questions = []
        print("\n\n\n")
        questions_data = questions_data[0]['config']['questions']
        for q_data in questions_data:
            question = MCQQuestion(
                question=q_data["text"],
                answers=q_data["answers"], 
                correct_answer=q_data["correctAnswer"]
            )
            questions.append(question)
        return questions

    def to_dict(self):
        return {
            "name": self.name,
            "description": self.description,
            "questions": [
                {
                    "question": q.question,
                    "answers": q.answers,
                    "correct_answer": q.correct_answer
                }
                for q in self.questions
            ],
            "question_count": self.question_count,
            "randomize": self.randomize,
        }

    def create_question_set(self, question_count: int, randomize: bool = True):
        if question_count == -1:
            question_count = len(self.questions)
        available_indices = list(range(len(self.questions)))
        
        if randomize:
            random.shuffle(available_indices)
        
        return available_indices[:min(question_count, len(self.questions))]
    
    def get_question_title(self, question_id: int):
        return self.questions[question_id].question
    
    def get_question_possible_answers(self, question_id: int):
        return self.questions[question_id].answers
    
    def get_question_correct_answer(self, question_id: int):
        return self.questions[question_id].correct_answer
    


