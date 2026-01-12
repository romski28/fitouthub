"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/config/api";
import { useAuth } from "@/context/auth-context";

interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  surname: string;
  role: string;
}

export default function AdminProfilePage() {
  const { user, accessToken } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return;
      try {
        const res = await fetch(`${API_BASE_URL}/users/${user.id}`);
        if (!res.ok) throw new Error(await res.text());
        const data: UserProfile = await res.json();
        setProfile(data);
        setEmail(data.email || "");
        setFirstName(data.firstName || "");
        setSurname(data.surname || "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile");
      }
    };
    loadProfile();
  }, [user]);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/users/${profile.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, firstName, surname }),
      });
      if (!res.ok) throw new Error(await res.text());

      // Optional password update
      if (password && password.length >= 6) {
        const pwRes = await fetch(`${API_BASE_URL}/users/${profile.id}/password`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        if (!pwRes.ok) throw new Error(await pwRes.text());
        setPassword("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
      return;
    } finally {
      setSaving(false);
    }
  };

  if (!profile) {
    return <div className="text-slate-600">Loading profile...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
        <h1 className="text-xl font-bold text-slate-900 mb-1">My Profile</h1>
        <p className="text-sm text-slate-600">Update your details and password.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4 max-w-xl">
        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}

        <div className="grid gap-3">
          <label className="text-sm font-medium text-slate-800">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid gap-3">
          <label className="text-sm font-medium text-slate-800">First Name</label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid gap-3">
          <label className="text-sm font-medium text-slate-800">Surname</label>
          <input
            type="text"
            value={surname}
            onChange={(e) => setSurname(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <hr className="my-2" />

        <div className="grid gap-3">
          <label className="text-sm font-medium text-slate-800">New Password</label>
          <input
            type="password"
            value={password}
            placeholder="Minimum 6 characters"
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-slate-500">Leave blank to keep existing password.</p>
        </div>

        <div className="pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
