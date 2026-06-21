const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

async function request<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) =>
    request<Tokens>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  register: (tenantName: string, email: string, password: string) =>
    request<Tokens>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ tenantName, email, password }),
    }),

  products: (token: string) =>
    request<{ items: unknown[]; total: number }>('/products', undefined, token),

  research: (token: string, niche: string) =>
    request<{ ideas: { name: string; rationale: string; estimatedDemand: string }[] }>(
      '/ai/research',
      { method: 'POST', body: JSON.stringify({ niche }) },
      token,
    ),
};
