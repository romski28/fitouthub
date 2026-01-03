'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/config/api';
import Link from 'next/link';

interface Thread {
  id: string;
  type: 'private' | 'anonymous' | 'project';
  userId?: string;
  professionalId?: string;
  projectId?: string;
  sessionId?: string;
  userName?: string;
  professionalName?: string;
  projectName?: string;
  updatedAt: string;
  unreadCount: number;
  lastMessage?: string;
}

export default function FohInboxPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'private' | 'anonymous' | 'project'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadThreads();
  }, []);

  const loadThreads = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/chat/admin/inbox`);
      if (!response.ok) {
        throw new Error('Failed to load threads');
      }
      const data = await response.json();
      setThreads(data.threads || []);
    } catch (error) {
      console.error('Failed to load threads:', error);
      setThreads([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredThreads = threads.filter((thread) => {
    if (filter === 'unread' && thread.unreadCount === 0) return false;
    if (typeFilter !== 'all' && thread.type !== typeFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const name = thread.userName || thread.professionalName || thread.projectName || '';
      if (!name.toLowerCase().includes(query)) return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">FOH Support Inbox</h1>
          <p className="text-gray-600">Manage all private, anonymous, and project chat threads</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search
              </label>
              <input
                type="text"
                placeholder="Search by name or project..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as 'all' | 'unread')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Threads</option>
                <option value="unread">Unread Only</option>
              </select>
            </div>

            {/* Type Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type
              </label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Types</option>
                <option value="private">Private Support</option>
                <option value="anonymous">Anonymous</option>
                <option value="project">Project Chat</option>
              </select>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="text-sm text-gray-600 mb-1">Total Threads</div>
            <div className="text-3xl font-bold text-gray-900">{threads.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="text-sm text-gray-600 mb-1">Unread</div>
            <div className="text-3xl font-bold text-blue-600">
              {threads.filter((t) => t.unreadCount > 0).length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="text-sm text-gray-600 mb-1">Private</div>
            <div className="text-3xl font-bold text-green-600">
              {threads.filter((t) => t.type === 'private').length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="text-sm text-gray-600 mb-1">Project</div>
            <div className="text-3xl font-bold text-purple-600">
              {threads.filter((t) => t.type === 'project').length}
            </div>
          </div>
        </div>

        {/* Threads List */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-4 text-gray-600">Loading threads...</p>
            </div>
          ) : filteredThreads.length === 0 ? (
            <div className="p-12 text-center">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-gray-900">No threads found</h3>
              <p className="mt-2 text-gray-500">
                {searchQuery || filter !== 'all' || typeFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'No support threads yet'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredThreads.map((thread) => (
                <Link
                  key={thread.id}
                  href={`/admin/foh-inbox/${thread.id}`}
                  className="block hover:bg-gray-50 transition-colors"
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          {/* Type Badge */}
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              thread.type === 'private'
                                ? 'bg-green-100 text-green-800'
                                : thread.type === 'anonymous'
                                ? 'bg-gray-100 text-gray-800'
                                : 'bg-purple-100 text-purple-800'
                            }`}
                          >
                            {thread.type === 'private'
                              ? 'Private'
                              : thread.type === 'anonymous'
                              ? 'Anonymous'
                              : 'Project'}
                          </span>

                          {/* Unread Badge */}
                          {thread.unreadCount > 0 && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              {thread.unreadCount} unread
                            </span>
                          )}
                        </div>

                        <h3 className="text-lg font-semibold text-gray-900 truncate">
                          {thread.userName ||
                            thread.professionalName ||
                            thread.projectName ||
                            `Anonymous ${thread.sessionId?.slice(0, 8)}`}
                        </h3>

                        {thread.lastMessage && (
                          <p className="mt-1 text-sm text-gray-600 truncate">
                            {thread.lastMessage}
                          </p>
                        )}
                      </div>

                      <div className="ml-4 flex-shrink-0 text-right">
                        <div className="text-sm text-gray-500">
                          {new Date(thread.updatedAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
