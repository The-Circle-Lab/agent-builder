"use client";

import React, { useState, useEffect } from 'react';
import {
  MCQDeploymentAPI,
  MCQSession,
  MCQAnswer,
} from '@/lib/deploymentAPIs/mcqDeploymentAPI';
import {
  MCQHeader,
  QuestionNavigationSidebar,
  QuestionDisplay,
  LoadingState,
  WrongAnswerChatPanel,
  MCQChatMessage,
} from './components';

interface MCQInterfaceProps {
  deploymentId: string;
  deploymentName: string;
  onClose: () => void;
  onSessionCompleted?: () => void | Promise<void>;
}

const buildSubmittedAnswerMap = (answers?: MCQAnswer[]) => {
  const map: Record<number, MCQAnswer> = {};
  if (answers) {
    answers.forEach((answer) => {
      map[answer.question_index] = answer;
    });
  }
  return map;
};

const buildChatHistory = (messages: MCQChatMessage[]): string[][] => {
  const pairs: string[][] = [];
  for (let i = 0; i < messages.length; i += 2) {
    const userMessage = messages[i];
    const assistantMessage = messages[i + 1];
    if (
      userMessage &&
      userMessage.role === 'user' &&
      assistantMessage &&
      assistantMessage.role === 'assistant'
    ) {
      pairs.push([userMessage.content, assistantMessage.content]);
    } else if (userMessage && userMessage.role === 'user' && !assistantMessage) {
      pairs.push([userMessage.content, '']);
    }
  }
  return pairs;
};

const deriveInitialQuestionIndex = (sessionData: MCQSession) => {
  if (!sessionData.one_question_at_a_time) {
    return 0;
  }

  if (sessionData.answered_count >= sessionData.total_questions) {
    return Math.max(sessionData.total_questions - 1, 0);
  }

  return Math.max(Math.min(sessionData.answered_count, sessionData.questions.length - 1), 0);
};

