import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, uploadFiles, waitJob, watchJob } from "./api.js";

const PLATFORMS = { tiktok: "TikTok", reels: "Reels", shorts: "Shorts", facebook: "Facebook", youtube: "YouTube", linkedin: "LinkedIn" };
const NICHES = { fitness: "כושר", realestate: "נדל״ן", food: "אוכל", business: "עסקים" };
const VARIANT_NAMES = { main: "גרסה ראשית", hook_b: "Hook חלופי", short: "קצרה וקצבית", viral: "ויראלי", cinematic: "קולנועי", premium: "פרימיום" };
const STYLES = [
  ["viral", "ויראלי", "מהיר, hook חזק, הרבה תנועה"],
  ["cinematic", "קולנועי", "אלגנטי, שוטים ארוכים, מינימום אפקטים"],
  ["premium", "פרימיום", "נקי ויוקרתי, תנועה מבוקרת"],
];
const DURATIONS = [[15, "15 שנ׳"], [30, "30 שנ׳"], [60, "60 שנ׳"], [null, "אוטומטי"]];
const BREAKDOWN = { hook: "Hook", story: "סיפור", pacing: "קצב", visuals: "ויזואליה", audio: "סאונד", captions: "כתוביות", brand: "מותג" };

export default function App() {
  const initial = new URLSearchParams(location.search).get("job") ? "create" : "projects";
  const [tab, setTab] = useState(initial);
  const [health, setHealth] = useState(null);
  useEffect(() => {
    api.get("/api/health").then(setHealth).catch(() => {});
  }, []);
  return (
    <div className="app">
      <header className="top">
        <div className="logo">
          <span className="logo-mark">▶</span> AutoEdit
        </div>
        <nav>
          {[
            ["projects", "הפרויקטים שלי"],
            ["create", "סרטון חדש"],
            ["learn", "למידה"],
            ["brand", "המותג שלי"],
            ["settings", "הגדרות"],
          ].map(([k, l]) => (
            <button key={k} className={tab === k ? "tab on" : "tab"} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {tab === "projects" && <Projects onNew={() => setTab("create")} onOpen={(id) => (history.replaceState(null, "", `?job=${id}`), setTab("create"))} />}
        {tab === "create" && <Create key={location.search} health={health} />}
        {tab === "learn" && <Learn health={health} />}
        {tab === "brand" && <Brand />}
        {tab === "settings" && <Settings health={health} />}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ create */
function Create({ health }) {
  const [files, setFiles] = useState([]);
  const [brief, setBrief] = useState("");
  const [stage, setStage] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [narration, setNarration] = useState("auto");
  const [style, setStyle] = useState("viral");
  const [duration, setDuration] = useState(30);
  const [platform, setPlatform] = useState("reels");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef();
  const dirRef = useRef();

  const follow = async (job_id) => {
    setStage("work");
    const j = await waitJob(job_id, (j) => {
      setProgress(j.progress || 0);
      setMessage(j.message || "");
    });
    if (j.status === "failed") throw new Error(j.error || "משהו השתבש. נסו שוב.");
    setResult({ ...j.result, job_id });
    setStage("done");
  };

  // refresh-safe: a running or finished job is reopened from the URL (?job=...)
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("job");
    if (id) follow(id).catch((e) => (setError(String(e.message || e)), setStage("idle")));
  }, []);

  const addFiles = (list) => setFiles((f) => [...f, ...Array.from(list).filter((x) => /^(image|video|audio)\//.test(x.type) || /\.(heic|heif|mov|mkv|3gp)$/i.test(x.name))]);

  const onDrop = async (e) => {
    e.preventDefault();
    setDrag(false);
    const items = e.dataTransfer.items;
    if (items && items[0]?.webkitGetAsEntry) {
      const out = [];
      const walk = (entry) =>
        new Promise((res) => {
          if (entry.isFile) entry.file((f) => (out.push(f), res()));
          else if (entry.isDirectory) entry.createReader().readEntries(async (es) => (await Promise.all(es.map(walk)), res()));
          else res();
        });
      await Promise.all(Array.from(items).map((i) => i.webkitGetAsEntry()).filter(Boolean).map(walk));
      addFiles(out);
    } else addFiles(e.dataTransfer.files);
  };

  const create = async () => {
    setError("");
    setResult(null);
    try {
      setStage("upload");
      const up = await uploadFiles(files, (p) => {
        setProgress(p);
        setMessage("מעלה קבצים");
      });
      setStage("work");
      setProgress(0);
      const { job_id } = await api.post("/api/create", { batch: up.batch, brief, narration, style, target_seconds: duration, platform });
      history.replaceState(null, "", `?job=${job_id}`);
      await follow(job_id);
    } catch (e) {
      setError(String(e.message || e));
      setStage("idle");
    }
  };

  if (stage === "done" && result)
    return <Results result={result} onNew={() => (history.replaceState(null, "", "/"), setStage("idle"), setFiles([]), setResult(null))} />;

  const busy = stage === "upload" || stage === "work";
  const counts = files.reduce((a, f) => ((a[f.type.split("/")[0] || "other"] = (a[f.type.split("/")[0] || "other"] || 0) + 1), a), {});
  return (
    <section className="create">
      <h1>מעלים חומר. AutoEdit עורך.</h1>
      <div
        className={`drop ${drag ? "drag" : ""} ${files.length ? "has" : ""}`}
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => !busy && fileRef.current.click()}
      >
        <input ref={fileRef} type="file" multiple accept="image/*,video/*,audio/*,.heic,.heif,.mov" hidden onChange={(e) => addFiles(e.target.files)} />
        <input ref={dirRef} type="file" webkitdirectory="" directory="" multiple hidden onChange={(e) => addFiles(e.target.files)} />
        <div className="drop-icon">⬆</div>
        {files.length ? (
          <div>
            <b>{files.length} קבצים מוכנים</b>
            <div className="muted">
              {counts.video ? `${counts.video} סרטונים · ` : ""}
              {counts.image ? `${counts.image} תמונות · ` : ""}
              {counts.audio ? `${counts.audio} הקלטות` : ""}
            </div>
          </div>
        ) : (
          <div>
            <b>גררו לכאן תיקייה או קבצים</b>
            <div className="muted">תמונות (גם HEIC מאייפון), סרטונים והקלטות קול · או לחצו לבחירה מהגלריה</div>
          </div>
        )}
        <button className="link" onClick={(e) => (e.stopPropagation(), dirRef.current.click())} disabled={busy}>
          בחירת תיקייה שלמה
        </button>
      </div>
      <input className="brief" placeholder='מה המטרה? (לא חובה) למשל "סרטון למכירת דירה, אנרגטי"' value={brief} onChange={(e) => setBrief(e.target.value)} disabled={busy} />
      <div className="choices">
        <div className="choice-row">
          <span className="choice-label">סגנון</span>
          {STYLES.map(([k, l, d]) => (
            <button key={k} className={`chip ${style === k ? "on" : ""}`} title={d} onClick={() => setStyle(k)} disabled={busy}>
              {l}
            </button>
          ))}
        </div>
        <div className="choice-row">
          <span className="choice-label">אורך</span>
          {DURATIONS.map(([v, l]) => (
            <button key={l} className={`chip ${duration === v ? "on" : ""}`} onClick={() => setDuration(v)} disabled={busy}>
              {l}
            </button>
          ))}
        </div>
        <div className="choice-row">
          <span className="choice-label">איפה יפורסם</span>
          {["reels", "tiktok", "shorts", "facebook", "youtube"].map((p) => (
            <button key={p} className={`chip ${platform === p ? "on" : ""}`} onClick={() => setPlatform(p)} disabled={busy}>
              {PLATFORMS[p]}
            </button>
          ))}
        </div>
      </div>
      <details className="adv">
        <summary>אפשרויות נוספות</summary>
        <label>
          קריינות:
          <select value={narration} onChange={(e) => setNarration(e.target.value)}>
            <option value="auto">אוטומטי</option>
            <option value="on">תמיד</option>
            <option value="off">בלי</option>
          </select>
        </label>
      </details>
      <button className="cta" disabled={!files.length || busy} onClick={create}>
        {busy ? "עובד על זה…" : "צור"}
      </button>
      {busy && <Progress value={progress} label={message} />}
      {error && <div className="error">{error}</div>}
      {health && !health.keys?.ANTHROPIC_API_KEY && <div className="hint">טיפ: עם מפתח Claude, הבמאי והמבקר מבינים את הסיפור לעומק. מגדירים אותו בלשונית "הגדרות".</div>}
    </section>
  );
}

function Progress({ value, label }) {
  return (
    <div className="progress">
      <div className="bar">
        <div style={{ width: `${Math.round((value || 0) * 100)}%` }} />
      </div>
      <div className="muted">
        {Math.round((value || 0) * 100)}% · {label}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ results */
function Results({ result, onNew }) {
  const [sel, setSel] = useState(0);
  const versions = result.versions || [];
  const v = versions[sel];
  const k = v ? v.k || Number(v.dir.split("/v").pop()) : 1;
  const [videoUrl, setVideoUrl] = useState(null);
  useEffect(() => setVideoUrl(null), [sel]);
  return (
    <section className="results">
      <div className="row between">
        <h2>3 גרסאות לבחירה</h2>
        <button className="ghost" onClick={onNew}>
          + סרטון חדש
        </button>
      </div>
      <div className="concept muted">
        נישה: {NICHES[result.concept?.niche] || result.concept?.niche} · אווירה: {{ energetic: "אנרגטית", calm: "רגועה", luxury: "יוקרתית", emotional: "מרגשת", fun: "כיפית" }[result.concept?.mood] || result.concept?.mood} · {result.items} פריטי חומר · {Math.round(result.elapsed_sec)} שניות
      </div>
      <div className="versions">
        {versions.map((x, i) => (
          <div key={i} className={`vcard ${i === sel ? "sel" : ""}`} onClick={() => setSel(i)}>
            <video src={(i === sel && videoUrl) || x.video_url || x.preview_url} controls playsInline preload="metadata" />
            <div className="vmeta">
              <b>{VARIANT_NAMES[x.variant] || x.variant}</b>
              <Score value={x.score} />
            </div>
            {i === 0 && <div className="badge">מומלצת</div>}
            {x.duration ? <div className="muted small">{x.duration} שניות</div> : null}
          </div>
        ))}
      </div>
      {v && <Workbench key={`${result.job_id}-${k}`} jobId={result.job_id} k={k} onVideo={setVideoUrl} result={result} version={v} />}
    </section>
  );
}

function Score({ value }) {
  const c = value >= 90 ? "good" : value >= 75 ? "ok" : "bad";
  return <span className={`score ${c}`}>{value}</span>;
}

function ScorePanel({ info, onImprove, onUndo, onRedo, busy }) {
  if (!info) return null;
  const b = info.breakdown || {};
  return (
    <div className="panel scorepanel">
      <div className="row between">
        <h3>
          ציון הסרטון <Score value={info.score} />
        </h3>
        <div className="row">
          <button className="mini" onClick={onUndo} disabled={busy || !info.history?.can_undo} title="בטל שינוי אחרון">
            ↶ בטל
          </button>
          <button className="mini" onClick={onRedo} disabled={busy || !info.history?.can_redo} title="בצע שוב">
            ↷ שוב
          </button>
        </div>
      </div>
      <div className="breakdown">
        {Object.entries(b).map(([k, v]) => (
          <div key={k} className="bd">
            <span>{BREAKDOWN[k] || k}</span>
            <span className="b">
              <span style={{ width: `${v}%` }} className={v >= 90 ? "up" : v >= 75 ? "mid" : "down"} />
            </span>
            <b>{v}</b>
          </div>
        ))}
      </div>
      {info.explain?.length > 0 && (
        <>
          <h4>מה עשיתי</h4>
          <ul className="explain">{info.explain.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </>
      )}
      <button className="ghost" onClick={onImprove} disabled={busy}>
        ✨ שפר אוטומטית
      </button>
    </div>
  );
}

function Workbench({ jobId, k, onVideo, result, version }) {
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState({ score: version?.score, breakdown: version?.breakdown, explain: version?.explain });
  const refreshInfo = () => api.get(`/api/versions/${jobId}/${k}/history`).then(setInfo).catch(() => {});
  useEffect(() => {
    refreshInfo();
  }, [jobId, k]);
  const videoOf = (r) => r.video_url || (r.video ? `/files/${r.video.split("/workspace/").pop()}` : null);
  const [prog, setProg] = useState(0);
  const [chat, setChat] = useState([]);
  const [msg, setMsg] = useState("");
  const [manual, setManual] = useState(false);
  const run = async (jobPromise, onDone) => {
    setBusy(true);
    try {
      const { job_id, reply } = await jobPromise;
      if (reply) setChat((c) => [...c, { who: "ai", text: reply }]);
      if (job_id) {
        const j = await waitJob(job_id, (j) => setProg(j.progress || 0));
        if (j.status === "done") onDone?.(j.result);
        else setChat((c) => [...c, { who: "ai", text: j.error || "משהו השתבש. נסו שוב." }]);
      }
    } finally {
      setBusy(false);
    }
  };
  const send = () => {
    if (!msg.trim()) return;
    setChat((c) => [...c, { who: "me", text: msg }]);
    const m = msg;
    setMsg("");
    run(api.post(`/api/versions/${jobId}/${k}/chat`, { message: m }), (r) => {
      onVideo(r.video_url || `/files/${r.video.split("/workspace/").pop()}`);
      if (r.critic) setChat((c) => [...c, { who: "ai", text: `עודכן. ציון: ${r.critic.score}` }]);
      refreshInfo();
    });
  };
  const undo = (dir) =>
    run(api.post(`/api/versions/${jobId}/${k}/${dir}`), (r) => {
      onVideo(videoOf(r));
      refreshInfo();
    });
  const improve = () =>
    run(api.post(`/api/versions/${jobId}/${k}/improve`), (r) => {
      onVideo(videoOf(r));
      setChat((c) => [...c, { who: "ai", text: `שיפרתי: ${r.score_before} ← ${r.score}` }]);
      refreshInfo();
    });
  return (
    <div className="workbench">
      <div className="col">
      <ScorePanel info={info} onImprove={improve} onUndo={() => undo("undo")} onRedo={() => undo("redo")} busy={busy} />
      <div className="panel chat">
        <h3>בקשו מה-AI לשנות</h3>
        <div className="msgs">
          {chat.length === 0 && <div className="muted">למשל: "תקצר את ההתחלה", "מוזיקה יותר שקטה", "יותר מהיר", "תוסיף כתובית בשנייה 12: מבצע!"</div>}
          {chat.map((c, i) => (
            <div key={i} className={`msg ${c.who}`}>
              {c.text}
            </div>
          ))}
        </div>
        {busy && <Progress value={prog} label="מרנדר מחדש" />}
        <div className="row">
          <input value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="מה לשנות?" disabled={busy} />
          <button onClick={send} disabled={busy}>
            שלח
          </button>
        </div>
        <button className="link" onClick={() => setManual((m) => !m)}>
          {manual ? "הסתר מצב מתקדם" : "מצב מתקדם (Pro)"}
        </button>
        {manual && <Timeline jobId={jobId} k={k} onRendered={onVideo} run={run} busy={busy} />}
      </div>
      </div>
      <Export jobId={jobId} k={k} result={result} run={run} busy={busy} />
    </div>
  );
}

function Timeline({ jobId, k, onRendered, run, busy }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get(`/api/versions/${jobId}/${k}/plan`).then(setData);
  }, [jobId, k]);
  if (!data) return <div className="muted">טוען…</div>;
  const plan = data.plan;
  const total = data.timeline.length ? data.timeline[data.timeline.length - 1].t1 : 1;
  const save = () =>
    run(api.put(`/api/versions/${jobId}/${k}/plan`, { plan }), (r) => {
      onRendered(r.video_url || `/files/${r.video.split("/workspace/").pop()}`);
      api.get(`/api/versions/${jobId}/${k}/plan`).then(setData);
    });
  const setClip = (i, field, val) => {
    plan.clips[i][field] = Math.max(0, Number(val));
    setData({ ...data });
  };
  const del = (i) => {
    plan.clips.splice(i, 1);
    plan.transitions = (plan.transitions || []).filter((t) => t.after_clip !== i).map((t) => ({ ...t, after_clip: t.after_clip > i ? t.after_clip - 1 : t.after_clip }));
    data.timeline.splice(i, 1);
    setData({ ...data });
  };
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= plan.clips.length) return;
    [plan.clips[i], plan.clips[j]] = [plan.clips[j], plan.clips[i]];
    [data.timeline[i], data.timeline[j]] = [data.timeline[j], data.timeline[i]];
    setData({ ...data });
  };
  const editWord = (i, text) => {
    const w = plan.words.find((w) => w.i === i);
    if (w) w.text = text;
    setData({ ...data });
  };
  return (
    <div className="timeline">
      <div className="tl-bar">
        {data.timeline.map((c, i) => (
          <div key={i} className={`tl-clip ${c.role}`} style={{ width: `${((c.t1 - c.t0) / total) * 100}%` }} title={c.name}>
            {i + 1}
          </div>
        ))}
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>מקור</th>
            <th>התחלה</th>
            <th>סוף</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {plan.clips.map((c, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td className="ellip">{data.timeline[i]?.name}</td>
              <td>
                <input type="number" step="0.1" value={Number(c.in).toFixed(2)} onChange={(e) => setClip(i, "in", e.target.value)} />
              </td>
              <td>
                <input type="number" step="0.1" value={Number(c.out).toFixed(2)} onChange={(e) => setClip(i, "out", e.target.value)} />
              </td>
              <td className="nowrap">
                <button className="mini" onClick={() => move(i, -1)}>▲</button>
                <button className="mini" onClick={() => move(i, 1)}>▼</button>
                <button className="mini danger" onClick={() => del(i)}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.words.length > 0 && (
        <>
          <h4>כתוביות</h4>
          <div className="words">
            {data.words.map((w) => (
              <input key={w.i} className={w.emph ? "emph" : ""} value={plan.words.find((x) => x.i === w.i)?.text ?? w.text} onChange={(e) => editWord(w.i, e.target.value)} />
            ))}
          </div>
        </>
      )}
      <button className="cta small" onClick={save} disabled={busy}>
        שמור ורנדר
      </button>
    </div>
  );
}

function Export({ jobId, k, result, run, busy }) {
  const [plats, setPlats] = useState({ tiktok: true, reels: true, shorts: true, facebook: false, youtube: false, linkedin: false });
  const [codec, setCodec] = useState("h264");
  const [files, setFiles] = useState([]);
  const [postUrl, setPostUrl] = useState("");
  const [posted, setPosted] = useState(false);
  const meta = result.metadata || {};
  const exp = () =>
    run(api.post(`/api/versions/${jobId}/${k}/export`, { platforms: Object.keys(plats).filter((p) => plats[p]), codec }), (r) => setFiles(r.files || []));
  const publish = async () => {
    await api.post(`/api/versions/${jobId}/${k}/publish`, { url: postUrl });
    setPosted(true);
  };
  return (
    <div className="panel export">
      <h3>ייצוא</h3>
      <div className="chips">
        {Object.entries(PLATFORMS).map(([p, l]) => (
          <label key={p} className={`chip ${plats[p] ? "on" : ""}`}>
            <input type="checkbox" checked={plats[p]} onChange={(e) => setPlats({ ...plats, [p]: e.target.checked })} /> {l}
          </label>
        ))}
      </div>
      <div className="row">
        <select value={codec} onChange={(e) => setCodec(e.target.value)}>
          <option value="h264">H.264 (תאימות מלאה)</option>
          <option value="h265">H.265 (קובץ קטן יותר)</option>
        </select>
        <button className="cta small" onClick={exp} disabled={busy}>
          אשר וייצא באיכות מלאה
        </button>
      </div>
      {files.length > 0 && (
        <ul className="files">
          {files.map((f) => (
            <li key={f.platform}>
              <a href={f.url} download>
                ⬇ {PLATFORMS[f.platform]} ({f.aspect}, {f.duration}s)
              </a>
            </li>
          ))}
        </ul>
      )}
      {result.thumbnail_urls?.length > 0 && (
        <>
          <h4>תמונות ממוזערות</h4>
          <div className="thumbs">
            {result.thumbnail_urls.map((t) => (
              <a key={t} href={t} download>
                <img src={t} alt="" />
              </a>
            ))}
          </div>
        </>
      )}
      <h4>כותרת, תיאור והאשטגים</h4>
      {Object.entries(meta).map(([p, m]) => (
        <details key={p} className="meta">
          <summary>{PLATFORMS[p] || p}</summary>
          <Copy text={`${m.title}\n\n${m.description}\n\n${(m.hashtags || []).join(" ")}`} />
        </details>
      ))}
      <h4>פרסמתי</h4>
      {posted ? (
        <div className="ok">נרשם. המערכת תמשוך ביצועים אחרי 24 שעות, 72 שעות ו-7 ימים, ותלמד מהם.</div>
      ) : (
        <div className="row">
          <input placeholder="קישור לסרטון שפורסם" value={postUrl} onChange={(e) => setPostUrl(e.target.value)} />
          <button onClick={publish} disabled={!postUrl}>
            הוסף
          </button>
        </div>
      )}
    </div>
  );
}

function Copy({ text }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="copy">
      <pre>{text}</pre>
      <button className="mini" onClick={() => navigator.clipboard.writeText(text).then(() => setOk(true))}>
        {ok ? "הועתק ✓" : "העתק"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ learning dashboard */
function Learn({ health }) {
  const [niche, setNiche] = useState("fitness");
  const [d, setD] = useState(null);
  const [job, setJob] = useState(null);
  const [post, setPost] = useState("");
  const load = () => api.get(`/api/learn/overview?niche=${niche}`).then(setD);
  useEffect(() => {
    setD(null);
    load();
  }, [niche]);
  const runNow = async () => {
    const { job_id } = await api.post("/api/learn/run", { niche, scout: true });
    setJob({ progress: 0, message: "מתחיל" });
    const j = await waitJob(job_id, setJob);
    setJob(j.status === "failed" ? { message: "נכשל: " + j.error } : null);
    load();
  };
  const addPost = async () => {
    await api.post("/api/learn/posts", { url: post, niche });
    setPost("");
    load();
  };
  const rollback = async (version) => {
    await api.post("/api/learn/rollback", { niche, version });
    load();
  };
  const niches = health?.niches || Object.keys(NICHES);
  return (
    <section className="learn">
      <div className="row between">
        <h2>מנוע הלמידה</h2>
        <div className="row">
          <select value={niche} onChange={(e) => setNiche(e.target.value)}>
            {niches.map((n) => (
              <option key={n} value={n}>
                {NICHES[n] || n}
              </option>
            ))}
          </select>
          <button className="cta small" onClick={runNow} disabled={!!job}>
            הרץ למידה עכשיו
          </button>
        </div>
      </div>
      {job && <Progress value={job.progress} label={job.message} />}
      {!d ? (
        <div className="muted">טוען…</div>
      ) : (
        <div className="grid">
          <div className="panel">
            <h3>טרנדים עולים: השבוע מול החודש שעבר</h3>
            <Trends t={d.trends} />
          </div>
          <div className="panel">
            <h3>מה הכי משפיע על הצלחה</h3>
            {d.importances.length ? <Bars items={d.importances} /> : <div className="muted">אין עדיין מודל מאומן. הריצו למידה.</div>}
            {d.learned?.differences_he?.length > 0 && (
              <ul className="insights">{d.learned.differences_he.map((x, i) => <li key={i}>{x}</li>)}</ul>
            )}
          </div>
          <div className="panel wide">
            <h3>10 הסרטונים המצליחים האחרונים</h3>
            <table className="top">
              <tbody>
                {d.top.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <a href={v.url} target="_blank" rel="noreferrer">
                        {v.title || v.id}
                      </a>
                      <div className="muted small">{v.why}</div>
                    </td>
                    <td className="nowrap">{fmt(v.views)} צפיות</td>
                    <td className="nowrap">ER {(v.metrics.engagement * 100).toFixed(1)}%</td>
                    <td className="nowrap">פי {v.metrics.views_per_follower ? v.metrics.views_per_follower.toFixed(1) : "–"} מהעוקבים</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!d.top.length && <div className="muted">עוד לא נמצאו סרטונים. הוסיפו מפתח YouTube בהגדרות והריצו למידה.</div>}
          </div>
          <div className="panel">
            <h3>גרסאות פרופיל ודיוק המודל</h3>
            <Line points={d.model_runs.map((r) => r.auc)} base={d.model_runs.map((r) => r.baseline_auc)} />
            <table>
              <tbody>
                {d.versions
                  .slice()
                  .reverse()
                  .map((v) => (
                    <tr key={v.version} className={v.active ? "active" : ""}>
                      <td>{v.version}</td>
                      <td>AUC {v.metrics?.auc?.toFixed?.(3) ?? "–"}</td>
                      <td className="muted small">{v.note}</td>
                      <td>{v.active ? <b>פעילה</b> : <button className="mini" onClick={() => rollback(v.version)}>הפעל</button>}</td>
                    </tr>
                  ))}
                <tr>
                  <td>default</td>
                  <td />
                  <td className="muted small">פרופיל התחלתי</td>
                  <td>{!d.active_version ? <b>פעילה</b> : <button className="mini" onClick={() => rollback(null)}>חזור</button>}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="panel">
            <h3>הביצועים של הסרטונים שלי</h3>
            <MyPosts rows={d.my_posts} />
            <div className="row">
              <input placeholder="קישור לסרטון שפרסמתי" value={post} onChange={(e) => setPost(e.target.value)} />
              <button onClick={addPost} disabled={!post}>
                הוסף
              </button>
            </div>
          </div>
          <div className="panel wide">
            <h3>יומן ריצות</h3>
            <table className="runs">
              <tbody>
                {d.runs.map((r) => (
                  <tr key={r.id}>
                    <td>{r.kind}</td>
                    <td>{r.niche}</td>
                    <td className="muted small">{r.started?.replace("T", " ").slice(0, 16)}</td>
                    <td className={r.status === "ok" ? "good" : "bad"}>{r.status}</td>
                    <td className="muted small ellip">{(JSON.parse(r.errors || "[]")[0] || "").slice(0, 90)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(0) + "K" : n ?? "–");

function Trends({ t }) {
  const rows = [
    ["avg_shot_sec", "אורך שוט (שנ׳)"],
    ["duration", "אורך סרטון (שנ׳)"],
    ["music_bpm", "BPM מוזיקה"],
    ["caption_presence", "כתוביות"],
    ["punch_in_per_min", "זומים לדקה"],
  ];
  if (!t.week.n && !t.month.n) return <div className="muted">אין מספיק נתונים עדיין.</div>;
  return (
    <>
      <table>
        <thead>
          <tr>
            <th />
            <th>השבוע ({t.week.n || 0})</th>
            <th>החודש שעבר ({t.month.n || 0})</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, l]) => (
            <tr key={k}>
              <td>{l}</td>
              <td>{t.week[k] ?? "–"}</td>
              <td>{t.month[k] ?? "–"}</td>
            </tr>
          ))}
          <tr>
            <td>Hooks</td>
            <td className="small">{Object.keys(t.week.hooks || {}).join(", ") || "–"}</td>
            <td className="small">{Object.keys(t.month.hooks || {}).join(", ") || "–"}</td>
          </tr>
        </tbody>
      </table>
      {t.week.topics?.length > 0 && <div className="muted small">נושאים חמים: {t.week.topics.join(" · ")}</div>}
    </>
  );
}

function Bars({ items }) {
  const max = Math.max(...items.map((i) => i.importance), 0.001);
  return (
    <div className="bars">
      {items.map((i) => (
        <div key={i.feature} className="barrow">
          <span className="lbl">{i.label}</span>
          <span className="b">
            <span style={{ width: `${(i.importance / max) * 100}%` }} className={i.direction === "higher" ? "up" : "down"} />
          </span>
          <span className="dir">{i.direction === "higher" ? "▲ יותר" : i.direction === "lower" ? "▼ פחות" : ""}</span>
        </div>
      ))}
    </div>
  );
}

function Line({ points, base }) {
  if (!points.length) return <div className="muted">עוד אין היסטוריית אימונים.</div>;
  const W = 320,
    H = 110,
    pad = 18;
  const xs = (i) => pad + (i * (W - 2 * pad)) / Math.max(1, points.length - 1);
  const ys = (v) => H - pad - ((v - 0.4) / 0.6) * (H - 2 * pad);
  const path = (arr) =>
    arr
      .map((v, i) => (v == null ? null : `${xs(i)},${ys(v)}`))
      .filter(Boolean)
      .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="line">
      <line x1={pad} x2={W - pad} y1={ys(0.5)} y2={ys(0.5)} className="grid" />
      <polyline points={path(base)} className="base" />
      <polyline points={path(points)} className="main" />
      {points.map((v, i) => (
        <circle key={i} cx={xs(i)} cy={ys(v)} r="3.5" />
      ))}
      <text x={W - pad} y={ys(0.5) - 4} className="t">
        מקרי (0.5)
      </text>
    </svg>
  );
}

function MyPosts({ rows }) {
  const posts = useMemo(() => {
    const m = {};
    for (const r of rows) {
      m[r.id] = m[r.id] || { url: r.url, platform: r.platform, variant: r.variant, cps: {} };
      if (r.checkpoint) m[r.id].cps[r.checkpoint] = r.views;
    }
    return Object.values(m);
  }, [rows]);
  if (!posts.length) return <div className="muted">עוד לא נרשמו סרטונים שפרסמתם.</div>;
  return (
    <table>
      <thead>
        <tr>
          <th>סרטון</th>
          <th>24h</th>
          <th>72h</th>
          <th>7d</th>
        </tr>
      </thead>
      <tbody>
        {posts.map((p) => (
          <tr key={p.url}>
            <td className="ellip">
              <a href={p.url} target="_blank" rel="noreferrer">
                {p.platform} {p.variant ? `(${p.variant})` : ""}
              </a>
            </td>
            <td>{fmt(p.cps["24h"])}</td>
            <td>{fmt(p.cps["72h"])}</td>
            <td>{fmt(p.cps["168h"])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------------ brand */
function Brand() {
  const [b, setB] = useState(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    api.get("/api/brand").then(setB);
  }, []);
  if (!b) return <div className="muted">טוען…</div>;
  const set = (k, v) => (setB({ ...b, [k]: v }), setSaved(false));
  const save = async () => {
    await api.put("/api/brand", b);
    setSaved(true);
  };
  const upload = async (kind, file) => {
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("file", file);
    await api.post("/api/brand/asset", fd);
    setB(await api.get("/api/brand"));
  };
  return (
    <section className="brand panel">
      <h2>המותג שלי</h2>
      <p className="muted">מגדירים פעם אחת, וזה מוחל אוטומטית על כל סרטון.</p>
      <div className="form">
        <label>
          שם המותג<input value={b.name || ""} onChange={(e) => set("name", e.target.value)} />
        </label>
        <label>
          שם משתמש (@)<input value={b.handle || ""} onChange={(e) => set("handle", e.target.value)} />
        </label>
        <label>
          צבע ראשי<input type="color" value={b.primary_color || "#7b2ff7"} onChange={(e) => set("primary_color", e.target.value)} />
        </label>
        <label>
          צבע הדגשה<input type="color" value={b.accent_color || "#ffe14d"} onChange={(e) => set("accent_color", e.target.value)} />
        </label>
        <label>
          סגנון כתוביות
          <select value={b.caption_preset || "auto"} onChange={(e) => set("caption_preset", e.target.value)}>
            {b.presets.map((p) => (
              <option key={p} value={p}>
                {{ auto: "לפי הנישה", bold_pop: "Bold Pop", clean_box: "Clean Box", minimal: "מינימלי", rounded_fun: "עגול וכיפי" }[p] || p}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={!!b.watermark} onChange={(e) => set("watermark", e.target.checked)} /> לוגו קטן בפינה
        </label>
        <FileField label="לוגו (PNG שקוף)" accept="image/*" onFile={(f) => upload("logo", f)} current={b.logo_url} image />
        <FileField label="פתיח (עד 1.5 שנ׳, מוצג אחרי ה-hook)" accept="video/*" onFile={(f) => upload("intro", f)} current={b.intro} />
        <FileField label="סגיר" accept="video/*" onFile={(f) => upload("outro", f)} current={b.outro} />
        <FileField label="פונט כתוביות (TTF)" accept=".ttf,.otf" onFile={(f) => upload("caption_font", f)} current={b.caption_font} />
        <FileField label="פונט כותרות (TTF)" accept=".ttf,.otf" onFile={(f) => upload("title_font", f)} current={b.title_font} />
        <FileField label="דגימת קול לשכפול (ElevenLabs)" accept="audio/*" onFile={(f) => upload("voice_sample", f)} />
      </div>
      {Object.keys(b.preferences || {}).length > 0 && (
        <div className="muted small">העדפות שנלמדו מהצ׳אט: {JSON.stringify(b.preferences)}</div>
      )}
      <button className="cta small" onClick={save}>
        {saved ? "נשמר ✓" : "שמור"}
      </button>
    </section>
  );
}

function FileField({ label, accept, onFile, current, image }) {
  return (
    <label className="file">
      {label}
      <input type="file" accept={accept} onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
      {current && (image ? <img src={current} alt="" className="logo-prev" /> : <span className="muted small">✓ הוגדר</span>)}
    </label>
  );
}

/* ------------------------------------------------------------------ projects */
function Projects({ onNew, onOpen }) {
  const [list, setList] = useState(null);
  const load = () => api.get("/api/projects").then(setList).catch(() => setList([]));
  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);
  if (!list) return <div className="muted">טוען…</div>;
  const resume = list.find((p) => p.status === "interrupted");
  const remove = async (p) => {
    if (p._confirm) {
      await api.del(`/api/projects/${p.id}`);
      load();
    } else setList(list.map((x) => (x.id === p.id ? { ...x, _confirm: true } : x)));
  };
  const retry = async (p) => {
    await api.post(`/api/projects/${p.id}/retry`);
    onOpen(p.id);
  };
  return (
    <section className="projects">
      <div className="row between">
        <h2>הפרויקטים שלי</h2>
        <button className="cta small" onClick={onNew}>
          + סרטון חדש
        </button>
      </div>
      {resume && (
        <div className="panel resume">
          <b>העבודה על "{resume.name}" הופסקה.</b> להמשיך מאיפה שהפסקת?
          <button className="ghost" onClick={() => retry(resume)}>
            המשך
          </button>
        </div>
      )}
      {list.length === 0 ? (
        <div className="empty panel">
          <div className="drop-icon">▶</div>
          <h3>עוד אין פרויקטים</h3>
          <p className="muted">מעלים תמונות או סרטונים, ו-AutoEdit עורך אותם לסרטון מוכן לפרסום.</p>
          <button className="cta small" onClick={onNew}>
            צרו את הסרטון הראשון
          </button>
        </div>
      ) : (
        <div className="pgrid">
          {list.map((p) => (
            <div key={p.id} className="pcard">
              <div className="pthumb" onClick={() => (p.status === "ready" || p.status === "exported" || p.status === "working" || p.status === "queued") && onOpen(p.id)}>
                {p.thumbnail_url ? <img src={p.thumbnail_url} alt="" /> : <div className="ph">▶</div>}
                {(p.status === "working" || p.status === "queued") && (
                  <div className="pprog">
                    <div className="bar">
                      <div style={{ width: `${Math.round((p.progress || 0) * 100)}%` }} />
                    </div>
                  </div>
                )}
              </div>
              <div className="pmeta">
                <b className="ellip">{p.name}</b>
                <span className={`status s-${p.status}`}>{p.status_he}</span>
                <span className="muted small">
                  {p.duration ? `${p.duration} שנ׳ · ` : ""}
                  {PLATFORMS[p.platform] || ""} · {p.updated?.replace("T", " ").slice(5, 16)}
                </span>
                {p.status === "failed" && <span className="small bad">{p.error}</span>}
              </div>
              <div className="row">
                {(p.status === "failed" || p.status === "interrupted") && (
                  <button className="mini" onClick={() => retry(p)}>
                    נסה שוב
                  </button>
                )}
                <button className="mini danger" onClick={() => remove(p)}>
                  {p._confirm ? "למחוק לצמיתות?" : "מחיקה"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ settings */
function Services() {
  const [rows, setRows] = useState(null);
  const [vals, setVals] = useState({});
  const [tests, setTests] = useState({});
  const load = () => api.get("/api/settings/services").then(setRows);
  useEffect(() => {
    load();
  }, []);
  if (!rows) return null;
  const save = async (key) => {
    await api.put("/api/settings/services", { [key]: vals[key] || "" });
    setVals({ ...vals, [key]: "" });
    await load();
    setTests({ ...tests, [key]: { message: "בודק…" } });
    setTests({ ...tests, [key]: await api.post(`/api/settings/services/${key}/test`) });
  };
  return (
    <div className="panel">
      <h2>שירותי AI</h2>
      <p className="muted">
        הכול עובד גם בלי מפתחות, עם חלופות מקומיות. מפתח מוסיף יכולות. המפתחות נשמרים מוצפנים רק במחשב הזה, ולא מוצגים שוב.
      </p>
      <div className="services">
        {rows.map((r) => (
          <div key={r.key} className="svc">
            <div>
              <b>{r.name}</b> {r.configured ? <span className="good small">✓ מחובר</span> : <span className="muted small">לא מוגדר</span>}
              <div className="muted small">{r.what}</div>
              <div className="muted small">איפה משיגים: {r.where}</div>
            </div>
            <div className="row">
              <input type="password" autoComplete="off" placeholder={r.configured ? "הדביקו מפתח חדש להחלפה" : "הדביקו כאן את המפתח"}
                value={vals[r.key] || ""} onChange={(e) => setVals({ ...vals, [r.key]: e.target.value })} />
              <button onClick={() => save(r.key)} disabled={!vals[r.key]}>
                שמור ובדוק
              </button>
              {r.configured && (
                <button className="mini danger" onClick={() => api.put("/api/settings/services", { [r.key]: "" }).then(load)}>
                  הסר
                </button>
              )}
            </div>
            {tests[r.key] && <div className={`small ${tests[r.key].ok ? "good" : tests[r.key].ok === false ? "bad" : "muted"}`}>{tests[r.key].message}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Privacy() {
  const [p, setP] = useState(null);
  useEffect(() => {
    api.get("/api/privacy").then(setP).catch(() => {});
  }, []);
  if (!p) return null;
  return (
    <div className="panel">
      <h2>פרטיות</h2>
      <h4>מה נשמר</h4>
      <ul>{p.stored.map((x) => <li key={x}>{x}</li>)}</ul>
      <h4>איפה זה נשמר</h4>
      <p>
        רק במחשב שלך: <code>{p.storage_path}</code> ({p.disk_free_gb}GB פנויים)
      </p>
      <h4>מה נשלח ל-AI</h4>
      <p>{p.sent_to_ai}</p>
      <h4>איך מוחקים</h4>
      <p>{p.delete_how}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ settings */
function Settings({ health }) {
  const caps = health?.capabilities || {};
  const CAP_HE = { gpu: "כרטיס מסך (GPU)", realesrgan: "הגדלת איכות Real-ESRGAN", rife: "הילוך איטי RIFE", gfpgan: "שחזור פנים",
    depth_onnx: "עומק לתנועת תלת-ממד", deepfilternet: "ניקוי קול מתקדם", demucs: "הפרדת קול ממוזיקה", nvenc: "קידוד מהיר ב-GPU" };
  return (
    <section className="settings">
      <Services />
      <Privacy />
      <div className="panel">
        <h2>מצב המערכת</h2>
        <h4>מנועים מתקדמים במחשב הזה</h4>
        <p className="muted small">מה שלא זמין מוחלף אוטומטית בחלופה מקומית, והעריכה ממשיכה.</p>
        <div className="chips">
          {Object.entries(caps).map(([k, v]) => (
            <span key={k} className={`chip ${v ? "on" : ""}`}>
              {v ? "✓" : "–"} {CAP_HE[k] || k}
            </span>
          ))}
        </div>
        <h4>אוטומציה ברקע</h4>
        <ul>
          {(health?.scheduler || []).map((j) => (
            <li key={j.id}>
              {{ scout: "חיפוש סרטונים מצליחים", feedback: "משיכת ביצועים", learn: "למידה מחדש" }[j.id] || j.id}: הריצה הבאה {j.next_run?.slice(0, 16).replace("T", " ")}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
