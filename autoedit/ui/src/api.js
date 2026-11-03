// Tiny client for the local AutoEdit server.
const H = { 'Content-Type': 'application/json', 'X-AutoEdit': '1' };

async function req(method, url, body) {
  const res = await fetch(url, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error?.message || 'error'), { data, status: res.status });
  return data;
}

export const api = {
  state: () => req('GET', '/api/state'),
  settings: (patch) => req('PATCH', '/api/settings', patch),
  setSecret: (name, value) => req('PUT', `/api/secrets/${name}`, { value }),
  projects: () => req('GET', '/api/projects'),
  project: (id) => req('GET', `/api/projects/${id}`),
  createProject: (body) => req('POST', '/api/projects', body),
  updateProject: (id, body) => req('PATCH', `/api/projects/${id}`, body),
  deleteProject: (id) => req('DELETE', `/api/projects/${id}`),
  duplicate: (id) => req('POST', `/api/projects/${id}/duplicate`),
  removeMedia: (id, mid) => req('DELETE', `/api/projects/${id}/media/${mid}`),
  setRole: (id, mid, role) => req('PATCH', `/api/projects/${id}/media/${mid}`, { role }),
  create: (id, body) => req('POST', `/api/projects/${id}/create`, body),
  edit: (id, text) => req('POST', `/api/projects/${id}/edit`, { text }),
  variant: (id, body) => req('POST', `/api/projects/${id}/variant`, body),
  undo: (id) => req('POST', `/api/projects/${id}/undo`),
  redo: (id) => req('POST', `/api/projects/${id}/redo`),
  restore: (id, versionId) => req('POST', `/api/projects/${id}/restore`, { versionId }),
  exportVideo: (id, body) => req('POST', `/api/projects/${id}/export`, body),
  reveal: (id, exportId) => req('POST', `/api/projects/${id}/reveal`, { exportId }),
  cancelJob: (id) => req('POST', `/api/jobs/${id}/cancel`),
  retryJob: (id) => req('POST', `/api/jobs/${id}/retry`),
  jobs: (projectId) => req('GET', `/api/jobs?projectId=${projectId}`),
  ig: () => req('GET', '/api/instagram'),
  igConfig: (body) => req('POST', '/api/instagram/config', body),
  igConnect: () => req('POST', '/api/instagram/connect'),
  igFinish: (url) => req('POST', '/api/instagram/finish', { url }),
  igSync: () => req('POST', '/api/instagram/sync'),
  igDisconnect: () => req('POST', '/api/instagram/disconnect'),
  igDna: () => req('GET', '/api/instagram/dna'),
  igCoach: (question) => req('POST', '/api/instagram/coach', { question }),
  removeLogo: () => req('DELETE', '/api/brand/logo'),
};

/** Upload with REAL byte progress (XHR), streamed straight into the project folder. */
export function uploadFile(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.setRequestHeader('X-AutoEdit', '1');
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => { try { resolve(JSON.parse(x.responseText)); } catch { reject(new Error('upload')); } };
    x.onerror = () => reject(new Error('upload'));
    x.send(file);
  });
}

export const fileUrl = (projectId, rel) => (rel ? `/files/${projectId}/${rel.split('/').map(encodeURIComponent).join('/')}` : null);

/** Collect files from a drop event, including whole folders (with their relative paths). */
export async function filesFromDrop(e) {
  const items = [...(e.dataTransfer?.items || [])];
  const entries = items.map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return [...(e.dataTransfer?.files || [])].map((f) => ({ file: f, relPath: f.name }));
  const out = [];
  const walk = async (entry, prefix) => {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      out.push({ file, relPath: prefix + file.name });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
      } while (batch.length);
    }
  };
  for (const en of entries) await walk(en, '');
  return out;
}

export const SUPPORTED = /\.(mp4|mov|avi|webm|mkv|m4v|3gp|mts|m2ts|mp3|wav|m4a|aac|flac|ogg|opus|jpe?g|png|webp|heic|heif)$/i;
