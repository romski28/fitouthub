'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';

// MINIMAL TEST PAGE — isolate iOS issues
export default function Home() {
  const { isLoggedIn, user } = useAuth();
  const [clicks, setClicks] = useState(0);
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      alert('Form submitted: ' + inputValue.trim());
      setInputValue('');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center gap-6 p-8" style={{ minHeight: 'calc(100vh - 64px)' }}>
      <div className="text-center">
        <h1 className="text-2xl font-bold text-green-700">iOS Test Page</h1>
        <p className="text-sm text-slate-500 mt-1">React hydrated: {isLoggedIn !== undefined ? 'YES ✅' : 'NO ❌'}</p>
        <p className="text-sm text-slate-500">User: {user?.nickname || 'not logged in'}</p>
      </div>

      {/* Test button with onClick */}
      <button
        onClick={() => setClicks(c => c + 1)}
        className="rounded-lg bg-coral px-6 py-3 text-white font-bold text-lg"
      >
        Click me: {clicks}
      </button>

      {/* Test form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          placeholder="Type something..."
          className="border border-slate-300 rounded-lg px-4 py-2 text-lg"
        />
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-4 py-2 text-white font-bold"
        >
          Submit
        </button>
      </form>

      {/* Test Link */}
      <Link href="/docs" className="text-blue-600 underline text-lg">
        Go to Docs &amp; Tools →
      </Link>
    </div>
  );
}









