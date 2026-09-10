// Tiny typed fetch wrapper for client components.

export async function api<T = unknown>(
  url: string,
  options?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(url, {
    method: options?.method ?? "GET",
    headers: options?.body ? { "Content-Type": "application/json" } : undefined,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "שגיאה בבקשה");
  }
  return data as T;
}
