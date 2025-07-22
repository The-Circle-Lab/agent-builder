import React, { useState, useCallback, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes } from "@fortawesome/free-solid-svg-icons";
import { NodeData } from "../types";
import { getNodeConfig } from "../nodeRegistry";
import { PropertyDefinition } from "../types";
import DocumentManager from "./DocumentManager";

export * from "../../../hooks/useSettingsMenu";

interface SettingsPopupProps {
  isOpen: boolean;
  nodeType: string;
  data: NodeData;
  onClose: () => void;
  onSave: (updatedData: NodeData) => void;
  workflowId?: string | number;
}

interface GenericFormProps {
  properties: PropertyDefinition[];
  data: NodeData;
  onSave: (data: NodeData) => void;
  workflowId?: string | number;
}

function GenericSettingsForm({
  properties,
  data,
  onSave,
  workflowId,
}: GenericFormProps) {
  const [formData, setFormData] = useState<NodeData>(() => {
    // Initialize form data with existing data or default values
    const initialData: Record<string, unknown> = {};
    properties.forEach((prop) => {
      initialData[prop.key] =
        (data as Record<string, unknown>)[prop.key] ?? prop.defaultValue;
    });
    return initialData as NodeData;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const handleInputChange = useCallback(
    (key: string, value: unknown) => {
      setFormData((prev) => {
        const updated = { ...prev, [key]: value } as Record<string, unknown>;

        // Maintain dynamicTextList lengths based on their countKey values
        properties.forEach((prop) => {
          // Dynamic text list adjustment
          if (prop.type === "dynamicTextList" && prop.countKey) {
            const count = updated[prop.countKey] as number | undefined;
            if (typeof count === "number") {
              const listKey = prop.key;
              let list = updated[listKey] as string[] | undefined;
              if (!Array.isArray(list)) list = [];

              if (list.length > count) {
                list = list.slice(0, count);
              } else if (list.length < count) {
                list = [...list, ...Array(count - list.length).fill("")];
              }

              updated[listKey] = list;
            }
          }

          // Test cases parameter length adjustment
          if (prop.type === "testCases" && prop.countKey) {
            const count = updated[prop.countKey] as number | undefined;
            if (typeof count === "number") {
              const testsKey = prop.key;
              let tests = updated[testsKey] as
                | import("../types").TestCase[]
                | undefined;
              if (!Array.isArray(tests)) tests = [];

              tests = tests.map((t) => {
                let params = Array.isArray(t.parameters)
                  ? [...t.parameters]
                  : [];
                if (params.length > count) params = params.slice(0, count);
                else if (params.length < count) {
                  params = [
                    ...params,
                    ...Array(count - params.length).fill(""),
                  ];
                }
                return { ...t, parameters: params };
              });

              updated[testsKey] = tests;
            }
          }
        });

        return updated as NodeData;
      });
    },
    [properties]
  );

  // Create memoized document change handlers for upload fields
  const documentChangeHandlers = useMemo(() => {
    const handlers: Record<string, (count: number) => void> = {};
    properties.forEach((prop) => {
      if (prop.type === "upload") {
        handlers[prop.key] = (count: number) => {
          handleInputChange(prop.key, count.toString());
        };
      }
    });
    return handlers;
  }, [properties, handleInputChange]);

  // Renders a single field based on the property type
  const renderField = (property: PropertyDefinition) => {
    const { key, label, type, placeholder, options, min, max, step, rows } =
      property;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value: any = (formData as Record<string, unknown>)[key];

    switch (type) {
      case "text":
        return (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-200 mb-2">
              {label}
            </label>
            <input
              type="text"
              value={String(value || "")}
              onChange={(e) => handleInputChange(key, e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={placeholder}
            />
          </div>
        );

      case "textarea":
        return (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-200 mb-2">
              {label}
            </label>
            <textarea
              value={String(value || "")}
              onChange={(e) => handleInputChange(key, e.target.value)}
              rows={rows || 4}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={placeholder}
            />
          </div>
        );

      case "number":
        return (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-200 mb-2">
              {label}
            </label>
            <input
              type="number"
              value={typeof value === "number" ? value : ""}
              onChange={(e) =>
                handleInputChange(key, parseInt(e.target.value) || 0)
              }
              min={min}
              max={max}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        );

      case "checkbox":
        return (
          <div key={key}>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={Boolean(value)}
                onChange={(e) => handleInputChange(key, e.target.checked)}
                className="form-checkbox h-4 w-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-200">{label}</span>
            </label>
          </div>
        );

      case "select":
        return (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-200 mb-2">
              {label}
            </label>
            <select
              value={String(value || "")}
              onChange={(e) => handleInputChange(key, e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {options?.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        );

      case "range":
        return (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-200 mb-2">
              {label} ({value})
            </label>
            <input
              type="range"
              value={
                typeof value === "number"
                  ? value
                  : Number(property.defaultValue)
              }
              onChange={(e) =>
                handleInputChange(key, parseFloat(e.target.value))
              }
              min={min}
              max={max}
              step={step}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>{min}</span>
              <span>{max}</span>
            </div>
          </div>
        );

      case "upload":
        return (
          <div key={key}>
            <DocumentManager
              workflowId={workflowId}
              onDocumentsChange={documentChangeHandlers[key] || (() => {})}
            />
          </div>
        );

      case "dynamicTextList": {
        const countKey = property.countKey;
        const count = (formData as Record<string, unknown>)[countKey ?? ""] as
          | number
          | undefined;
        const list = Array.isArray(value) ? (value as string[]) : [];

        const effectiveCount = typeof count === "number" ? count : list.length;

        const handleListItemChange = (index: number, val: string) => {
          const newList = [...list];
          newList[index] = val;
          handleInputChange(key, newList);
        };

        // Hide the entire section (including the title) when the count is zero
        if (effectiveCount === 0) {
          return null;
        }

        return (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-200 mb-2">
              {label}
            </label>
            <div className="space-y-2">
              {Array.from({ length: effectiveCount }).map((_, idx) => (
                <input
                  key={`${key}-${idx}`}
                  type="text"
                  value={list[idx] ?? ""}
                  onChange={(e) => handleListItemChange(idx, e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={`${placeholder || "Enter value"} #${idx + 1}`}
                />
              ))}
            </div>
          </div>
        );
      }

      case "testCases": {
        const countKey = property.countKey;
        const paramCount = (formData as Record<string, unknown>)[
          countKey ?? ""
        ] as number | undefined;
        const effectiveParamCount =
          typeof paramCount === "number" ? paramCount : 0;

        // Hide section if param count is 0
        if (effectiveParamCount === 0) return null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tests: any[] = Array.isArray(value) ? value : [];

        const updateTest = (
          index: number,
          field: string,
          val: string,
          paramIdx?: number
        ) => {
          const newTests = tests.map((t, i) => {
            if (i !== index) return t;
            if (field === "expected") {
              return { ...t, expected: val };
            }
            // field === "param"
            const newParams = Array.isArray(t.parameters)
              ? [...t.parameters]
              : [];
            if (typeof paramIdx === "number") {
              newParams[paramIdx] = val;
            }
            return { ...t, parameters: newParams };
          });
          handleInputChange(key, newTests);
        };

        const addTest = () => {
          const emptyParams = Array.from({ length: effectiveParamCount }).fill(
            ""
          );
          const newTests = [
            ...tests,
            { parameters: emptyParams, expected: "" },
          ];
          handleInputChange(key, newTests);
        };

        const deleteTest = (idx: number) => {
          const newTests = tests.filter((_t, i) => i !== idx);
          handleInputChange(key, newTests);
        };

        return (
          <div key={key} className="space-y-2">
            <label className="block text-sm font-medium text-gray-200 mb-2">
              {label}
            </label>
            {tests.map((test, idx) => (
              <div
                key={`${key}-test-${idx}`}
                className="space-y-1 border border-gray-600 p-2 rounded-md"
              >
                <div className="flex justify-between items-center">
                  <span className="text-gray-300 text-sm">Test #{idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => deleteTest(idx)}
                    className="text-red-400 hover:text-red-500"
                  >
                    ×
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 mt-2">
                  {Array.from({ length: effectiveParamCount }).map(
                    (_, pIdx) => (
                      <input
                        key={`param-${pIdx}`}
                        type="text"
                        value={test.parameters?.[pIdx] ?? ""}
                        onChange={(e) =>
                          updateTest(idx, "param", e.target.value, pIdx)
                        }
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder={`Parameter #${pIdx + 1}`}
                      />
                    )
                  )}
                  <input
                    type="text"
                    value={test.expected ?? ""}
                    onChange={(e) =>
                      updateTest(idx, "expected", e.target.value)
                    }
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Expected Return"
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addTest}
              className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Add Test
            </button>
          </div>
        );
      }

      case "multipleChoiceQuestions": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const questions: any[] = Array.isArray(value) ? value : [];

        const updateQuestion = (
          index: number,
          field: string,
          val: string | number,
          answerIdx?: number
        ) => {
          const newQuestions = questions.map((q, i) => {
            if (i !== index) return q;

            if (field === "text") {
              return { ...q, text: val };
            } else if (field === "correctAnswer") {
              return { ...q, correctAnswer: val };
            } else if (field === "answer" && typeof answerIdx === "number") {
              const newAnswers = Array.isArray(q.answers) ? [...q.answers] : [];
              newAnswers[answerIdx] = val;
              return { ...q, answers: newAnswers };
            }
            return q;
          });
          handleInputChange(key, newQuestions);
        };

        const addAnswer = (questionIdx: number) => {
          const newQuestions = questions.map((q, i) => {
            if (i !== questionIdx) return q;
            const newAnswers = Array.isArray(q.answers)
              ? [...q.answers, ""]
              : [""];
            return { ...q, answers: newAnswers };
          });
          handleInputChange(key, newQuestions);
        };

        const removeAnswer = (questionIdx: number, answerIdx: number) => {
          const newQuestions = questions.map((q, i) => {
            if (i !== questionIdx) return q;
            const newAnswers = Array.isArray(q.answers)
              ? q.answers.filter((_: unknown, idx: number) => idx !== answerIdx)
              : [];
            // Adjust correctAnswer if it was pointing to a removed answer
            let newCorrectAnswer = q.correctAnswer;
            if (newCorrectAnswer >= answerIdx && newCorrectAnswer > 0) {
              newCorrectAnswer = Math.max(0, newCorrectAnswer - 1);
            }
            return {
              ...q,
              answers: newAnswers,
              correctAnswer: newCorrectAnswer,
            };
          });
          handleInputChange(key, newQuestions);
        };

        const addQuestion = () => {
          const newQuestions = [
            ...questions,
            { text: "", answers: ["", ""], correctAnswer: 0 },
          ];
          handleInputChange(key, newQuestions);
        };

        const deleteQuestion = (idx: number) => {
          const newQuestions = questions.filter((_q, i) => i !== idx);
          handleInputChange(key, newQuestions);
        };

        return (
          <div key={key} className="space-y-4">
            <label className="block text-sm font-medium text-gray-200 mb-2">
              {label}
            </label>
            {questions.map((question, qIdx) => (
              <div
                key={`${key}-question-${qIdx}`}
                className="space-y-3 border border-gray-600 p-4 rounded-md"
              >
                <div className="flex justify-between items-center">
                  <span className="text-gray-300 text-sm">
                    Question #{qIdx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteQuestion(qIdx)}
                    className="text-red-400 hover:text-red-500"
                  >
                    ×
                  </button>
                </div>

                {/* Question Text */}
                <textarea
                  value={question.text ?? ""}
                  onChange={(e) => updateQuestion(qIdx, "text", e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter question text"
                  rows={2}
                />

                {/* Answers */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-300">Answers:</span>
                    <button
                      type="button"
                      onClick={() => addAnswer(qIdx)}
                      className="px-2 py-1 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700"
                    >
                      Add Answer
                    </button>
                  </div>

                  {(question.answers || []).map(
                    (answer: string, aIdx: number) => (
                      <div
                        key={`answer-${aIdx}`}
                        className="flex items-center space-x-2"
                      >
                        <input
                          type="radio"
                          name={`correct-${qIdx}`}
                          checked={question.correctAnswer === aIdx}
                          onChange={() =>
                            updateQuestion(qIdx, "correctAnswer", aIdx)
                          }
                          className="text-green-600 bg-gray-700 border-gray-600 focus:ring-green-500"
                        />
                        <input
                          type="text"
                          value={answer}
                          onChange={(e) =>
                            updateQuestion(qIdx, "answer", e.target.value, aIdx)
                          }
                          className="flex-1 px-3 py-1 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder={`Answer ${aIdx + 1}`}
                        />
                        {(question.answers || []).length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeAnswer(qIdx, aIdx)}
                            className="text-red-400 hover:text-red-500 px-2"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    )
                  )}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addQuestion}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Add Question
            </button>
          </div>
        );
      }

      default:
        return null;
    }
  };

  // Renders the settings form
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {properties.filter((prop) => prop.key !== "label").map(renderField)}

      <div className="flex justify-end space-x-3 pt-4">
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Save Settings
        </button>
      </div>
    </form>
  );
}

export function SettingsMenu({
  isOpen,
  nodeType,
  data,
  onClose,
  onSave,
  workflowId,
}: SettingsPopupProps) {
  if (!isOpen) return null;

  const nodeConfig = getNodeConfig(nodeType);

  // If the node config is not found, return a message
  if (!nodeConfig) {
    return (
      <div
        className="fixed inset-0 transition-opacity flex items-center justify-center z-40"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.65)" }}
        onClick={onClose}
      >
        <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
          <div className="p-6 text-center">
            <div className="text-gray-400">
              Settings not available for this node type.
            </div>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Renders the settings menu
  return (
    <div
      className="fixed inset-0 transition-opacity flex items-center justify-center z-40"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.65)" }}
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">
            {nodeConfig.displayName} Settings
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <FontAwesomeIcon icon={faTimes} size="lg" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <GenericSettingsForm
            properties={nodeConfig.properties}
            data={data}
            onSave={onSave}
            workflowId={workflowId}
          />
        </div>
      </div>
    </div>
  );
}
