'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

export default function Dashboard() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('owner@demo.com');
  const [password, setPassword] = useState('password123');
  const [niche, setNiche] = useState('eco-friendly pet products');
  const [ideas, setIdeas] = useState<{ name: string; rationale: string; estimatedDemand: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function login() {
    setError(null);
    try {
      const tokens = await api.login(email, password);
      setToken(tokens.accessToken);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function research() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.research(token, niche);
      setIdeas(res.ideas);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold">Seller dashboard</h1>

      {!token ? (
        <div className="mt-8 space-y-3 rounded-xl border bg-white p-6">
          <h2 className="font-semibold">Sign in</h2>
          <input
            className="w-full rounded border px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
          />
          <input
            className="w-full rounded border px-3 py-2"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
          />
          <button onClick={login} className="rounded bg-brand px-4 py-2 text-white">
            Log in
          </button>
          <p className="text-sm text-slate-500">Seeded demo: owner@demo.com / password123</p>
        </div>
      ) : (
        <div className="mt-8 space-y-4 rounded-xl border bg-white p-6">
          <h2 className="font-semibold">AI product research</h2>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded border px-3 py-2"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
            />
            <button
              onClick={research}
              disabled={loading}
              className="rounded bg-brand px-4 py-2 text-white disabled:opacity-50"
            >
              {loading ? 'Thinking…' : 'Research'}
            </button>
          </div>
          <ul className="space-y-3">
            {ideas.map((idea) => (
              <li key={idea.name} className="rounded border p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{idea.name}</span>
                  <span className="text-xs uppercase text-brand">{idea.estimatedDemand}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{idea.rationale}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </main>
  );
}
