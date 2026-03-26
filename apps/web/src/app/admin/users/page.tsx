"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { API_BASE_URL } from "@/config/api";
import { EditModal, FieldDefinition } from "@/components/edit-modal";
import { ConfirmModal } from "@/components/confirm-modal";

type User = {
  id: string;
  email: string;
  firstName: string;
  surname: string;
  role: string;
  createdAt: string;
  updatedAt: string;
};

function formatDate(date?: string): string {
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(date));
  } catch {
    return "—";
  }
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [filter, setFilter] = useState("");
  const [itemsToShow, setItemsToShow] = useState(10);

  const totals = useMemo(() => {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    return {
      total: users.length,
      admin: users.filter(u => u.role === 'admin').length,
      professional: users.filter(u => u.role === 'professional').length,
      homeowner: users.filter(u => u.role === 'homeowner').length,
      lastMonth: users.filter(u => new Date(u.createdAt) > oneMonthAgo).length,
    };
  }, [users]);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/users`);
      if (!res.ok) {
        console.warn(`Users endpoint returned ${res.status}, loading with empty state`);
        setUsers([]);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      console.warn('Failed to fetch users, API may be unavailable:', err);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (data: Record<string, any>) => {
    if (!editingUser) return;

    const payload = {
      email: data.email,
      firstName: data.firstName,
      surname: data.surname,
      role: data.role,
    };

    const res = await fetch(`${API_BASE_URL}/users/${editingUser.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(await res.text());

    // Optional password update if provided
    if (data.password && String(data.password).length >= 6) {
      const pwRes = await fetch(`${API_BASE_URL}/users/${editingUser.id}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: String(data.password) }),
      });
      if (!pwRes.ok) throw new Error(await pwRes.text());
    }

    await fetchUsers();
  };

  const handleCreate = async (data: Record<string, any>) => {
    const payload = {
      email: data.email,
      firstName: data.firstName,
      surname: data.surname,
      password: data.password,
      role: data.role,
    };

    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(await res.text());
    await fetchUsers();
    setCreatingNew(false);
  };

  const handleDelete = async () => {
    if (!deletingId) return;

    const res = await fetch(`${API_BASE_URL}/users/${deletingId}`, {
      method: "DELETE",
    });

    if (!res.ok) throw new Error(await res.text());
    setUsers((prev) => prev.filter((u) => u.id !== deletingId));
    setDeletingId(null);
  };

  const filtered = users.filter(
    (u) =>
      !filter ||
      u.email.toLowerCase().includes(filter.toLowerCase()) ||
      u.firstName?.toLowerCase().includes(filter.toLowerCase()) ||
      u.surname?.toLowerCase().includes(filter.toLowerCase())
  );

  const editFields: FieldDefinition[] = editingUser
    ? [
        { name: "email", label: "Email", type: "email", value: editingUser.email, required: true },
        { name: "firstName", label: "First Name", type: "text", value: editingUser.firstName, required: true },
        { name: "surname", label: "Surname", type: "text", value: editingUser.surname, required: true },
        {
          name: "role",
          label: "Role",
          type: "select",
          value: editingUser.role,
          options: [
            { label: "Client", value: "client" },
            { label: "Admin", value: "admin" },
            { label: "Professional", value: "professional" },
          ],
          required: true,
        },
        { name: "password", label: "New Password", type: "password", value: "", placeholder: "Leave blank to keep as-is" },
      ]
    : [];

  const createFields: FieldDefinition[] = [
    { name: "email", label: "Email", type: "email", value: "", required: true },
    { name: "firstName", label: "First Name", type: "text", value: "", required: true },
    { name: "surname", label: "Surname", type: "text", value: "", required: true },
    { name: "password", label: "Password", type: "text", value: "", required: true, placeholder: "Minimum 6 characters" },
    {
      name: "role",
      label: "Role",
      type: "select",
      value: "admin",
      options: [
        { label: "Admin", value: "admin" },
        { label: "Client", value: "client" },
      ],
      required: true,
    },
  ];

  if (loading) {
    return <div className="text-center text-slate-300">Loading users...</div>;
  }

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-5 text-white shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">Admin</p>
            <h1 className="text-2xl font-bold leading-tight">Users</h1>
            <p className="text-sm text-slate-200/90">{users.length} total users</p>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="rounded-lg bg-white/10 px-3 py-2 text-left">
              <p className="text-[11px] uppercase tracking-wide text-slate-200">Admin</p>
              <p className="text-lg font-bold text-white">{totals.admin}</p>
            </div>
            <div className="rounded-lg bg-white/10 px-3 py-2 text-left">
              <p className="text-[11px] uppercase tracking-wide text-slate-200">Professional</p>
              <p className="text-lg font-bold text-blue-300">{totals.professional}</p>
            </div>
            <div className="rounded-lg bg-white/10 px-3 py-2 text-left">
              <p className="text-[11px] uppercase tracking-wide text-slate-200">Homeowner</p>
              <p className="text-lg font-bold text-emerald-300">{totals.homeowner}</p>
            </div>
            <div className="rounded-lg bg-white/10 px-3 py-2 text-left">
              <p className="text-[11px] uppercase tracking-wide text-slate-200">Last Month</p>
              <p className="text-lg font-bold text-amber-200">{totals.lastMonth}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Actions/Filters */}
      <div className="rounded-lg border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 px-3 py-3 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            onClick={() => setCreatingNew(true)}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            + Create Admin
          </button>
        </div>
        <div className="relative">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full rounded-md border border-slate-600 bg-slate-900 px-2.5 py-1.5 pr-8 text-sm text-white placeholder:text-slate-400"
          />
          {filter && (
            <button
              type="button"
              onClick={() => setFilter('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
              aria-label="Clear search"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-white">
            <thead className="border-b border-slate-700 bg-slate-900/60 text-xs uppercase tracking-wide text-slate-300">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {filtered.slice(0, itemsToShow).map((user) => {
                const isClient = user.role === 'client' || user.role === 'homeowner';
                const clientFilter = `${user.firstName || ''} ${user.surname || ''}`.trim() || user.email;
                return (
                  <tr key={user.id} className="bg-slate-900/30 hover:bg-slate-900/50 transition">
                    <td className="px-4 py-3 font-semibold text-white">
                      {user.firstName} {user.surname}
                    </td>
                    <td className="px-4 py-3 text-slate-200">{user.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                          user.role === 'admin'
                            ? 'bg-purple-600 text-white'
                            : user.role === 'professional'
                              ? 'bg-blue-600 text-white'
                              : 'bg-emerald-600 text-white'
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/admin/messaging?view=conversations&clientId=${encodeURIComponent(user.id)}`}
                          className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white transition ${
                            isClient
                              ? 'bg-sky-600 hover:bg-sky-700'
                              : 'bg-slate-600 pointer-events-none opacity-60'
                          }`}
                          aria-disabled={!isClient}
                        >
                          Client Chats
                        </Link>
                        <Link
                          href={`/admin/projects?client=${encodeURIComponent(clientFilter)}`}
                          className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white transition ${
                            isClient
                              ? 'bg-indigo-600 hover:bg-indigo-700'
                              : 'bg-slate-600 pointer-events-none opacity-60'
                          }`}
                          aria-disabled={!isClient}
                        >
                          Client Projects
                        </Link>
                        <button
                          onClick={() => setEditingUser(user)}
                          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeletingId(user.id)}
                          className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-300">
                    No users match the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {filtered.length > itemsToShow && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => setItemsToShow(prev => prev + 10)}
            className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
          >
            Show Next 10 Results ({filtered.length - itemsToShow} remaining)
          </button>
        </div>
      )}

      {editingUser && (
        <EditModal
          isOpen={!!editingUser}
          onClose={() => setEditingUser(null)}
          title={`Edit ${editingUser.firstName} ${editingUser.surname}`}
          fields={editFields}
          onSave={handleSave}
        />
      )}

      {creatingNew && (
        <EditModal
          isOpen={creatingNew}
          onClose={() => setCreatingNew(false)}
          title="Create New Admin User"
          fields={createFields}
          onSave={handleCreate}
        />
      )}

      <ConfirmModal
        isOpen={!!deletingId}
        onCancel={() => setDeletingId(null)}
        onConfirm={handleDelete}
        title="Delete User"
        message="Are you sure you want to delete this user? This action cannot be undone and will remove all associated data."
        tone="danger"
      />
    </div>
  );
}
