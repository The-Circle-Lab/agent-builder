"use client";

import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { MCQQuestion } from "@/lib/deploymentAPIs/mcqDeploymentAPI";

export interface MCQChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface WrongAnswerChatPanelProps {
  open: boolean;
  onClose: () => void;
  question: MCQQuestion | null;
  messages: MCQChatMessage[];
  loading: boolean;
  error: string | null;
  onSend: (message: string) => Promise<void> | void;
}

export default function WrongAnswerChatPanel({
  open,
  onClose,
  question,
  messages,
  loading,
  error,
  onSend,
}: WrongAnswerChatPanelProps) {
  const [draft, setDraft] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setDraft("");
    }
  }, [open]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  if (!open) {
    return null;
  }

  const sendMessage = async () => {
    const trimmed = draft.trim();
    if (!trimmed || loading) {
      return;
    }

    await onSend(trimmed);
    setDraft("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await sendMessage();
  };

  return (
    <div
      className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white border-l shadow-xl flex flex-col h-full transform transition-transform duration-200 ease-out"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex items-start justify-between px-4 py-3 border-b">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Ask the AI Tutor</h2>
          {question ? (
            <p className="mt-1 text-sm text-gray-600">{question.question}</p>
          ) : null}
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
          aria-label="Close chat"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 ? (
          <div className="text-sm text-gray-500">
            Share what you found challenging about this question and the tutor will help you understand the correct reasoning.
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={`rounded-lg px-3 py-2 text-sm shadow-sm ${
                message.role === "user"
                  ? "bg-indigo-600 text-white self-end ml-auto w-fit"
                  : "bg-gray-100 text-gray-900 mr-auto w-fit"
              }`}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                components={{
                  a: (props) => (
                    <a {...props} className="underline" target="_blank" rel="noreferrer" />
                  ),
                  code: (props) => {
                    const { className, children, ...rest } = props;
                    return (
                      <code
                        {...rest}
                        className={`${className ?? ''} ${message.role === 'user' ? 'text-white/90' : 'text-gray-800'} bg-black/10 rounded px-1 py-0.5`}
                      >
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {error ? (
        <div className="mx-4 mb-2 rounded bg-red-50 px-3 py-2 text-xs text-red-700 border border-red-200">
          {error}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="px-4 py-3 border-t bg-gray-50 flex items-center space-x-2">
        <textarea
          className="text-black flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          rows={2}
          placeholder="Ask a follow-up question or describe what confused you..."
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={async (event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              await sendMessage();
            }
          }}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !draft.trim()}
          className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          {loading ? (
            <span className="flex items-center space-x-2">
              <span className="h-4 w-4 animate-spin rounded-full border-b-2 border-white"></span>
              <span>Sending</span>
            </span>
          ) : (
            "Send"
          )}
        </button>
      </form>
    </div>
  );
}
