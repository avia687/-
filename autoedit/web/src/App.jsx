import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, uploadFiles, waitJob, watchJob } from "./api.js";

const PLATFORMS = { tiktok: "TikTok", reels: "Reels", shorts: "Shorts", facebook: "Facebook", youtube: "YouTube", linkedin: "LinkedIn" };
const NICHES = { fitness: "כושר", realestate: "נדל״ן", food: "אוכל", business: "עסקים" };
const VARIANT_NAMES = { main: "גרסה ראשית", hook_b: "Hook חלופי", short: "קצרה וקצבית" };

export default function App() {
  const [tab, setTab] = useState("create");
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
            ["create", "יצירה"],
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
        {tab === "create" && <Create health={health} />}
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
  const [drag, setDrag] = useState(false);
  const fileRef = useRef();
  const dirRef = useRef();

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
      const { job_id } = await api.post("/api/create", { batch: up.batch, brief, narration });
      const j = await waitJob(job_id, (j) => {
        setProgress(j.progress || 0);
        setMessage(j.message || "");
      });
      if (j.status === "failed") throw new Error(j.error || "נכשל");
      setResult({ ...j.result, job_id });
      setStage("done");
    } catch (e) {
      setError(String(e.message || e));
      setStage("idle");
    }
  };

  if (stage === "done" && result) return <Results result={result} onNew={() => (setStage("idle"), setFiles([]), setResult(null))} />;

  const busy = stage === "upload" || stage === "work";
  const counts = files.reduce((a, f) => ((a[f.type.split("/")[0] || "other"] = (a[f.type.split("/")[0] || "other"] || 0) + 1), a), {});
  return (
    <section className="create">
      <h1>מהחומר הגולמי לסרטון מוכן. בשלושה צעדים.</h1>
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
      <input className="brief" placeholder='משפט אחד (לא חובה): למשל "סרטון למכירת דירה, אנרגטי"' value={brief} onChange={(e) => setBrief(e.target.value)} disabled={busy} />
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
  const k = v ? Number(v.dir.split("/v").pop()) : 1;
  const [videoUrl, setVideoUrl] = useState(null);
  useEffect(() => setVideoUrl(null), [sel]);
  return (
    <section className="results">
      <div className="row between">
        <h2>3 גרסאות מוכנות. בחרו אחת.</h2>
        <button className="ghost" onClick={onNew}>
          + סרטון חדש
        </button>
      </div>
      <div className="concept muted">
        נישה: {NICHES[result.concept?.niche] || result.concept?.niche} · מצב רוח: {result.concept?.mood} · {result.items} פריטי חומר · {Math.round(result.elapsed_sec)} שניות
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
            <ul className="notes">{(x.notes || []).slice(0, 2).map((n, j) => <li key={j}>{n}</li>)}</ul>
          </div>
        ))}
      </div>
      {v && <Workbench key={`${result.job_id}-${k}`} jobId={result.job_id} k={k} onVideo={setVideoUrl} result={result} />}
    </section>
  );
}

function Score({ value }) {
  const c = value >= 90 ? "good" : value >= 75 ? "ok" : "bad";
  return <span className={`score ${c}`}>{value}</span>;
}

function Workbench({ jobId, k, onVideo, result }) {
  const [busy, setBusy] = useState(false);
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
        else setChat((c) => [...c, { who: "ai", text: "שגיאה: " + j.error }]);
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
      if (r.critic) setChat((c) => [...c, { who: "ai", text: `עודכן. ציון המבקר: ${r.critic.score}` }]);
    });
  };
  return (
    <div className="workbench">
      <div className="panel chat">
        <h3>עריכה בצ׳אט</h3>
        <div className="msgs">
          {chat.length === 0 && <div className="muted">כתבו בשפה חופשית: "תקצר את ההתחלה", "מוזיקה יותר שקטה", "תוסיף כתובית בשנייה 12: מבצע!"</div>}
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
          {manual ? "הסתר שליטה ידנית" : "שליטה ידנית (timeline)"}
        </button>
        {manual && <Timeline jobId={jobId} k={k} onRendered={onVideo} run={run} busy={busy} />}
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
          ייצא
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

/* ------------------------------------------------------------------ settings */
function Settings({ health }) {
  const keys = health?.keys || {};
  const caps = health?.capabilities || {};
  const rows = [
    ["ANTHROPIC_API_KEY", "Claude: הבמאי, המבקר, הצ׳אט והכותרות", "console.anthropic.com → API Keys"],
    ["YOUTUBE_API_KEY", "חיפוש סרטונים מצליחים ב-YouTube ו-Shorts", "console.cloud.google.com → YouTube Data API v3 → Credentials"],
    ["PEXELS_API_KEY", "B-roll חינמי", "pexels.com/api"],
    ["PIXABAY_API_KEY", "B-roll חינמי (גיבוי)", "pixabay.com/api/docs"],
    ["ELEVENLABS_API_KEY", "קריינות טבעית ושכפול הקול שלך", "elevenlabs.io → Profile → API Keys"],
    ["METRICOOL_API_TOKEN", "תזמון פרסום (אופציונלי)", "Metricool → Account settings → API"],
  ];
  return (
    <section className="settings panel">
      <h2>הגדרות ומפתחות</h2>
      <p className="muted">
        המפתחות נשמרים בקובץ <code>.env</code> בתיקיית המערכת. בלי מפתחות הכול עדיין עובד, עם חלופות מקומיות. הסבר מלא צעד אחר צעד נמצא ב-README.
      </p>
      <table>
        <tbody>
          {rows.map(([k, what, where]) => (
            <tr key={k}>
              <td>{keys[k] ? "✅" : "⚪"}</td>
              <td>
                <code>{k}</code>
                <div className="muted small">{what}</div>
              </td>
              <td className="small">{where}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>חומרה ומודלים</h3>
      <div className="chips">
        {Object.entries(caps).map(([k, v]) => (
          <span key={k} className={`chip ${v ? "on" : ""}`}>
            {v ? "✓" : "–"} {k}
          </span>
        ))}
      </div>
      <h3>אוטומציה</h3>
      <ul>
        {(health?.scheduler || []).map((j) => (
          <li key={j.id}>
            {{ scout: "חיפוש סרטונים", feedback: "משיכת ביצועים", learn: "אימון מחדש" }[j.id] || j.id}: הריצה הבאה {j.next_run?.slice(0, 16)}
          </li>
        ))}
      </ul>
    </section>
  );
}
