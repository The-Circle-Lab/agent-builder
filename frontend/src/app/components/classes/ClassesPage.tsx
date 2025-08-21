"use client";

import React, { useState, useEffect } from 'react';
import { User } from '@/lib/authAPI';
import { Class } from '@/lib/types';
import { ClassAPI } from './classAPI';
import CreateClassModal from './CreateClassModal';
import JoinClassModal from './JoinClassModal';
import UserDropdown from '../UserDropdown';
import { BookOpenIcon, UserGroupIcon, AcademicCapIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

interface ClassesPageProps {
  user: User;
  onSelectClass: (classObj: Class) => void;
  onLogout: () => void;
  onSettings: () => void;
  onUserUpdate: (updatedUser: User) => void;
}

export default function ClassesPage({ user, onSelectClass, onLogout, onSettings, onUserUpdate }: ClassesPageProps) { // eslint-disable-line @typescript-eslint/no-unused-vars
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  useEffect(() => {
    loadClasses();
  }, []);

  const loadClasses = async () => {
    try {
      setLoading(true);
      setError(null);
      const userClasses = await ClassAPI.getUserClasses();
      setClasses(userClasses);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load classes');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClass = async (name: string, description?: string) => {
    try {
      const newClass = await ClassAPI.createClass(name, description);
      setClasses([...classes, newClass]);
      setShowCreateModal(false);
      return newClass;
    } catch (err) {
      throw err;
    }
  };

  const handleJoinClass = async (joinCode: string) => {
    try {
      const joinedClass = await ClassAPI.joinClass(joinCode);
      setClasses([...classes, joinedClass]);
      setShowJoinModal(false);
    } catch (err) {
      throw err;
    }
  };

  const isInstructor = !user.student;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <AcademicCapIcon className="h-8 w-8 text-blue-600" />
              <h1 className="text-xl font-semibold text-gray-900">My Classes</h1>
            </div>
            <UserDropdown
              user={user}
              onSettings={onSettings}
              onLogout={onLogout}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Action Buttons */}
        <div className="mb-8 flex gap-4">
          <button
            onClick={() => setShowJoinModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
          >
            Join Class
          </button>
          {isInstructor && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50"
            >
              Create Class
            </button>
          )}
        </div>

        {/* Classes Grid */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-600">{error}</p>
            <button
              onClick={loadClasses}
              className="mt-4 text-blue-600 hover:text-blue-700"
            >
              Try Again
            </button>
          </div>
        ) : classes.length === 0 ? (
          <div className="text-center py-12">
            <BookOpenIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900">No classes yet</h3>
            <p className="mt-1 text-sm text-gray-500">
              {isInstructor ? 'Create a new class or join an existing one to get started.' : 'Join a class using a code from your instructor to get started.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {classes.map(classObj => (
              <div
                key={classObj.id}
                onClick={() => onSelectClass(classObj)}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-gray-900">{classObj.name}</h3>
                    {classObj.description && (
                      <p className="mt-1 text-sm text-gray-500">{classObj.description}</p>
                    )}
                    <div className="mt-4 flex items-center text-sm text-gray-500">
                      <UserGroupIcon className="h-4 w-4 mr-1" />
                      <span>{classObj.member_count} member{classObj.member_count !== 1 ? 's' : ''}</span>
                      <span className="mx-2">•</span>
                      <span className={classObj.user_role === 'instructor' ? 'text-blue-600' : 'text-gray-600'}>
                        {classObj.user_role === 'instructor' ? 'Instructor' : 'Student'}
                      </span>
                    </div>
                  </div>
                  <ChevronRightIcon className="h-5 w-5 text-gray-400" />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modals */}
      {showCreateModal && (
        <CreateClassModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateClass}
        />
      )}
      {showJoinModal && (
        <JoinClassModal
          onClose={() => setShowJoinModal(false)}
          onJoin={handleJoinClass}
        />
      )}
    </div>
  );
} 
