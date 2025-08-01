import React, { useEffect, useState } from "react";
import { Dialog } from "@headlessui/react";
import {
  XMarkIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  ClockIcon,
  LockClosedIcon,
  LockOpenIcon,
  UsersIcon,
  PlayCircleIcon,
} from "@heroicons/react/24/outline";
import { API_CONFIG } from "@/lib/constants";

interface StudentVideoProgress {
  user_id: number;
  email: string;
  watched_seconds: number;
  total_seconds: number;
  completed: boolean;
  last_updated: string;
}

interface StudentVideoProgressModalProps {
  deploymentId: string;
  deploymentName: string;
  onClose: () => void;
}

export default function StudentVideoProgressModal({
  deploymentId,
  deploymentName,
  onClose,
}: StudentVideoProgressModalProps) {
  const [progressList, setProgressList] = useState<StudentVideoProgress[]>([]);
  const [selectedStudent, setSelectedStudent] =
    useState<StudentVideoProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deploymentOpen, setDeploymentOpen] = useState(true);
  const [stateChanging, setStateChanging] = useState(false);

  // Fetch progress data
  useEffect(() => {
    const fetchProgress = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/video/progress`,
          { credentials: "include" }
        );
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setProgressList(data);
        setSelectedStudent(data.length > 0 ? data[0] : null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load video progress"
        );
      } finally {
        setLoading(false);
      }
    };
    fetchProgress();
  }, [deploymentId]);

  // Optionally, implement deployment open/close if your backend supports it
  const handleToggleDeploymentState = async () => {
    try {
      setStateChanging(true);
      const endpoint = deploymentOpen ? "close" : "open";
      const response = await fetch(
        `${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/${endpoint}`,
        { method: "POST", credentials: "include" }
      );
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
      setDeploymentOpen(result.is_open);
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Failed to toggle deployment state"
      );
    } finally {
      setStateChanging(false);
    }
  };

  // Stats
  const stats = React.useMemo(() => {
    const totalStudents = progressList.length;
    const completed = progressList.filter((s) => s.completed).length;
    const inProgress = progressList.filter((s) => !s.completed).length;
    const avgWatched =
      progressList.length > 0
        ? Math.round(
            (progressList.reduce(
              (sum, s) =>
                sum +
                (s.total_seconds > 0 ? s.watched_seconds / s.total_seconds : 0),
              0
            ) /
              progressList.length) *
              100
          )
        : 0;
    return { totalStudents, completed, inProgress, avgWatched };
  }, [progressList]);

  // Helper
  const getStatusIcon = (completed: boolean) =>
    completed ? (
      <CheckCircleIcon className="h-4 w-4 text-green-500" />
    ) : (
      <ClockIcon className="h-4 w-4 text-yellow-500" />
    );

  return (
    <Dialog open={true} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="bg-white rounded-lg shadow-xl max-w-6xl w-full h-[80vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b">
            <Dialog.Title className="text-lg font-semibold text-black">
              Student Video Progress - {deploymentName}
            </Dialog.Title>
            <div className="flex items-center space-x-2">
              {/* Optionally show open/close button if supported */}
              <button
                onClick={handleToggleDeploymentState}
                disabled={stateChanging}
                className={`p-2 rounded disabled:opacity-50 ${
                  deploymentOpen
                    ? "text-green-600 hover:text-green-700 hover:bg-green-50"
                    : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                }`}
                title={deploymentOpen ? "Close deployment" : "Open deployment"}
              >
                {deploymentOpen ? (
                  <LockOpenIcon className="h-5 w-5" />
                ) : (
                  <LockClosedIcon className="h-5 w-5" />
                )}
              </button>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500"
                aria-label="Close"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Stats Summary */}
          <div className="p-4 bg-gray-50 border-b">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-medium text-gray-900">
                Video Progress Overview
              </h3>
            </div>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {stats.totalStudents}
                </div>
                <div className="text-sm text-gray-500">Total Students</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {stats.completed}
                </div>
                <div className="text-sm text-gray-500">Completed</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600">
                  {stats.inProgress}
                </div>
                <div className="text-sm text-gray-500">In Progress</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {stats.avgWatched > 0 ? `${stats.avgWatched}%` : "—"}
                </div>
                <div className="text-sm text-gray-500">Avg Watched</div>
              </div>
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden">
            {/* Students List */}
            <div className="w-1/3 border-r bg-gray-50 overflow-y-auto">
              <div className="p-4">
                <h3 className="text-sm font-medium text-gray-900 mb-3">
                  Students ({progressList.length})
                </h3>
                {loading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  </div>
                ) : error ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                ) : progressList.length === 0 ? (
                  <div className="text-center py-8">
                    <PlayCircleIcon className="mx-auto h-8 w-8 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-500">
                      No video progress yet
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {progressList.map((student) => (
                      <button
                        key={student.user_id}
                        onClick={() => setSelectedStudent(student)}
                        className={`w-full text-left p-3 rounded-lg hover:bg-white hover:shadow-sm transition-all ${
                          selectedStudent?.user_id === student.user_id
                            ? "bg-white shadow-sm"
                            : ""
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              {getStatusIcon(student.completed)}
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {student.email}
                              </p>
                            </div>
                            <div className="mt-1 space-y-1">
                              <div className="flex items-center space-x-2 text-xs text-gray-500">
                                <span
                                  className={
                                    student.completed
                                      ? "text-green-600 font-medium"
                                      : "text-yellow-600 font-medium"
                                  }
                                >
                                  {student.completed
                                    ? "Completed"
                                    : `Watched: ${
                                        student.total_seconds > 0
                                          ? Math.round(
                                              (student.watched_seconds /
                                                student.total_seconds) *
                                                100
                                            )
                                          : 0
                                      }%`}
                                </span>
                              </div>
                              <p className="text-xs text-gray-400">
                                Last updated:{" "}
                                {new Date(
                                  student.last_updated
                                ).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <ChevronRightIcon className="h-4 w-4 text-gray-400" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Student Details */}
            <div className="flex-1 overflow-y-auto">
              {selectedStudent ? (
                <div className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-gray-900">
                      Video Progress - {selectedStudent.email}
                    </h3>
                    {selectedStudent.completed ? (
                      <div className="flex items-center space-x-1 text-green-600">
                        <CheckCircleIcon className="h-4 w-4" />
                        <span className="text-sm font-medium">Completed</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-1 text-yellow-600">
                        <ClockIcon className="h-4 w-4" />
                        <span className="text-sm font-medium">
                          Watched:{" "}
                          {selectedStudent.total_seconds > 0
                            ? Math.round(
                                (selectedStudent.watched_seconds /
                                  selectedStudent.total_seconds) *
                                  100
                              )
                            : 0}
                          %
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-black">Watched:</span>
                        <span className="ml-2 font-medium text-black">
                          {selectedStudent.watched_seconds} /{" "}
                          {selectedStudent.total_seconds} sec
                        </span>
                      </div>
                      <div>
                        <span className="text-black">Completed:</span>
                        <span className="ml-2 font-medium">
                          {selectedStudent.completed ? (
                            <span className="text-green-600">Yes</span>
                          ) : (
                            <span className="text-yellow-600">No</span>
                          )}
                        </span>
                      </div>
                      <div>
                        <span className="text-black">Last Updated:</span>
                        <span className="ml-2 font-medium text-black">
                          {new Date(
                            selectedStudent.last_updated
                          ).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-black">Watched %:</span>
                        <span className="ml-2 font-medium text-blue-600">
                          {selectedStudent.total_seconds > 0
                            ? Math.round(
                                (selectedStudent.watched_seconds /
                                  selectedStudent.total_seconds) *
                                  100
                              )
                            : 0}
                          %
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 text-center text-gray-500">
                  <UsersIcon className="mx-auto h-8 w-8 text-gray-400" />
                  <p className="mt-2 text-sm">
                    Select a student to view details
                  </p>
                </div>
              )}
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
