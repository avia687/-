async function req(method, url, body) {
  const opts = { method, headers: {} };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(url, opts);
  if (!r.ok) {
    let msg = r.statusText;
    try {
      msg = (await r.json()).detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return r.json();
}

export const api = {
  get: (u) => req("GET", u),
  post: (u, b) => req("POST", u, b ?? {}),
  put: (u, b) => req("PUT", u, b),
};

/** Upload with real progress (XHR) so big phone videos show a moving bar. */
export function uploadFiles(files, onProgress) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    for (const f of files) fd.append("files", f, f.webkitRelativePath ? f.webkitRelativePath.replaceAll("/", "_") : f.name);
    const x = new XMLHttpRequest();
    x.open("POST", "/api/upload");
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () => (x.status < 300 ? resolve(JSON.parse(x.responseText)) : reject(new Error(x.responseText)));
    x.onerror = () => reject(new Error("upload failed"));
    x.send(fd);
  });
}

/** Live job progress over Server-Sent Events, with polling fallback. */
export function watchJob(jobId, onUpdate) {
  let closed = false;
  let es;
  const poll = async () => {
    while (!closed) {
      try {
        const j = await api.get(`/api/jobs/${jobId}`);
        onUpdate(j);
        if (j.status === "done" || j.status === "failed") return;
      } catch {}
      await new Promise((r) => setTimeout(r, 1200));
    }
  };
  if (window.EventSource) {
    es = new EventSource(`/api/jobs/${jobId}/events`);
    es.onmessage = (e) => {
      const j = JSON.parse(e.data);
      onUpdate(j);
      if (j.status === "done" || j.status === "failed") es.close();
    };
    es.onerror = () => {
      es.close();
      poll();
    };
  } else poll();
  return () => {
    closed = true;
    es && es.close();
  };
}

export const waitJob = (jobId, onUpdate = () => {}) =>
  new Promise((resolve) => {
    const stop = watchJob(jobId, (j) => {
      onUpdate(j);
      if (j.status === "done" || j.status === "failed") {
        stop();
        resolve(j);
      }
    });
  });
