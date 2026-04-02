'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/auth-context';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/config/api';

type PolicyType = 'TERMS_AND_CONDITIONS' | 'SECURITY_STATEMENT' | 'CONTRACT_TEMPLATE';

interface Policy {
  id: string;
  type: PolicyType;
  version: string;
  title: string;
  content: string;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function AdminPoliciesPage() {
  const { user, accessToken } = useAuth();
  const router = useRouter();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [filterType, setFilterType] = useState<PolicyType | 'ALL'>('ALL');

  // Check if user is admin
  useEffect(() => {
    if (!user || user.role !== 'admin') {
      router.push('/');
    }
  }, [user, router]);

  // Fetch policies
  const fetchPolicies = useCallback(async () => {
    if (!accessToken) return;
    
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/policies`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch policies');
      }

      const data = await response.json();
      setPolicies(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching policies:', err);
      setError('Failed to load policies');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (user?.role === 'admin' && accessToken) {
      fetchPolicies();
    }
  }, [user, accessToken, fetchPolicies]);

  const activatePolicy = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/policies/${id}/activate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to activate policy');
      }

      // Refresh policies
      await fetchPolicies();
      alert('Policy activated successfully');
    } catch (err) {
      console.error('Error activating policy:', err);
      alert('Failed to activate policy');
    }
  };

  const deletePolicy = async (id: string) => {
    if (!confirm('Are you sure you want to delete this policy version?')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/policies/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to delete policy');
      }

      // Refresh policies
      await fetchPolicies();
      alert('Policy deleted successfully');
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      console.error('Error deleting policy:', error);
      alert(error.message || 'Failed to delete policy');
    }
  };

  const filteredPolicies = filterType === 'ALL' 
    ? policies 
    : policies.filter(p => p.type === filterType);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Policy Management</h1>
            <p className="text-slate-600 mt-2">Manage Terms & Conditions, Security Statement, and Agreement Templates</p>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
          >
            {showCreateForm ? 'Cancel' : 'Create New Version'}
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            {error}
          </div>
        )}

        {/* Create Form */}
        {showCreateForm && (
          <div className="mb-8 p-6 bg-white rounded-lg shadow-sm border border-slate-200">
            <h2 className="text-xl font-semibold mb-4">Create New Policy Version</h2>
            <CreatePolicyForm
              accessToken={accessToken || ''}
              onSuccess={() => {
                setShowCreateForm(false);
                fetchPolicies();
              }}
              onCancel={() => setShowCreateForm(false)}
            />
          </div>
        )}

        {/* Filter */}
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setFilterType('ALL')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              filterType === 'ALL'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterType('TERMS_AND_CONDITIONS')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              filterType === 'TERMS_AND_CONDITIONS'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            Terms & Conditions
          </button>
          <button
            onClick={() => setFilterType('SECURITY_STATEMENT')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              filterType === 'SECURITY_STATEMENT'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            Security Statement
          </button>
          <button
            onClick={() => setFilterType('CONTRACT_TEMPLATE')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              filterType === 'CONTRACT_TEMPLATE'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            Agreement Template
          </button>
        </div>

        {/* Policies List */}
        <div className="space-y-4">
          {filteredPolicies.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8 text-center text-slate-600">
              No policies found
            </div>
          ) : (
            filteredPolicies.map((policy) => (
              <div
                key={policy.id}
                className="bg-white rounded-lg shadow-sm border border-slate-200 p-6"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-slate-900">
                        {policy.title}
                      </h3>
                      <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs rounded font-medium">
                        v{policy.version}
                      </span>
                      {policy.isActive && (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded font-medium">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 mb-2">
                      Type: <span className="font-medium">{policy.type.replace(/_/g, ' ')}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      Created: {new Date(policy.createdAt).toLocaleDateString()} by {policy.createdBy || 'Unknown'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Content length: {policy.content.length} characters
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedPolicy(policy)}
                      className="px-3 py-1 bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition text-sm font-medium"
                    >
                      View
                    </button>
                    {!policy.isActive && (
                      <button
                        onClick={() => activatePolicy(policy.id)}
                        className="px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 transition text-sm font-medium"
                      >
                        Activate
                      </button>
                    )}
                    {!policy.isActive && (
                      <button
                        onClick={() => deletePolicy(policy.id)}
                        className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition text-sm font-medium"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* View Policy Modal */}
        {selectedPolicy && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-6 border-b border-slate-200">
                <h2 className="text-xl font-semibold">
                  {selectedPolicy.title} v{selectedPolicy.version}
                </h2>
                <button
                  onClick={() => setSelectedPolicy(null)}
                  className="p-1 hover:bg-slate-200 rounded-lg transition"
                >
                  ✕
                </button>
              </div>
              <div className="overflow-y-auto flex-1 p-6">
                <pre className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed font-sans">
                  {selectedPolicy.content}
                </pre>
              </div>
              <div className="p-6 border-t border-slate-200 flex justify-end">
                <button
                  onClick={() => setSelectedPolicy(null)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Future Enhancements Section */}
        <div className="mt-12 space-y-6">
          <div className="border-t border-slate-200 pt-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Future Enhancements</h2>
            <p className="text-slate-600 mb-6">Planned features for the policy management system</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Rich Text Editor */}
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex items-start gap-3 mb-3">
                <span className="text-2xl">✏️</span>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900">Rich Text Editor</h3>
                  <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded font-medium">Coming Soon</span>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                WYSIWYG editor for policy content with formatting, headings, lists, and links. Preview mode before publishing.
              </p>
              <ul className="text-xs text-slate-500 space-y-1">
                <li>• Visual formatting tools</li>
                <li>• Markdown support</li>
                <li>• Live preview</li>
                <li>• Template variables</li>
              </ul>
            </div>

            {/* Version Comparison */}
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex items-start gap-3 mb-3">
                <span className="text-2xl">🔀</span>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900">Version Diff Viewer</h3>
                  <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded font-medium">Coming Soon</span>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                Side-by-side comparison of policy versions showing exactly what changed between versions.
              </p>
              <ul className="text-xs text-slate-500 space-y-1">
                <li>• Highlighted differences</li>
                <li>• Side-by-side view</li>
                <li>• Change summary</li>
                <li>• Export diff report</li>
              </ul>
            </div>

            {/* Approval Workflow */}
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex items-start gap-3 mb-3">
                <span className="text-2xl">✅</span>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900">Approval Workflow</h3>
                  <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded font-medium">Coming Soon</span>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                Multi-step approval process for policy changes. Require legal review before activation.
              </p>
              <ul className="text-xs text-slate-500 space-y-1">
                <li>• Draft → Review → Approved states</li>
                <li>• Reviewer assignments</li>
                <li>• Comment threads</li>
                <li>• Approval history</li>
              </ul>
            </div>

            {/* User Notifications */}
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex items-start gap-3 mb-3">
                <span className="text-2xl">🔔</span>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900">User Notifications</h3>
                  <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded font-medium">Coming Soon</span>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                Automatically notify users when policies are updated. Track which users have acknowledged changes.
              </p>
              <ul className="text-xs text-slate-500 space-y-1">
                <li>• Email notifications</li>
                <li>• In-app alerts</li>
                <li>• Re-consent flow</li>
                <li>• Acknowledgment tracking</li>
              </ul>
            </div>

            {/* Document Templates */}
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex items-start gap-3 mb-3">
                <span className="text-2xl">📋</span>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900">Dynamic Templates</h3>
                  <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded font-medium">Coming Soon</span>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                Template variables for agreements that auto-populate with project details, client info, and milestones.
              </p>
              <ul className="text-xs text-slate-500 space-y-1">
                <li>• Variable placeholders</li>
                <li>• Conditional sections</li>
                <li>• Auto-generation</li>
                <li>• PDF export</li>
              </ul>
            </div>

            {/* Compliance Reports */}
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex items-start gap-3 mb-3">
                <span className="text-2xl">📊</span>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900">Compliance Reports</h3>
                  <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded font-medium">Coming Soon</span>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                Generate compliance reports showing user agreement rates, version history, and audit trails.
              </p>
              <ul className="text-xs text-slate-500 space-y-1">
                <li>• Agreement statistics</li>
                <li>• Version timeline</li>
                <li>• Export to PDF/Excel</li>
                <li>• Regulatory compliance</li>
              </ul>
            </div>
          </div>

          {/* Note */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">💡</span>
              <div>
                <h3 className="font-semibold text-blue-900">Development Roadmap</h3>
                <p className="mt-1 text-sm text-blue-800">
                  These features will be implemented as the platform grows. The current system provides a solid foundation
                  for version control and document management. Contact support if you need any of these features prioritized.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Create Policy Form Component
function CreatePolicyForm({
  accessToken,
  onSuccess,
  onCancel,
}: {
  accessToken: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<PolicyType>('TERMS_AND_CONDITIONS');
  const [version, setVersion] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!version || !title || !content) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(`${API_BASE_URL}/policies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          type,
          version,
          title,
          content,
          isActive,
          createdBy: 'admin',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to create policy');
      }

      alert('Policy created successfully');
      onSuccess();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      console.error('Error creating policy:', error);
      alert(error.message || 'Failed to create policy');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Policy Type *
        </label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as PolicyType)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="TERMS_AND_CONDITIONS">Terms and Conditions</option>
          <option value="SECURITY_STATEMENT">Security Statement</option>
          <option value="CONTRACT_TEMPLATE">Agreement Template</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Version *
        </label>
        <input
          type="text"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          placeholder="e.g., 1.1, 2.0"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Title *
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Terms and Conditions"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Content *
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste the full policy content here..."
          rows={10}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
          required
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isActive"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="w-4 h-4"
        />
        <label htmlFor="isActive" className="text-sm text-slate-700">
          Set as active version (will deactivate other versions of this type)
        </label>
      </div>

      <div className="flex gap-2 pt-4">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
        >
          {submitting ? 'Creating...' : 'Create Policy'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition font-medium"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