export default function MCQInterface({ deploymentId, deploymentName, onClose, onSessionCompleted }: MCQInterfaceProps) {
  const [session, setSession] = useState<MCQSession | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [submittedAnswers, setSubmittedAnswers] = useState<Record<number, MCQAnswer>>({});
  const [pendingRetryAnswers, setPendingRetryAnswers] = useState<Record<number, MCQAnswer>>({});
  const [disabledAnswers, setDisabledAnswers] = useState<Record<number, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatQuestionIndex, setChatQuestionIndex] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<MCQChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Load or create MCQ session
  useEffect(() => {
    const initializeSession = async () => {
      setLoading(true);
      setError(null);
      setSessionError(null);

      try {
        const sessionData = await MCQDeploymentAPI.initializeSession(deploymentId);
        setSession(sessionData);

        const submittedMap = buildSubmittedAnswerMap(sessionData.submitted_answers);
        setSubmittedAnswers(submittedMap);
        setPendingRetryAnswers({});
        setDisabledAnswers({});

        const initialIndex = deriveInitialQuestionIndex(sessionData);
        setCurrentQuestionIndex(initialIndex);

        // Seed selected answers with submissions so previously answered questions remain highlighted
        const seededSelections: Record<number, string> = {};
        Object.values(submittedMap).forEach((answer) => {
          seededSelections[answer.question_index] = answer.selected_answer;
        });
        setSelectedAnswers(seededSelections);
      } catch (err) {
        console.error('Failed to initialize MCQ session:', err);
        setSessionError(err instanceof Error ? err.message : 'Failed to load quiz');
      } finally {
        setLoading(false);
      }
    };

    initializeSession();
  }, [deploymentId]);

  const submitAnswer = async (questionIndex: number, selectedAnswer: string) => {
    if (!session) return;

    setSubmitting(true);
    setError(null);

    try {
      const answerData = await MCQDeploymentAPI.submitAnswer(deploymentId, {
        question_index: questionIndex,
        selected_answer: selectedAnswer,
      });

      const allowRetry = Boolean(answerData.allow_retry_wrong_answer);
      const isRetryableWrong = allowRetry && !answerData.is_correct;

      if (isRetryableWrong) {
        console.log('[MCQ Debug] Wrong answer retry:', {
          questionIndex,
          selectedAnswer,
          existingDisabled: disabledAnswers[questionIndex] ?? [],
        });
        
        setDisabledAnswers((prev) => {
          const existing = prev[questionIndex] ?? [];
          if (existing.includes(selectedAnswer)) return prev;
          return {
            ...prev,
            [questionIndex]: [...existing, selectedAnswer],
          };
        });

        setPendingRetryAnswers((prev) => ({
          ...prev,
          [questionIndex]: answerData,
        }));

        setSelectedAnswers((prev) => {
          const next = { ...prev };
          delete next[questionIndex];
          return next;
        });

        setSession((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            answers_revealed: answerData.answers_revealed ?? prev.answers_revealed,
            next_question_index: answerData.next_question_index ?? prev.next_question_index,
            answered_count: answerData.answered_count ?? prev.answered_count,
          };
        });

        // Auto-open chat for wrong answer if enabled (desktop only)
        if (session.add_chatbot_after_wrong_answer && window.innerWidth >= 1024) {
          setChatQuestionIndex(questionIndex);
          setChatMessages([{ role: 'assistant', content: 'It looks like you need some help! Feel free to ask me any question on the content!' }]);
          setChatError(null);
          setChatLoading(false);
          setChatOpen(true);
        }

        return;
      }

      setDisabledAnswers((prev) => {
        if (!prev[questionIndex]) return prev;
        const next = { ...prev };
        delete next[questionIndex];
        return next;
      });
      setPendingRetryAnswers((prev) => {
        if (!prev[questionIndex]) return prev;
        const next = { ...prev };
        delete next[questionIndex];
        return next;
      });

      const updatedSubmittedAnswers: Record<number, MCQAnswer> = {
        ...submittedAnswers,
        [questionIndex]: answerData,
      };
      setSubmittedAnswers(updatedSubmittedAnswers);

      // Auto-open chat for wrong answer if enabled (desktop only)
      if (!answerData.is_correct && session.add_chatbot_after_wrong_answer && window.innerWidth >= 1024) {
        setChatQuestionIndex(questionIndex);
        setChatMessages([{ role: 'assistant', content: 'It looks like you need some help! Feel free to ask me any question on the content!' }]);
        setChatError(null);
        setChatLoading(false);
        setChatOpen(true);
      }

      if (answerData.is_session_completed) {
        const refreshedSession = await MCQDeploymentAPI.getSession(deploymentId);
        setSession(refreshedSession);
        const refreshedSubmitted = buildSubmittedAnswerMap(refreshedSession.submitted_answers);
        setSubmittedAnswers(refreshedSubmitted);
        const refreshedSelections: Record<number, string> = {};
        Object.values(refreshedSubmitted).forEach((submission) => {
          refreshedSelections[submission.question_index] = submission.selected_answer;
        });
        setSelectedAnswers(refreshedSelections);
        const endIndex = deriveInitialQuestionIndex(refreshedSession);
        setCurrentQuestionIndex(endIndex);

        if (onSessionCompleted) {
          try {
            await onSessionCompleted();
          } catch (refreshErr) {
            console.error('Failed to refresh page list after MCQ completion:', refreshErr);
          }
        }
      } else {
        setSession((prev) => {
          if (!prev) return prev;
          const submittedList = Object.values(updatedSubmittedAnswers);
          return {
            ...prev,
            answered_count: answerData.answered_count ?? prev.answered_count,
            next_question_index: answerData.next_question_index ?? null,
            answers_revealed: answerData.answers_revealed ?? prev.answers_revealed,
            submitted_answers: submittedList,
            is_completed: answerData.is_session_completed || prev.is_completed,
          };
        });

        // Auto-advance ONLY if we are not in reveal-after-each-question mode
        const shouldAutoAdvance = !session.tell_answer_after_each_question;
        if (shouldAutoAdvance) {
          if (session.one_question_at_a_time) {
            if (answerData.next_question_index !== null && answerData.next_question_index !== undefined) {
              const nextIdx = session.questions.findIndex(
                (question) => question.index === answerData.next_question_index
              );
              if (nextIdx >= 0) {
                setCurrentQuestionIndex(nextIdx);
              }
            }
          } else if (currentQuestionIndex < session.questions.length - 1) {
            setCurrentQuestionIndex((prev) => prev + 1);
          }
        }
      }
    } catch (err) {
      console.error('Failed to submit answer:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit answer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAnswerSubmit = () => {
    if (!session) return;
    
    const currentQuestion = session.questions[currentQuestionIndex];
    const selectedAnswer = selectedAnswers[currentQuestion.index];
    
    if (!selectedAnswer) {
      setError('Please select an answer before submitting.');
      return;
    }

    submitAnswer(currentQuestion.index, selectedAnswer);
  };

  const handleAnswerSelect = (answer: string) => {
    if (!session) return;
    
    const currentQuestion = session.questions[currentQuestionIndex];
    setSelectedAnswers(prev => ({
      ...prev,
      [currentQuestion.index]: answer
    }));
    setError(null);
  };

  const handleQuestionNavigation = (index: number) => {
    if (!session) return;
    if (session.one_question_at_a_time && index > session.answered_count) {
      return;
    }
    if (index !== currentQuestionIndex && chatOpen) {
      closeChat();
    }
    setCurrentQuestionIndex(index);
    setError(null);
  };

  const handleNavigate = (direction: 'prev' | 'next') => {
    if (!session) return;
    
    if (direction === 'prev' && currentQuestionIndex > 0) {
      if (chatOpen) {
        closeChat();
      }
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    } else if (direction === 'next' && currentQuestionIndex < session.questions.length - 1) {
      if (session.one_question_at_a_time) {
        if (session.next_question_index !== null && session.next_question_index !== undefined) {
          const nextIdx = session.questions.findIndex(
            (question) => question.index === session.next_question_index
          );
          if (nextIdx >= 0) {
            if (chatOpen) {
              closeChat();
            }
            setCurrentQuestionIndex(nextIdx);
          }
        }
      } else {
        if (chatOpen) {
          closeChat();
        }
        setCurrentQuestionIndex(currentQuestionIndex + 1);
      }
    }
  };

  const openChatForQuestion = (questionIndex: number) => {
    if (chatOpen && chatQuestionIndex === questionIndex) {
      // If chat is already open for this question, just focus it (no action needed)
      return;
    }
    setChatQuestionIndex(questionIndex);
    setChatMessages([{ role: 'assistant', content: 'It looks like you need some help! Feel free to ask me any question on the content!' }]);
    setChatError(null);
    setChatLoading(false);
    setChatOpen(true);
  };

  const closeChat = () => {
    setChatOpen(false);
    setChatQuestionIndex(null);
    setChatMessages([]);
    setChatError(null);
    setChatLoading(false);
  };

  const sendChatMessage = async (message: string) => {
    if (!session) return;

    const history = buildChatHistory(chatMessages);
    setChatMessages((prev) => [...prev, { role: 'user', content: message }]);
    setChatLoading(true);
    setChatError(null);

    try {
      const response = await MCQDeploymentAPI.requestRemediationChat(deploymentId, {
        message,
        history,
      });
      setChatMessages((prev) => [...prev, { role: 'assistant', content: response.response }]);
    } catch (err) {
      console.error('Failed to fetch remediation chat response:', err);
      setChatError(err instanceof Error ? err.message : 'Failed to fetch tutor response');
    } finally {
      setChatLoading(false);
    }
  };

  // Show loading or error states
  if (loading || sessionError) {
    return <LoadingState loading={loading} error={sessionError} onClose={onClose} />;
  }

  if (!session) return null;

  const currentQuestion = session.questions[currentQuestionIndex];
  const allQuestionsSubmitted = session.is_completed || Object.keys(submittedAnswers).length === session.total_questions;
  const submittedAnswerForQuestion = submittedAnswers[currentQuestion.index];
  const pendingRetryAnswerForQuestion = pendingRetryAnswers[currentQuestion.index];
  const activeAnswerContext = submittedAnswerForQuestion ?? pendingRetryAnswerForQuestion;
  const answerSpecificFeedback = activeAnswerContext?.feedback_message ?? null;
  const fallbackFeedback =
    activeAnswerContext && !activeAnswerContext.is_correct && session.add_message_after_wrong_answer
      ? session.wrong_answer_message ?? null
      : null;
  const feedbackMessage = (answerSpecificFeedback && answerSpecificFeedback.trim().length > 0)
    ? answerSpecificFeedback
    : fallbackFeedback;
  const showChatPrompt = Boolean(
    session.add_chatbot_after_wrong_answer &&
    activeAnswerContext &&
    !activeAnswerContext.is_correct
  );
  const chatQuestion =
    chatQuestionIndex !== null
      ? session.questions.find((question) => question.index === chatQuestionIndex) ?? null
      : null;

  const shouldDisableNext = session.one_question_at_a_time && (
    session.next_question_index === null ||
    session.next_question_index === undefined ||
    session.next_question_index === currentQuestion.index ||
    Boolean(pendingRetryAnswerForQuestion)
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <MCQHeader
        deploymentName={deploymentName}
        currentQuestionIndex={currentQuestionIndex}
        totalQuestions={session.total_questions}
        onClose={onClose}
      />

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Question Navigation Sidebar */}
          <div className="lg:col-span-1">
            <QuestionNavigationSidebar
              questions={session.questions}
              currentQuestionIndex={currentQuestionIndex}
              submittedAnswers={submittedAnswers}
              totalQuestions={session.total_questions}
              onQuestionSelect={handleQuestionNavigation}
              oneQuestionAtATime={session.one_question_at_a_time}
              answeredCount={session.answered_count}
            />
          </div>

          {/* Main Question Area */}
          <div className="lg:col-span-3">
            <QuestionDisplay
              question={currentQuestion}
              questionIndex={currentQuestionIndex}
              totalQuestions={session.total_questions}
              selectedAnswer={selectedAnswers[currentQuestion.index]}
              submittedAnswer={submittedAnswers[currentQuestion.index]}
              pendingAnswer={pendingRetryAnswerForQuestion}
              submitting={submitting}
              error={error}
              allQuestionsSubmitted={allQuestionsSubmitted}
              onAnswerSelect={handleAnswerSelect}
              onSubmitAnswer={handleAnswerSubmit}
              onNavigate={handleNavigate}
              onClose={onClose}
              revealCorrectAnswer={session.answers_revealed}
              feedbackMessage={feedbackMessage}
              showChatPrompt={showChatPrompt}
              onRequestChat={() => openChatForQuestion(currentQuestion.index)}
              disablePrev={false}
              disableNext={shouldDisableNext}
              disabledAnswers={disabledAnswers[currentQuestion.index] ?? []}
              allowRetryWrongAnswer={session.allow_retry_wrong_answer}
            />
          </div>
        </div>
      </div>

      <WrongAnswerChatPanel
        open={chatOpen}
        onClose={closeChat}
        question={chatQuestion}
        messages={chatMessages}
        loading={chatLoading}
        error={chatError}
        onSend={sendChatMessage}
      />
    </div>
  );
} 
