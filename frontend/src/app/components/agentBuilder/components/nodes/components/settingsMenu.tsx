import React, { useState, useCallback, useMemo, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes } from "@fortawesome/free-solid-svg-icons";
import { MultipleChoiceQuestion, NodeData, Variable } from "../types";
import { getNodeConfig } from "../nodeRegistry";
import { PropertyDefinition } from "../types";
import DocumentManager from "./DocumentManager";
import VideoUploadManager from "./VideoUploadManager";
import { Node, Edge } from "@xyflow/react";
import { getAvailableSubmissionPrompts, getListVariablesFromBehaviors } from "../../../scripts/nodeHelpers";

export * from "../../../hooks/useSettingsMenu";

interface SettingsPopupProps {
  isOpen: boolean;
  nodeType: string;
  data: NodeData;
  onClose: () => void;
  onSave: (updatedData: NodeData) => void;
  workflowId?: string | number;
  nodes?: Node[];
  edges?: Edge[];
  pageRelationships?: Record<string, string[]>;
  currentNodeId?: string;
}

interface GenericFormProps {
  properties: PropertyDefinition[];
  data: NodeData;
  onSave: (data: NodeData) => void;
  workflowId?: string | number;
  nodes?: Node[];
  edges?: Edge[];
  pageRelationships?: Record<string, string[]>;
  currentNodeId?: string;
  nodeType?: string;
}

