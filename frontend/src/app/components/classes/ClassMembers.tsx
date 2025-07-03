"use client";

import React, { useState, useEffect } from 'react';
import { ClassRole, ClassMember } from '@/lib/types';
import { ClassAPI } from './classAPI';
import { UserGroupIcon, AcademicCapIcon, UserIcon } from '@heroicons/react/24/outline';

interface ClassMembersProps {
  classId: number;
  currentUserRole: ClassRole;
}

export default function ClassMembers({ classId, currentUserRole }: ClassMembersProps) {
  const [members, setMembers] = useState<ClassMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMembers();
  }, [classId]);

  const loadMembers = async () => {
    try {
      setLoading(true);
      setError(null);
      const classMembers = await ClassAPI.getClassMembers(classId);
      setMembers(classMembers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  // Sort members: instructors first, then students
  const sortedMembers = [...members].sort((a, b) => {
    if (a.role === 'instructor' && b.role !== 'instructor') return -1;
    if (a.role !== 'instructor' && b.role === 'instructor') return 1;
    return a.email.localeCompare(b.email);
  });

  const instructorCount = members.filter(m => m.role === 'instructor').length;
  const studentCount = members.filter(m => m.role === 'student').length;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-medium text-gray-900">Class Members</h2>
        <p className="mt-1 text-sm text-gray-500">
          {instructorCount} instructor{instructorCount !== 1 ? 's' : ''} and {studentCount} student{studentCount !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Members List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-600">{error}</p>
          <button
            onClick={loadMembers}
            className="mt-4 text-blue-600 hover:text-blue-700"
          >
            Try Again
          </button>
        </div>
      ) : (
        <div className="bg-white shadow-sm rounded-lg border border-gray-200">
          <ul className="divide-y divide-gray-200">
            {sortedMembers.map((member, index) => (
            <li key={member.id} className="px-6 py-4 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`
                    flex items-center justify-center h-10 w-10 rounded-full
                    ${member.role === 'instructor' ? 'bg-blue-100' : 'bg-gray-100'}
                  `}>
                    {member.role === 'instructor' ? (
                      <AcademicCapIcon className="h-5 w-5 text-blue-600" />
                    ) : (
                      <UserIcon className="h-5 w-5 text-gray-600" />
                    )}
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-900">
                      {member.email}
                    </p>
                    <p className="text-xs text-gray-500">
                      Joined {new Date(member.joined_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                
                <span className={`
                  inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                  ${member.role === 'instructor' 
                    ? 'bg-blue-100 text-blue-800' 
                    : 'bg-gray-100 text-gray-700'}
                `}>
                  {member.role === 'instructor' ? 'Instructor' : 'Student'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
      )}
    </div>
  );
} 
