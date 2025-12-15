"use client";

import { useEffect, useMemo, useState } from "react";
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
    return <div className="text-center text-slate-600">Loading users...</div>;
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
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm space-y-3">
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
            className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 pr-8 text-sm text-slate-900"
          />
          {filter && (
            <button
              type="button"
              onClick={() => setFilter('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
              aria-label="Clear search"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.slice(0, itemsToShow).map((user) => (
          <div key={user.id} className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md">
            <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3 text-white">
              <div>
                <div className="text-base font-bold">
                  {user.firstName} {user.surname}
                </div>
                <div className="text-xs text-slate-300">{user.email}</div>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                  user.role === "admin"
                    ? "bg-purple-500/20 text-purple-200"
                    : user.role === "professional"
                      ? "bg-blue-500/20 text-blue-200"
                      : "bg-slate-500/20 text-slate-200"
                }`}
              >
                {user.role}
              </span>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs text-slate-700">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                <span className="font-semibold">Joined:</span>
                <span className="text-slate-600">{formatDate(user.createdAt)}</span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>ID: {user.id}</span>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setEditingUser(user)}
                  className="flex-1 rounded-md border border-emerald-600 px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                >
                  Edit
                </button>
                <button
                  onClick={() => setDeletingId(user.id)}
                  className="flex-1 rounded-md border border-rose-600 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
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