function GenericSettingsForm({ properties, data, onSave, workflowId, nodes, edges, pageRelationships, currentNodeId, nodeType }: GenericFormProps) {
  const [formData, setFormData] = useState<NodeData>(() => {
    // Initialize form data with existing data or default values
    const initialData: Record<string, unknown> = {};
    properties.forEach((prop) => {
      initialData[prop.key] =
        (data as Record<string, unknown>)[prop.key] ?? prop.defaultValue;
    });
    return initialData as NodeData;
  });

  // Drag state for reordering questions (used in multipleChoiceQuestions field)
  const [draggedQuestionIndex, setDraggedQuestionIndex] = useState<number | null>(null);
  const [dragOverQuestionIndex, setDragOverQuestionIndex] = useState<number | null>(null);

  // Function to detect connected list variables for Live Presentation nodes
  const getConnectedListVariables = useMemo(() => {
    if (!nodes || !edges || !pageRelationships || !currentNodeId) {
      return [];
    }

    // Find the page that contains the current node (Live Presentation Prompt node)
    let currentPageId: string | null = null;
    for (const [pageId, nodeIds] of Object.entries(pageRelationships)) {
      if (nodeIds.includes(currentNodeId)) {
        currentPageId = pageId;
        break;
      }
    }

    if (!currentPageId) return [];

    // Find all nodes in the same page
    const nodesInPage = pageRelationships[currentPageId] || [];
    
    // Check if any node in this page is a Live Presentation node
    const hasLivePresentationNode = nodesInPage.some(nodeId => {
      const node = nodes.find(n => n.id === nodeId);
      return node?.type === 'livePresentation';
    });

    if (!hasLivePresentationNode) return [];

    // Get all list variables from behaviors and global variables in the workflow
    const connectedListVariables: { id: string; name: string; items: string[] }[] = [];
    
    try {
      // Get behavior-generated list variables
      const behaviorListVars = getListVariablesFromBehaviors(nodes, edges);
      
      behaviorListVars.forEach(variable => {
        connectedListVariables.push({
          id: variable.name, // Use variable name as ID
          name: variable.name,
          items: [] // Behavior variables don't have predefined items - they're generated at runtime
        });
      });
    } catch (error) {
      console.warn('Error getting behavior list variables:', error);
    }
    
    // Also check for global variables connected to this page (for backward compatibility)
    const pageEdges = edges.filter(edge => edge.target === currentPageId);
    
    pageEdges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      
      if (sourceNode?.type === 'globalVariables' && sourceNode.data) {
        const variables = (sourceNode.data as { variables?: Variable[] }).variables || [];
        
        variables.forEach(variable => {
          if (variable.type === 'list') {
            // Check if this variable's handle is connected
            if (edge.sourceHandle === `${variable.id}-output`) {
              // Only add if not already present from behaviors
              const exists = connectedListVariables.some(v => v.id === variable.id);
              if (!exists) {
                connectedListVariables.push({
                  id: variable.id,
                  name: variable.name,
                  items: variable.items || [] // Allow empty lists
                });
              }
            }
          }
        });
      }
    });
    
    return connectedListVariables;
  }, [nodes, edges, pageRelationships, currentNodeId]);

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

  // Auto-apply and save default submission prompts for group nodes
  useEffect(() => {
    if (nodeType === 'group' && nodes && edges && pageRelationships && currentNodeId) {
      const currentSelection = (formData as Record<string, unknown>)['selected_submission_prompts'] as string[] || [];
      
      // Only apply defaults if no prompts are currently selected
      if (currentSelection.length === 0) {
        const availablePrompts = getAvailableSubmissionPrompts(
          currentNodeId,
          edges,
          nodes,
          pageRelationships
        );
        
        // Create flat list of all prompt IDs
        const allPromptIds: string[] = [];
        availablePrompts.forEach(nodeInfo => {
          nodeInfo.prompts.forEach(prompt => {
            allPromptIds.push(prompt.id);
          });
        });
        
        // If there are prompts available, auto-select them and save immediately
        if (allPromptIds.length > 0) {
          const updatedFormData = {
            ...formData,
            selected_submission_prompts: allPromptIds
          };
          setFormData(updatedFormData);
          // Automatically save the defaults to the node data
          onSave(updatedFormData);
        }
      }
    }
  }, [nodeType, nodes, edges, pageRelationships, currentNodeId, formData, onSave]);

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
    // Conditional rendering for MCQ dependent fields
    const shouldRenderProperty = () => {
      if (nodeType !== 'mcq') return true;
      const fd = formData as Record<string, unknown>;
      switch (property.key) {
        case 'tell_answer_after_each_question':
          return Boolean(fd['one_question_at_a_time']);
        case 'add_chatbot_after_wrong_answer':
          return Boolean(fd['one_question_at_a_time']) && Boolean(fd['tell_answer_after_each_question']);
        case 'chatbot_system_prompt':
          return Boolean(fd['one_question_at_a_time']) && Boolean(fd['tell_answer_after_each_question']) && Boolean(fd['add_chatbot_after_wrong_answer']);
        case 'add_message_after_wrong_answer':
          return Boolean(fd['one_question_at_a_time']) && Boolean(fd['tell_answer_after_each_question']);
        case 'wrong_answer_message':
          return Boolean(fd['one_question_at_a_time']) && Boolean(fd['tell_answer_after_each_question']) && Boolean(fd['add_message_after_wrong_answer']);
        default:
          return true;
      }
    };

    if (!shouldRenderProperty()) {
      return null;
    }

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
        const dynamicLabel = key === "group_size" ? 
          ((formData as Record<string, unknown>)["group_size_mode"] === "number_of_groups" ? 
            "Number of Groups" : "Students per Group") : label;
        
        return (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-200 mb-2">
              {dynamicLabel}
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

      case "radio":
        return (
          <div key={key}>
            <div className="space-y-2">
              {options?.map((option) => (
                <label key={option} className="flex items-center space-x-2">
                  <input
                    type="radio"
                    value={option}
                    checked={value === option}
                    onChange={(e) => handleInputChange(key, e.target.value)}
                    className="text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-500"
                  />
                  <span className="text-white">
                    {option === "students_per_group" ? "Students per group" : 
                     option === "number_of_groups" ? "Number of groups" : option}
                  </span>
                </label>
              ))}
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

      case "videoUpload": {
        const videos = Array.isArray(value) ? value : [];
        const selectionKey = (property as { selectionKey?: string }).selectionKey;
        const selectedId = selectionKey ? (formData as Record<string, unknown>)[selectionKey] as string | number | null : null;
        return (
          <div key={key}>
            <VideoUploadManager
              workflowId={workflowId}
              value={videos}
              onChange={(items) => handleInputChange(key, items)}
              label={label}
              selectedVideoId={selectedId ?? undefined}
              onSelect={(id: string | number | null) => {
                if (selectionKey) {
                  handleInputChange(selectionKey, id);
                }
              }}
            />
          </div>
        );
      }
      case "hidden": {
        // Do not render anything; keep value in formData for saving
        return null;
      }

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
        const normalizeQuestion = (
          rawQuestion: Partial<MultipleChoiceQuestion>
        ): MultipleChoiceQuestion => {
          const answers = Array.isArray(rawQuestion.answers)
            ? [...rawQuestion.answers]
            : [];
          let feedbackMessages = Array.isArray(
            (rawQuestion as Record<string, unknown>).answerFeedbackMessages
          )
            ? ([
                ...(rawQuestion as Record<string, unknown>)
                  .answerFeedbackMessages as (string | null)[]
              ])
            : Array.isArray(
                (rawQuestion as { wrongAnswerMessages?: (string | null)[] })
                  .wrongAnswerMessages
              )
            ? ([
                ...((rawQuestion as { wrongAnswerMessages?: (string | null)[] })
                  .wrongAnswerMessages as (string | null)[])
              ])
            : [];

          if (feedbackMessages.length < answers.length) {
            feedbackMessages = feedbackMessages.concat(
              Array(answers.length - feedbackMessages.length).fill("")
            );
          } else if (feedbackMessages.length > answers.length) {
            feedbackMessages = feedbackMessages.slice(0, answers.length);
          }

          const rawCorrect =
            typeof rawQuestion.correctAnswer === "number" ||
            typeof rawQuestion.correctAnswer === "string"
              ? Number.parseInt(String(rawQuestion.correctAnswer), 10)
              : 0;
          const safeCorrect = Number.isFinite(rawCorrect) ? rawCorrect : 0;
          const boundedCorrect =
            answers.length > 0
              ? Math.min(
                  Math.max(safeCorrect, 0),
                  Math.max(answers.length - 1, 0)
                )
              : 0;

          return {
            text: String(rawQuestion.text ?? ""),
            answers,
            correctAnswer: boundedCorrect,
            answerFeedbackMessages: feedbackMessages,
          };
        };

        const questions: MultipleChoiceQuestion[] = Array.isArray(value)
          ? (value as MultipleChoiceQuestion[]).map((q) => normalizeQuestion(q))
          : [];

        const formDataRecord = (formData ?? {}) as Record<string, unknown>;
        const hasFeedbackToggle = Object.prototype.hasOwnProperty.call(
          formDataRecord,
          "add_message_after_wrong_answer",
        );
        const feedbackToggleEnabled = hasFeedbackToggle
          ? Boolean(formDataRecord["add_message_after_wrong_answer"])
          : true;

        const updateQuestion = (
          index: number,
          field: "text" | "correctAnswer" | "answer" | "answerFeedback",
          val: string | number,
          answerIdx?: number
        ) => {
          const updated = questions
            .map((q, i) => {
              if (i !== index) return q;

              switch (field) {
                case "text":
                  return { ...q, text: String(val) };
                case "correctAnswer":
                  return { ...q, correctAnswer: Number(val) };
                case "answer": {
                  if (typeof answerIdx !== "number") return q;
                  const newAnswers = [...q.answers];
                  if (answerIdx >= newAnswers.length) {
                    newAnswers.length = answerIdx + 1;
                  }
                  newAnswers[answerIdx] = String(val);
                  return { ...q, answers: newAnswers };
                }
                case "answerFeedback": {
                  if (typeof answerIdx !== "number") return q;
                  const newMessages = Array.isArray(q.answerFeedbackMessages)
                    ? [...q.answerFeedbackMessages]
                    : [];
                  if (answerIdx >= newMessages.length) {
                    newMessages.length = answerIdx + 1;
                  }
                  newMessages[answerIdx] = String(val);
                  return { ...q, answerFeedbackMessages: newMessages };
                }
                default:
                  return q;
              }
            })
            .map(normalizeQuestion);

          handleInputChange(key, updated);
        };

        const addAnswer = (questionIdx: number) => {
          const updated = questions.map((q, i) => {
            if (i !== questionIdx) return q;

            const newAnswers = [...q.answers, ""];
            let newMessages = Array.isArray(q.answerFeedbackMessages)
              ? [...q.answerFeedbackMessages]
              : [];
            if (newMessages.length < newAnswers.length) {
              newMessages = newMessages.concat(
                Array(newAnswers.length - newMessages.length).fill("")
              );
            }

            return normalizeQuestion({
              ...q,
              answers: newAnswers,
              answerFeedbackMessages: newMessages,
            });
          });

          handleInputChange(key, updated);
        };

        const removeAnswer = (questionIdx: number, answerIdx: number) => {
          const updated = questions.map((q, i) => {
            if (i !== questionIdx) return q;

            const newAnswers = q.answers.filter((_, idx) => idx !== answerIdx);
            const newMessages = Array.isArray(q.answerFeedbackMessages)
              ? q.answerFeedbackMessages.filter((_, idx) => idx !== answerIdx)
              : [];

            let newCorrectAnswer = q.correctAnswer ?? 0;
            if (newCorrectAnswer >= answerIdx && newCorrectAnswer > 0) {
              newCorrectAnswer = Math.max(0, newCorrectAnswer - 1);
            }
            if (newCorrectAnswer >= newAnswers.length) {
              newCorrectAnswer = Math.max(newAnswers.length - 1, 0);
            }

            return normalizeQuestion({
              ...q,
              answers: newAnswers,
              answerFeedbackMessages: newMessages,
              correctAnswer: newCorrectAnswer,
            });
          });

          handleInputChange(key, updated);
        };

        const addQuestion = () => {
          const newQuestion = normalizeQuestion({
            text: "",
            answers: ["", ""],
            correctAnswer: 0,
            answerFeedbackMessages: ["", ""],
          });
          const updated = [...questions.map(normalizeQuestion), newQuestion];
          handleInputChange(key, updated);
        };

        const deleteQuestion = (idx: number) => {
          const updated = questions
            .filter((_q, i) => i !== idx)
            .map(normalizeQuestion);
          handleInputChange(key, updated);
        };

        const handleQuestionDragStart = (e: React.DragEvent, index: number) => {
          setDraggedQuestionIndex(index);
          e.dataTransfer.effectAllowed = "move";
        };
        const handleQuestionDragOver = (e: React.DragEvent, index: number) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDragOverQuestionIndex(index);
        };
        const handleQuestionDragLeave = () => setDragOverQuestionIndex(null);
        const handleQuestionDrop = (e: React.DragEvent, dropIndex: number) => {
          e.preventDefault();
          if (draggedQuestionIndex === null || draggedQuestionIndex === dropIndex) {
            setDraggedQuestionIndex(null);
            setDragOverQuestionIndex(null);
            return;
          }

          const newOrder = [...questions];
          const dragged = newOrder[draggedQuestionIndex];
          newOrder.splice(draggedQuestionIndex, 1);
          newOrder.splice(dropIndex, 0, dragged);
          handleInputChange(key, newOrder.map(normalizeQuestion));
          setDraggedQuestionIndex(null);
          setDragOverQuestionIndex(null);
        };
        const handleQuestionDragEnd = () => {
          setDraggedQuestionIndex(null);
          setDragOverQuestionIndex(null);
        };

        return (
          <div key={key} className="space-y-4">
            <label className="block text-sm font-medium text-gray-200 mb-2">
              {label}
            </label>
            {questions.map((question, qIdx) => (
              <div
                key={`${key}-question-${qIdx}`}
                draggable
                onDragStart={(e) => handleQuestionDragStart(e, qIdx)}
                onDragOver={(e) => handleQuestionDragOver(e, qIdx)}
                onDragLeave={handleQuestionDragLeave}
                onDrop={(e) => handleQuestionDrop(e, qIdx)}
                onDragEnd={handleQuestionDragEnd}
                className={`space-y-3 border border-gray-600 p-4 rounded-md cursor-move transition-colors duration-150 ${draggedQuestionIndex === qIdx ? "opacity-50" : ""} ${dragOverQuestionIndex === qIdx ? "bg-gray-700/60" : "bg-gray-800/30 hover:bg-gray-700/40"}`}
              >
                <div className="flex justify-between items-center">
                  <span className="text-gray-300 text-sm flex items-center space-x-2">
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" /></svg>
                    <span>Question #{qIdx + 1}</span>
                  </span>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-400">Drag to reorder</span>
                    <button
                      type="button"
                      onClick={() => deleteQuestion(qIdx)}
                      className="text-red-400 hover:text-red-500"
                    >
                      ×
                    </button>
                  </div>
                </div>

                <textarea
                  value={question.text ?? ""}
                  onChange={(e) => updateQuestion(qIdx, "text", e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter question text"
                  rows={2}
                />

                <div className="space-y-3">
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

                  {question.answers.map((answer, aIdx) => {
                    const isCorrectOption = question.correctAnswer === aIdx;
                    const feedbackValue = question.answerFeedbackMessages?.[aIdx] ?? "";

                    return (
                      <div key={`answer-${aIdx}`} className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            name={`correct-${qIdx}`}
                            checked={isCorrectOption}
                            onChange={() => updateQuestion(qIdx, "correctAnswer", aIdx)}
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
                          {question.answers.length > 2 && (
                            <button
                              type="button"
                              onClick={() => removeAnswer(qIdx, aIdx)}
                              className="text-red-400 hover:text-red-500 px-2"
                            >
                              ×
                            </button>
                          )}
                        </div>

                        <textarea
                          value={feedbackValue}
                          onChange={(e) =>
                            updateQuestion(qIdx, "answerFeedback", e.target.value, aIdx)
                          }
                          className="ml-7 w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          placeholder={
                            isCorrectOption
                              ? "Optional feedback shown after students select the correct answer."
                              : "Optional feedback shown after students select this answer."
                          }
                          rows={2}
                        />
                        {!feedbackToggleEnabled && hasFeedbackToggle && (
                          <p className="ml-7 text-xs text-gray-400 italic">
                            Turn on &quot;Add a message after a wrong answer&quot; to display answer-specific feedback in the quiz.
                          </p>
                        )}
                      </div>
                    );
                  })}
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

      case "submissionPromptSelector": {
        // Get available submission prompts from connected submission nodes
        const availablePrompts = getAvailableSubmissionPrompts(
          currentNodeId || '',
          edges || [],
          nodes || [],
          pageRelationships
        );
        
        // Create flat list of all prompts with their identifiers
        const allPrompts: Array<{ id: string; label: string; nodeLabel: string }> = [];
        availablePrompts.forEach(nodeInfo => {
          nodeInfo.prompts.forEach(prompt => {
            allPrompts.push({
              id: prompt.id,
              label: prompt.prompt.length > 50 ? prompt.prompt.substring(0, 50) + '...' : prompt.prompt,
              nodeLabel: nodeInfo.nodeLabel
            });
          });
        });

        // Get the currently selected prompts
        const selectedPrompts: string[] = Array.isArray(value) ? value : [];

        const togglePrompt = (promptId: string) => {
          const newSelected = selectedPrompts.includes(promptId)
            ? selectedPrompts.filter(id => id !== promptId)
            : [...selectedPrompts, promptId];
          handleInputChange(key, newSelected);
        };

        return (
          <div key={key} className="space-y-4">
            <label className="block text-sm font-medium text-gray-200 mb-2">
              {label}
            </label>
            
            {allPrompts.length === 0 ? (
              <div className="text-gray-400 text-sm italic">
                No submission prompts found in connected workflow. Connect this group node to a behaviour/page containing submission nodes.
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {allPrompts.map(prompt => (
                  <label key={prompt.id} className="flex items-start space-x-3 p-3 bg-gray-700 rounded-md cursor-pointer hover:bg-gray-600">
                    <input
                      type="checkbox"
                      checked={selectedPrompts.includes(prompt.id)}
                      onChange={() => togglePrompt(prompt.id)}
                      className="mt-1 form-checkbox h-4 w-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm text-gray-200 font-medium">
                        {prompt.label}
                      </div>
                      <div className="text-xs text-gray-400">
                        From: {prompt.nodeLabel}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
            
            {selectedPrompts.length > 0 && (
              <div className="text-xs text-gray-400">
                {selectedPrompts.length} prompt{selectedPrompts.length !== 1 ? 's' : ''} selected for grouping
              </div>
            )}
          </div>
        );
      }

      case "submissionPrompts": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const prompts: any[] = Array.isArray(value) ? value : [];

        const updatePrompt = (index: number, field: string, val: string | number) => {
          const newPrompts = prompts.map((p, i) => {
            if (i !== index) return p;

            if (field === "prompt") {
              return { ...p, prompt: val };
            } else if (field === "mediaType") {
              const updatedPrompt = { ...p, mediaType: val };
              // Reset items to null when changing away from list type
              if (val !== "list") {
                updatedPrompt.items = null;
              } else if (!updatedPrompt.items) {
                // Initialize items to 1 when switching to list type
                updatedPrompt.items = 1;
              }
              // Reset max to null when changing away from websiteInfo type
              if (val !== "websiteInfo") {
                updatedPrompt.max = null;
              } else if (!updatedPrompt.max) {
                // Initialize max to 5 when switching to websiteInfo type
                updatedPrompt.max = 5;
              }
              if (val === "multiple_choice") {
                const existingOptions = Array.isArray(updatedPrompt.options) ? updatedPrompt.options.filter((option: unknown) => typeof option === "string" && option.trim()) : [];
                updatedPrompt.options = existingOptions.length >= 2 ? existingOptions : ["Option 1", "Option 2"];
              } else if ("options" in updatedPrompt) {
                delete updatedPrompt.options;
              }
              return updatedPrompt;
            } else if (field === "items") {
              return { ...p, items: val };
            } else if (field === "max") {
              return { ...p, max: val };
            }
            return p;
          });
          handleInputChange(key, newPrompts);
        };

        const updateMultipleChoiceOption = (promptIndex: number, optionIndex: number, optionValue: string) => {
          const newPrompts = prompts.map((p, i) => {
            if (i !== promptIndex) return p;
            const options = Array.isArray(p.options) ? [...p.options] : [];
            while (options.length <= optionIndex) {
              options.push("");
            }
            options[optionIndex] = optionValue;
            return { ...p, options };
          });
          handleInputChange(key, newPrompts);
        };

        const addMultipleChoiceOption = (promptIndex: number) => {
          const newPrompts = prompts.map((p, i) => {
            if (i !== promptIndex) return p;
            const options = Array.isArray(p.options) ? [...p.options] : [];
            options.push("");
            return { ...p, options };
          });
          handleInputChange(key, newPrompts);
        };

        const removeMultipleChoiceOption = (promptIndex: number, optionIndex: number) => {
          const newPrompts = prompts.map((p, i) => {
            if (i !== promptIndex) return p;
            const options = Array.isArray(p.options) ? [...p.options] : [];
            if (options.length <= 2) {
              return p;
            }
            options.splice(optionIndex, 1);
            return { ...p, options };
          });
          handleInputChange(key, newPrompts);
        };

        const addPrompt = () => {
          const newPrompts = [
            ...prompts,
            { prompt: "", mediaType: "textarea", items: null, max: null },
          ];
          handleInputChange(key, newPrompts);
        };

        const deletePrompt = (idx: number) => {
          const newPrompts = prompts.filter((_p, i) => i !== idx);
          handleInputChange(key, newPrompts);
        };

        return (
          <div key={key} className="space-y-4">
            <label className="block text-sm font-medium text-gray-200 mb-2">
              {label}
            </label>
            {prompts.map((prompt, pIdx) => (
              <div
                key={`${key}-prompt-${pIdx}`}
                className="space-y-3 border border-gray-600 p-4 rounded-md"
              >
                <div className="flex justify-between items-center">
                  <span className="text-gray-300 text-sm">
                    Submission #{pIdx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => deletePrompt(pIdx)}
                    className="text-red-400 hover:text-red-500"
                  >
                    ×
                  </button>
                </div>

                {/* Prompt Text */}
                <textarea
                  value={prompt.prompt ?? ""}
                  onChange={(e) => updatePrompt(pIdx, "prompt", e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter submission prompt"
                  rows={3}
                />

                {/* Media Type Selection */}
                <div className="space-y-2">
                  <span className="text-sm text-gray-300">
                    Expected submission type:
                  </span>
                  <div className="flex space-x-4">
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name={`mediaType-${pIdx}`}
                        value="textarea"
                        checked={prompt.mediaType === "textarea"}
                        onChange={(e) =>
                          updatePrompt(pIdx, "mediaType", e.target.value)
                        }
                        className="text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-300">
                        Text Response
                      </span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name={`mediaType-${pIdx}`}
                        value="hyperlink"
                        checked={prompt.mediaType === "hyperlink"}
                        onChange={(e) =>
                          updatePrompt(pIdx, "mediaType", e.target.value)
                        }
                        className="text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-300">Hyperlink</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name={`mediaType-${pIdx}`}
                        value="pdf"
                        checked={prompt.mediaType === "pdf"}
                        onChange={(e) => updatePrompt(pIdx, "mediaType", e.target.value)}
                        className="text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-300">PDF Upload</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name={`mediaType-${pIdx}`}
                        value="list"
                        checked={prompt.mediaType === "list"}
                        onChange={(e) => updatePrompt(pIdx, "mediaType", e.target.value)}
                        className="text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-300">List</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name={`mediaType-${pIdx}`}
                        value="dynamic_list"
                        checked={prompt.mediaType === "dynamic_list"}
                        onChange={(e) => updatePrompt(pIdx, "mediaType", e.target.value)}
                        className="text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-300">Dynamic List</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name={`mediaType-${pIdx}`}
                        value="websiteInfo"
                        checked={prompt.mediaType === "websiteInfo"}
                        onChange={(e) => updatePrompt(pIdx, "mediaType", e.target.value)}
                        className="text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-300">Website Info</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name={`mediaType-${pIdx}`}
                        value="multiple_choice"
                        checked={prompt.mediaType === "multiple_choice"}
                        onChange={(e) =>
                          updatePrompt(pIdx, "mediaType", e.target.value)
                        }
                        className="text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-300">Multiple Choice</span>
                    </label>
                  </div>
                  {prompt.mediaType === "list" && 
                    <div className="mt-2">
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Number of list items:
                      </label>
                      <input
                        type="number"
                        value={prompt.items || 1}
                        onChange={(e) => updatePrompt(pIdx, "items", parseInt(e.target.value) || 1)}
                        placeholder="Number of list items"
                        min="1"
                        className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>}
                  {prompt.mediaType === "dynamic_list" && 
                    <div className="mt-2 p-3 bg-gray-600 rounded-md">
                      <p className="text-sm text-gray-300">
                        Students can add or remove items from their list dynamically. No fixed number of items required.
                      </p>
                    </div>}
                  {prompt.mediaType === "multiple_choice" && (
                    <div className="mt-2 space-y-3">
                      <p className="text-sm text-gray-300">
                        Students select one of the provided options.
                      </p>
                      {(Array.isArray(prompt.options) ? prompt.options : ["Option 1", "Option 2"]).map((option: string, optionIdx: number) => (
                        <div key={`${key}-prompt-${pIdx}-option-${optionIdx}`} className="flex items-center space-x-3">
                          <span className="text-sm text-gray-400 w-6">{optionIdx + 1}.</span>
                          <input
                            type="text"
                            value={option}
                            onChange={(e) => updateMultipleChoiceOption(pIdx, optionIdx, e.target.value)}
                            placeholder={`Option ${optionIdx + 1}`}
                            className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => removeMultipleChoiceOption(pIdx, optionIdx)}
                            className="text-red-400 hover:text-red-500 disabled:opacity-50"
                            disabled={(prompt.options?.length ?? 0) <= 2}
                            title="Remove option"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addMultipleChoiceOption(pIdx)}
                        className="px-3 py-1.5 bg-gray-700 text-sm font-medium text-blue-300 rounded hover:bg-gray-600"
                      >
                        + Add Option
                      </button>
                      {Array.isArray(prompt.options) && prompt.options.filter((option: string) => option && option.trim()).length < 2 && (
                        <p className="text-xs text-red-400">
                          At least two non-empty options are required.
                        </p>
                      )}
                    </div>
                  )}
                  {prompt.mediaType === "websiteInfo" && 
                    <div className="mt-2 space-y-2">
                      <div className="p-3 bg-gray-600 rounded-md">
                        <p className="text-sm text-gray-300">
                          Students can add multiple websites with URL, Name, Purpose, and Platform information.
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">
                          Maximum number of websites:
                        </label>
                        <input
                          type="number"
                          value={prompt.max || 5}
                          onChange={(e) => updatePrompt(pIdx, "max", parseInt(e.target.value) || 5)}
                          placeholder="Maximum websites"
                          min="1"
                          max="20"
                          className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addPrompt}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Add Submission Prompt
            </button>
          </div>
        );
      }

      case "variablesList": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const variables: any[] = Array.isArray(value) ? value : [];

        const updateVariable = (index: number, field: string, val: string | string[]) => {
          const newVariables = variables.map((v, i) => {
            if (i !== index) return v;
            
            if (field === "name") {
              return { ...v, name: val };
            } else if (field === "type") {
              const newVar = { ...v, type: val };
              // Reset items if changing from list type
              if (val !== "list") {
                delete newVar.items;
              } else if (!newVar.items) {
                // Initialize items array for list type
                newVar.items = [];
              }
              return newVar;
            } else if (field === "items") {
              return { ...v, items: val };
            }
            return v;
          });
          handleInputChange(key, newVariables);
        };

        const updateListItem = (variableIndex: number, itemIndex: number, value: string) => {
          const variable = variables[variableIndex];
          if (!variable || variable.type !== "list") return;
          
          const newItems = [...(variable.items || [])];
          newItems[itemIndex] = value;
          updateVariable(variableIndex, "items", newItems);
        };

        const addListItem = (variableIndex: number) => {
          const variable = variables[variableIndex];
          if (!variable || variable.type !== "list") return;
          
          const newItems = [...(variable.items || []), ""];
          updateVariable(variableIndex, "items", newItems);
        };

        const deleteListItem = (variableIndex: number, itemIndex: number) => {
          const variable = variables[variableIndex];
          if (!variable || variable.type !== "list") return;
          
          const newItems = (variable.items || []).filter((_: string, i: number) => i !== itemIndex);
          updateVariable(variableIndex, "items", newItems);
        };

        const addVariable = () => {
          const newVariable = {
            id: `var-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: "",
            type: "text"
          };
          const newVariables = [...variables, newVariable];
          handleInputChange(key, newVariables);
        };

        const deleteVariable = (idx: number) => {
          const newVariables = variables.filter((_v, i) => i !== idx);
          handleInputChange(key, newVariables);
        };

        return (
          <div key={key} className="space-y-4">
            <label className="block text-sm font-medium text-gray-200 mb-2">
              {label}
            </label>
            {variables.map((variable, vIdx) => (
              <div key={`${key}-variable-${vIdx}`} className="space-y-3 border border-gray-600 p-4 rounded-md">
                <div className="flex justify-between items-center">
                  <span className="text-gray-300 text-sm">Variable #{vIdx + 1}</span>
                  <button
                    type="button"
                    onClick={() => deleteVariable(vIdx)}
                    className="text-red-400 hover:text-red-500"
                  >
                    ×
                  </button>
                </div>
                
                {/* Variable Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Variable Name
                  </label>
                  <input
                    type="text"
                    value={variable.name ?? ""}
                    onChange={(e) => updateVariable(vIdx, "name", e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter variable name"
                  />
                </div>

                {/* Variable Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Variable Type
                  </label>
                  <select
                    value={variable.type ?? "text"}
                    onChange={(e) => updateVariable(vIdx, "type", e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="text">Text</option>
                    <option value="group">Group</option>
                    <option value="list">List</option>
                  </select>
                </div>

                {/* List Items Management (only show for list type) */}
                {variable.type === "list" && (
                  <div className="space-y-3 ml-4 border-l-2 border-gray-600 pl-4">
                    <label className="block text-sm font-medium text-gray-300">
                      List Items
                    </label>
                    {(variable.items || []).map((item: string, itemIdx: number) => (
                      <div key={`list-item-${itemIdx}`} className="flex space-x-2">
                        <input
                          type="text"
                          value={item}
                          onChange={(e) => updateListItem(vIdx, itemIdx, e.target.value)}
                          className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder={`Item ${itemIdx + 1}`}
                        />
                        <button
                          type="button"
                          onClick={() => deleteListItem(vIdx, itemIdx)}
                          className="px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addListItem(vIdx)}
                      className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                    >
                      Add List Item
                    </button>
                  </div>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addVariable}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Add Variable
            </button>
          </div>
        );
      }

      case "livePresentationPrompts": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const prompts: any[] = Array.isArray(value) ? value : [];

        const updatePrompt = (index: number, field: string, val: string | boolean) => {
          const newPrompts = prompts.map((p, i) => {
            if (i !== index) return p;
            
            if (field === "statement") {
              return { ...p, statement: val };
            } else if (field === "hasInput") {
              return { ...p, hasInput: val };
            } else if (field === "inputType") {
              return { ...p, inputType: val };
            } else if (field === "inputPlaceholder") {
              return { ...p, inputPlaceholder: val };
            } else if (field === "useRandomListItem") {
              const newPrompt = { ...p, useRandomListItem: val };
              // Clear list variable if unchecked
              if (!val) {
                delete newPrompt.listVariableId;
              }
              return newPrompt;
            } else if (field === "listVariableId") {
              return { ...p, listVariableId: val };
            } else if (field === "enableGroupSubmissionNavigation") {
              const newPrompt = { ...p, enableGroupSubmissionNavigation: val };
              // Clear related fields if unchecked
              if (!val) {
                delete newPrompt.submissionPromptId;
                delete newPrompt.allowEditing;
              }
              return newPrompt;
            } else if (field === "submissionPromptId") {
              return { ...p, submissionPromptId: val };
            } else if (field === "allowEditing") {
              return { ...p, allowEditing: val };
            }
            return p;
          });
          handleInputChange(key, newPrompts);
        };

        const addPrompt = () => {
          const newPrompts = [...prompts, { 
            id: `prompt-${Date.now()}`, 
            statement: "", 
            hasInput: false, 
            inputType: "textarea", 
            inputPlaceholder: "" 
          }];
          handleInputChange(key, newPrompts);
        };

        const deletePrompt = (idx: number) => {
          const newPrompts = prompts.filter((_p, i) => i !== idx);
          handleInputChange(key, newPrompts);
        };

        return (
          <div key={key} className="space-y-4">
            <label className="block text-sm font-medium text-gray-200 mb-2">
              {label}
            </label>
            {prompts.map((prompt, pIdx) => (
              <div key={`${key}-prompt-${pIdx}`} className="space-y-3 border border-gray-600 p-4 rounded-md">
                <div className="flex justify-between items-center">
                  <span className="text-gray-300 text-sm">Prompt #{pIdx + 1}</span>
                  <button
                    type="button"
                    onClick={() => deletePrompt(pIdx)}
                    className="text-red-400 hover:text-red-500"
                  >
                    ×
                  </button>
                </div>
                
                {/* Statement Text */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">
                    Statement/Question
                  </label>
                  <textarea
                    value={prompt.statement ?? ""}
                    onChange={(e) => updatePrompt(pIdx, "statement", e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter the statement or question for students"
                    rows={3}
                  />
                </div>

                {/* Has Input Checkbox */}
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={prompt.hasInput ?? false}
                    onChange={(e) => updatePrompt(pIdx, "hasInput", e.target.checked)}
                    className="text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-500 rounded"
                  />
                  <label className="text-sm text-gray-300">
                    Include input field for student responses
                  </label>
                </div>

                {/* Group Submission Navigation Checkbox */}
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={prompt.enableGroupSubmissionNavigation ?? false}
                    onChange={(e) => updatePrompt(pIdx, "enableGroupSubmissionNavigation", e.target.checked)}
                    className="text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-500 rounded"
                  />
                  <label className="text-sm text-gray-300">
                    Enable group submission navigation (allows students to view and edit group member&apos;s submissions)
                  </label>
                </div>

                {/* Group Submission Navigation Configuration */}
                {prompt.enableGroupSubmissionNavigation && (
                  <div className="space-y-3 ml-6 border-l-2 border-yellow-600 pl-4 bg-yellow-900/10 p-3 rounded">
                    <div className="text-xs text-yellow-200 mb-2">
                      <strong>📝 Group Submission Navigator:</strong> Students will be able to navigate through their group members&apos; submissions and optionally edit them. Perfect for collaborative review tasks.
                    </div>
                    
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-300">
                        Select Submission Prompt to Navigate
                      </label>
                      <select
                        value={prompt.submissionPromptId ?? ""}
                        onChange={(e) => updatePrompt(pIdx, "submissionPromptId", e.target.value)}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Choose a submission prompt...</option>
                        {(() => {
                          // Get available submission prompts from connected submission nodes
                          const availablePrompts = getAvailableSubmissionPrompts(
                            currentNodeId || '',
                            edges || [],
                            nodes || [],
                            pageRelationships
                          );
                          
                          // Create flat list of all prompts with their identifiers
                          const allPrompts: Array<{ id: string; label: string; nodeLabel: string }> = [];
                          availablePrompts.forEach(nodeInfo => {
                            nodeInfo.prompts.forEach(promptInfo => {
                              allPrompts.push({
                                id: promptInfo.id,
                                label: promptInfo.prompt.length > 50 ? promptInfo.prompt.substring(0, 50) + '...' : promptInfo.prompt,
                                nodeLabel: nodeInfo.nodeLabel
                              });
                            });
                          });
                          
                          return allPrompts.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.label} (from {p.nodeLabel})
                            </option>
                          ));
                        })()}
                      </select>
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={prompt.allowEditing ?? false}
                        onChange={(e) => updatePrompt(pIdx, "allowEditing", e.target.checked)}
                        className="text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-500 rounded"
                      />
                      <label className="text-sm text-gray-300">
                        Allow students to edit submissions while navigating
                      </label>
                    </div>

                    <div className="text-xs text-gray-400 mt-2">
                      💡 When a student navigates to a submission, it will update for everyone in the session including roomcast displays.
                    </div>
                  </div>
                )}

                {/* Input Configuration (only show if hasInput is true) */}
                {prompt.hasInput && (
                  <div className="space-y-3 ml-6 border-l-2 border-gray-600 pl-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-300">
                        Input Type
                      </label>
                      <div className="flex space-x-4">
                        <label className="flex items-center space-x-2">
                          <input
                            type="radio"
                            name={`inputType-${pIdx}`}
                            value="text"
                            checked={prompt.inputType === "text"}
                            onChange={(e) => updatePrompt(pIdx, "inputType", e.target.value)}
                            className="text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-300">Single Line Text</span>
                        </label>
                        <label className="flex items-center space-x-2">
                          <input
                            type="radio"
                            name={`inputType-${pIdx}`}
                            value="textarea"
                            checked={prompt.inputType === "textarea"}
                            onChange={(e) => updatePrompt(pIdx, "inputType", e.target.value)}
                            className="text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-300">Multi-line Text</span>
                        </label>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-300">
                        Input Placeholder
                      </label>
                      <input
                        type="text"
                        value={prompt.inputPlaceholder ?? ""}
                        onChange={(e) => updatePrompt(pIdx, "inputPlaceholder", e.target.value)}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter placeholder text for the input field"
                      />
                    </div>
                  </div>
                )}

                {/* Random List Item Feature (only show if connected list variables exist) */}
                {getConnectedListVariables.length > 0 && (
                  <div className="space-y-3 border-t border-gray-600 pt-3">
                    <div className="mb-2 p-2 bg-yellow-900/20 border border-yellow-600 rounded text-xs text-yellow-200">
                      <strong>Random List Feature:</strong> When enabled, a random item from the selected list will be displayed alongside your prompt during the live presentation.
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={prompt.useRandomListItem ?? false}
                        onChange={(e) => updatePrompt(pIdx, "useRandomListItem", e.target.checked)}
                        className="text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-500 rounded"
                      />
                      <label className="text-sm text-gray-300">
                        Display random item from connected list alongside this prompt
                      </label>
                    </div>

                    {/* List Variable Selection (only show if useRandomListItem is true) */}
                    {prompt.useRandomListItem && (
                      <div className="space-y-2 ml-6 border-l-2 border-gray-600 pl-4">
                        <label className="block text-sm font-medium text-gray-300">
                          Select List Variable
                        </label>
                        <select
                          value={prompt.listVariableId ?? ""}
                          onChange={(e) => updatePrompt(pIdx, "listVariableId", e.target.value)}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Choose a list variable...</option>
                          {getConnectedListVariables.map((listVar) => (
                            <option key={listVar.id} value={listVar.id}>
                              {listVar.name} ({listVar.items.length} items{listVar.items.length === 0 ? ' - can be populated by behavior' : ''})
                            </option>
                          ))}
                        </select>
                        
                        {/* Preview of how prompt will appear with random list item */}
                        {prompt.listVariableId && (
                          <div className="mt-2 space-y-2">
                            <div className="p-2 bg-gray-800 rounded text-xs">
                              <span className="text-gray-400">Available items: </span>
                              <span className="text-gray-300">
                                {(() => {
                                  const selectedList = getConnectedListVariables.find(v => v.id === prompt.listVariableId);
                                  if (!selectedList) return "";
                                  if (selectedList.items.length === 0) {
                                    return "(Empty - will be populated by behavior)";
                                  }
                                  return selectedList.items.join(", ");
                                })()}
                              </span>
                            </div>
                            <div className="p-3 bg-blue-900/30 border border-blue-500 rounded">
                              <div className="text-xs text-blue-300 mb-2">Preview - How it will appear to students:</div>
                              <div className="text-sm text-white space-y-2">
                                <div className="p-2 bg-gray-700 rounded">
                                  <div>{prompt.statement || "Your prompt text"}</div>
                                  <div className="mt-1 text-yellow-300 font-medium">
                                    {(() => {
                                      const selectedList = getConnectedListVariables.find(v => v.id === prompt.listVariableId);
                                      if (selectedList && selectedList.items.length > 0) {
                                        return `📋 ${selectedList.items[0]}`;
                                      }
                                      return "📋 (Random item will appear here when list is populated)";
                                    })()}
                                  </div>
                                </div>
                                <div className="text-xs text-gray-400">
                                  💡 Each time this prompt is shown, a different random item from the list will be displayed. The list can be populated manually or by behaviors.
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addPrompt}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Add Live Presentation Prompt
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
  nodes,
  edges,
  pageRelationships,
  currentNodeId,
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
            nodes={nodes}
            edges={edges}
            pageRelationships={pageRelationships}
            currentNodeId={currentNodeId}
            nodeType={nodeType}
          />
        </div>
      </div>
    </div>
  );
}
