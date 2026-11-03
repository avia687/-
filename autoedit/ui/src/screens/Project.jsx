import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useApp } from '../App.jsx';
import { api, fileUrl } from '../api.js';
import { enqueueUploads, subscribeUploads, uploadState } from '../uploads.js';
import { DropZone } from './Home.jsx';

const ACTIVE = ['queued', 'running'];
const fmt = (s) => (s == null ? '–' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);

export default function Project({ id }) {
  const { t, tx, jobs, onProjectChange, notify, state, go } = useApp();
  const [p, setP] = useState(null);
  const [, force] = useState(0);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    try { setP(await api.project(id)); } catch (e) { if (e.status === 404) setMissing(true); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => onProjectChange((pid) => { if (pid === id) load(); }), [id, load, onProjectChange]);
  useEffect(() => subscribeUploads(() => force((x) => x + 1)), []);

  const projectJobs = useMemo(() => Object.values(jobs).filter((j) => j.projectId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [jobs, id]);
  const activeMain = projectJobs.filter((j) => ['create', 'edit'].includes(j.type) && ACTIVE.includes(j.status)).at(-1);
  const lastMain = projectJobs.filter((j) => ['create', 'edit'].includes(j.type)).at(-1);
  const activeExport = projectJobs.filter((j) => j.type === 'export').at(-1);
  const analyzing = projectJobs.some((j) => j.type === 'analyze' && ACTIVE.includes(j.status));

  // Notify on completion of an edit/create job.
  const [seenDone, setSeenDone] = useState({});
  useEffect(() => {
    for (const j of projectJobs) {
      if (j.status === 'done' && ['edit'].includes(j.type) && !seenDone[j.id]) { setSeenDone((s) => ({ ...s, [j.id]: true })); notify(t.newVersionReady); }
    }
  }, [projectJobs]); // eslint-disable-line react-hooks/exhaustive-deps

  if (missing) return <div className="page"><div className="empty card">404 <button className="link" onClick={() => go('projects')}>{t.myProjects}</button></div></div>;
  if (!p) return <div className="page"><div className="skeleton" /></div>;

  const up = uploadState(id);
  const version = p.versions.find((v) => v.id === p.currentVersionId);
  const failed = lastMain && lastMain.status === 'failed' && !activeMain;

  return (
    <div className="page project">
      <ProjectHeader p={p} />
      {activeMain && !version ? (
        <Processing job={activeMain} />
      ) : version ? (
        <Review p={p} version={version} activeJob={activeMain} exportJob={activeExport} />
      ) : (
        <Setup p={p} up={up} analyzing={analyzing} />
      )}
      {failed && (
        <div className="card alert">
          <span>{lastMain.error?.message || t.errorGeneric}</span>
          <button className="btn" onClick={() => api.retryJob(lastMain.id)}>{t.retry}</button>
        </div>
      )}
      {version && state.settings.mode === 'pro' && <ProView p={p} version={version} />}
    </div>
  );
}

function ProjectHeader({ p }) {
  const { t } = useApp();
  const [name, setName] = useState(p.name);
  useEffect(() => setName(p.name), [p.name]);
  return (
    <div className="row between phead">
      <input className="title-input" value={name} aria-label={t.rename} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== p.name && api.updateProject(p.id, { name: name.trim() })} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
      <span className="muted small">{p.media.length} · {t.platforms[p.platform]}</span>
    </div>
  );
}

function MediaGrid({ p, up }) {
  const { t, tx } = useApp();
  return (
    <div className="media-grid">
      {p.media.map((m) => (
        <div key={m.id} className={`media ${m.error ? 'bad' : ''}`}>
          <div className="mthumb">
            {m.thumb ? <img src={fileUrl(p.id, m.thumb)} alt="" loading="lazy" /> : <div className="mthumb-empty">{m.kind === 'audio' ? '♪' : m.error ? '!' : <span className="spinner" />}</div>}
            {m.duration > 0 && <span className="badge dur">{fmt(m.duration)}</span>}
            {m.analysis?.scores?.total != null && <span className="badge score" title="Technical / Visual / Audio / Hook">{m.analysis.scores.total}</span>}
            <button className="mremove" aria-label={t.remove} onClick={() => api.removeMedia(p.id, m.id)}>×</button>
          </div>
          <div className="mname ellipsis" title={m.relPath}>{m.name}</div>
          <select className="mrole" value={m.role ?? 'null'} onChange={(e) => api.setRole(p.id, m.id, e.target.value === 'null' ? null : e.target.value)} aria-label="role">
            {(m.kind === 'audio' ? ['music', 'voice'] : m.kind === 'image' ? ['image', 'logo'] : ['null', 'aroll', 'broll']).map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
          </select>
          {m.error && <div className="small danger-text">{t.unreadable}</div>}
        </div>
      ))}
      {up && Object.entries(up.active).map(([k, v]) => (
        <div key={k} className="media uploading">
          <div className="mthumb"><div className="mthumb-empty"><div className="ring" style={{ '--p': v }} /></div></div>
          <div className="mname ellipsis">{k.split('/').pop()}</div>
        </div>
      ))}
    </div>
  );
}

function Choice({ label, options, value, onChange }) {
  return (
    <div className="choice">
      <div className="choice-label">{label}</div>
      <div className="seg">
        {options.map(([v, text, title]) => <button key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)} title={title}>{text}</button>)}
      </div>
    </div>
  );
}

function Setup({ p, up, analyzing }) {
  const { t, notify, state } = useApp();
  const usable = p.media.some((m) => (m.kind === 'video' || m.kind === 'image') && !m.error);
  const set = (patch) => api.updateProject(p.id, patch);
  const busyUpload = up && up.done < up.total;
  const hint = state.instagram?.connected ? null : null;
  void hint;
  const create = async () => {
    await api.create(p.id, { style: p.style, targetDuration: p.targetDuration, platform: p.platform, goal: p.goal });
  };
  return (
    <div className="setup">
      <div className="card">
        <div className="row between"><h3>{t.yourFootage}</h3>{(analyzing || busyUpload) && <span className="muted small"><span className="spinner sm" /> {busyUpload ? t.uploading(up.done, up.total) : t.analyzing}</span>}</div>
        {p.media.length > 0 && <MediaGrid p={p} up={up} />}
        <DropZone compact={p.media.length > 0} onFiles={(files) => { const r = enqueueUploads(p.id, files); if (r.skipped) notify(t.filesSkipped(r.skipped)); }} />
      </div>
      <div className="card setup-panel">
        <Choice label={t.style} value={p.style} onChange={(v) => set({ style: v })} options={['auto', 'viral', 'cinematic', 'premium'].map((k) => [k, `${t.styles[k][0]} ${t.styles[k][1]}`, t.styles[k][2]])} />
        <Choice label={t.duration} value={p.targetDuration} onChange={(v) => set({ targetDuration: v })} options={[15, 30, 45, 60, 90].map((s) => [s, `${s} ${t.sec}`])} />
        <Choice label={t.platform} value={p.platform} onChange={(v) => set({ platform: v })} options={Object.entries(t.platforms)} />
        <DnaHint p={p} />
        <button className="btn primary huge" disabled={!usable || busyUpload} onClick={create}>{t.create}</button>
        {!usable && <div className="muted small center">{t.needMedia}</div>}
      </div>
    </div>
  );
}

function DnaHint({ p }) {
  const { t, state } = useApp();
  const [dna, setDna] = useState(null);
  useEffect(() => { if (state.instagram?.connected) api.igDna().then(setDna).catch(() => {}); }, [state.instagram?.connected]);
  const h = dna?.directorHint?.targetDuration;
  if (!h || Math.abs(h - p.targetDuration) < 5) return null;
  return <div className="hint">📈 {t.dnaHint(h)} <button className="link" onClick={() => api.updateProject(p.id, { targetDuration: h })}>✓</button></div>;
}

function Processing({ job }) {
  const { t } = useApp();
  const order = ['analyzing', 'transcribing', 'directing', 'rendering', 'checking'];
  const cur = order.indexOf(job.stage);
  return (
    <div className="card processing">
      <div className="ai-orb" aria-hidden><span /><span /><span /></div>
      <h2>{t.stages[job.stage]?.[0] || t.creating}</h2>
      <p className="muted">{t.stages[job.stage]?.[1]}</p>
      <div className="bar"><div style={{ width: `${Math.round(job.progress * 100)}%` }} /></div>
      <div className="muted small">{Math.round(job.progress * 100)}%{job.retrying ? ' · ↻' : ''}</div>
      <ol className="stages">
        {order.map((s, i) => <li key={s} className={i < cur ? 'done' : i === cur ? 'now' : ''}>{t.stages[s][0]}</li>)}
      </ol>
      <button className="btn ghost" onClick={() => api.cancelJob(job.id)}>{t.cancel}</button>
    </div>
  );
}

function ScoreRing({ value, size = 92 }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="score-ring" role="img" aria-label={`${value}/100`}>
      <circle cx="50" cy="50" r={r} className="track" />
      <circle cx="50" cy="50" r={r} className="val" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} />
      <text x="50" y="56" textAnchor="middle">{value}</text>
    </svg>
  );
}

function Review({ p, version, activeJob, exportJob }) {
  const { t, tx, state, notify, lang } = useApp();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const score = version.score;
  const alts = p.alternatives || {};
  const curIdx = p.versions.findIndex((v) => v.id === version.id);

  const ask = async (q) => {
    const value = (q ?? text).trim();
    if (!value || sending) return;
    setSending(true);
    try {
      const r = await api.edit(p.id, value);
      if (!r.ok) notify(t.notUnderstood, 'warn'); else setText('');
    } finally { setSending(false); }
  };

  return (
    <div className="review">
      <div className="player-col">
        <div className={`player ${version.edl.format.width > version.edl.format.height ? 'landscape' : ''}`}>
          <video key={version.id} src={fileUrl(p.id, version.preview)} controls autoPlay playsInline poster={version.thumb ? fileUrl(p.id, version.thumb) : undefined} />
          {activeJob && (
            <div className="player-overlay">
              <div className="ai-orb sm" aria-hidden><span /><span /><span /></div>
              <div>{t.stages[activeJob.stage]?.[0] || t.working}</div>
              <div className="bar"><div style={{ width: `${Math.round(activeJob.progress * 100)}%` }} /></div>
              <button className="btn ghost sm" onClick={() => api.cancelJob(activeJob.id)}>{t.cancel}</button>
            </div>
          )}
        </div>
        <div className="row center gap wrap">
          <button className="btn ghost sm" disabled={curIdx <= 0} onClick={() => api.undo(p.id)} title="Ctrl+Z">↶ {t.undo}</button>
          <span className="muted small">v{version.n} · {fmt(version.edl.duration)}</span>
          <button className="btn ghost sm" disabled={!p.redo?.length} onClick={() => api.redo(p.id)} title="Ctrl+Shift+Z">{t.redo} ↷</button>
        </div>
        <ExportBox p={p} version={version} job={exportJob} />
      </div>

      <div className="side-col">
        <div className="card ready-card">
          <div className="row gap">
            {score && <ScoreRing value={score.total} />}
            <div className="grow">
              <h3>{t.ready}</h3>
              <div className="breakdown">
                {score && Object.entries(score.breakdown).filter(([, v]) => v != null).map(([k, v]) => (
                  <div key={k} className="bd"><span>{t.breakdown[k]}</span><div className="minibar"><div style={{ width: `${v}%` }} /></div><b>{v}</b></div>
                ))}
              </div>
            </div>
          </div>
          {score && score.total < 75 && !activeJob && <div className="hint">{t.lowScoreTip} <button className="link" onClick={() => ask(lang === 'he' ? 'שפר את הסרטון' : 'make it better')}>{t.improve}</button></div>}
          {!version.edl.captions && state.secrets?.openai?.set !== true && version.edl.structure === 'speech' && <div className="hint muted small">💬 {t.captionsOff}</div>}
        </div>

        <div className="card">
          <h4>{t.versionsTitle}</h4>
          <div className="versions3">
            {['viral', 'cinematic', 'premium'].map((s) => {
              const on = version.style === s;
              const alt = alts[s];
              return (
                <button key={s} className={`v3 ${on ? 'on' : ''}`} disabled={on || !!activeJob} onClick={() => api.variant(p.id, { style: s })}>
                  <span className="v3i">{t.styles[s][0]}</span>
                  <span>{t.styles[s][1]}</span>
                  <span className="muted small">{on ? t.current : alt?.scores ? `~${alt.scores.overall}` : ''}</span>
                </button>
              );
            })}
          </div>
          <div className="seg wide">
            {[15, 30, 45, 60].map((s) => <button key={s} disabled={!!activeJob} className={version.targetDuration === s ? 'on' : ''} onClick={() => api.variant(p.id, { targetDuration: s })}>{s} {t.sec}</button>)}
          </div>
        </div>

        <div className="card chat">
          <h4>{t.changeTitle}</h4>
          <div className="chips">{t.suggestions.map((s) => <button key={s} className="chip" disabled={!!activeJob} onClick={() => ask(s)}>{s}</button>)}</div>
          <div className="row gap">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t.changePh} onKeyDown={(e) => e.key === 'Enter' && ask()} disabled={!!activeJob} />
            <button className="btn primary" onClick={() => ask()} disabled={!text.trim() || sending || !!activeJob}>{t.send}</button>
          </div>
        </div>

        <div className="card">
          <h4>{t.whatIDid}</h4>
          <ul className="explain">{version.explanations.map((e, i) => <li key={i}>{tx(e)}</li>)}</ul>
          <Qc qc={version.qc} />
        </div>

        <div className="card">
          <h4>{t.history}</h4>
          <ul className="history">
            {[...p.versions].reverse().map((v) => (
              <li key={v.id} className={v.id === version.id ? 'on' : ''}>
                {v.thumb && <img src={fileUrl(p.id, v.thumb)} alt="" />}
                <div className="grow"><div>v{v.n} · {tx(v.label)}</div><div className="muted small">{t.styles[v.style]?.[1]} · {fmt(v.edl.duration)} · {v.score?.total ?? ''}</div></div>
                {v.id !== version.id ? <button className="btn ghost sm" onClick={() => api.restore(p.id, v.id)}>{t.restore}</button> : <span className="muted small">{t.current}</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Qc({ qc }) {
  const { t, tx } = useApp();
  if (!qc) return null;
  const open = qc.issues.filter((i) => !i.fixed);
  const fixed = qc.issues.filter((i) => i.fixed);
  return (
    <div className="qc">
      {open.length === 0 && <div className="ok">✓ {t.qcOk}</div>}
      {fixed.map((i, k) => <div key={k} className="ok">✓ {t.qcFixed}: {tx(i.msg)}</div>)}
      {open.map((i, k) => <div key={k} className="warn">⚠ {t.qcIssue}: {tx(i.msg)}</div>)}
    </div>
  );
}

function ExportBox({ p, version, job }) {
  const { t, state } = useApp();
  const presets = state.presets;
  const running = job && ACTIVE.includes(job.status) ? job : null;
  const last = p.exports.filter((e) => e.versionId === version.id).at(-1);
  const reveal = async (e) => {
    const r = await api.reveal(p.id, e.id);
    if (!r.ok && r.download) window.location.href = r.download;
  };
  return (
    <div className="card export">
      <h4>{t.exportTitle}</h4>
      <div className="presets">
        {Object.entries(presets).map(([k, label]) => (
          <button key={k} className="btn" disabled={!!running} onClick={() => api.exportVideo(p.id, { versionId: version.id, preset: k })}>{label}</button>
        ))}
      </div>
      {running && (
        <div className="exporting">
          <div className="muted small">{t.exporting} {Math.round(running.progress * 100)}%</div>
          <div className="bar"><div style={{ width: `${Math.round(running.progress * 100)}%` }} /></div>
          <button className="btn ghost sm" onClick={() => api.cancelJob(running.id)}>{t.cancel}</button>
        </div>
      )}
      {job?.status === 'failed' && <div className="alert-inline">{job.error?.message} <button className="link" onClick={() => api.retryJob(job.id)}>{t.retry}</button></div>}
      {!running && last && (
        <div className="exported">
          <span className="ok">✓ {t.exported} {presets[last.preset]}</span>
          {last.savedTo && <div className="muted small ellipsis" title={last.savedTo}>{t.savedTo} {last.savedTo}</div>}
          <div className="row gap">
            {state.host.desktop && <button className="btn sm" onClick={() => reveal(last)}>{t.showFile}</button>}
            <a className="btn sm ghost" href={`${fileUrl(p.id, last.file)}?download=1`}>{t.download}</a>
          </div>
        </div>
      )}
    </div>
  );
}

/** Pro mode: the real Edit Decision List, as tracks + a readable list with reasons. */
function ProView({ p, version }) {
  const { t, tx } = useApp();
  const edl = version.edl;
  const total = edl.duration || 1;
  const byId = Object.fromEntries(p.media.map((m) => [m.id, m]));
  const pct = (x) => `${(x / total) * 100}%`;
  const colors = {};
  let ci = 0;
  for (const s of edl.shots) if (!(s.mediaId in colors)) colors[s.mediaId] = ci++ % 8;
  return (
    <div className="card pro">
      <h4>{t.proView}</h4>
      <div className="tracks" dir="ltr">
        <div className="track"><span className="tl">{t.tracks.video}</span><div className="lane">
          {edl.shots.map((s) => <div key={s.id} className={`clip c${colors[s.mediaId]} ${s.section}`} style={{ insetInlineStart: pct(s.start), width: pct(s.duration) }} title={`${byId[s.mediaId]?.name} ${s.in}–${s.out}s · ${tx(s.reason)}`}>{s.zoom?.type !== 'none' ? '⤢' : ''}{s.transition?.type === 'crossfade' ? '◐' : ''}</div>)}
        </div></div>
        <div className="track"><span className="tl">{t.tracks.audio}</span><div className="lane">
          {edl.shots.filter((s) => s.audio).map((s) => <div key={s.id} className="clip audio" style={{ insetInlineStart: pct(s.start), width: pct(s.duration) }} />)}
        </div></div>
        {edl.audio.music && <div className="track"><span className="tl">{t.tracks.music}</span><div className="lane"><div className="clip music" style={{ insetInlineStart: 0, width: '100%' }}>{byId[edl.audio.music.mediaId]?.name}</div></div></div>}
        <div className="track"><span className="tl">{t.tracks.sfx}</span><div className="lane">
          {edl.shots.filter((s) => s.sfx).map((s) => <div key={s.id} className="clip sfx" style={{ insetInlineStart: pct(Math.max(0, s.start - 0.3)), width: pct(0.7) }} title={s.sfx.type} />)}
        </div></div>
        {edl.captions && <div className="track"><span className="tl">{t.tracks.captions}</span><div className="lane"><div className="clip captions" style={{ insetInlineStart: 0, width: '100%' }}>{edl.captions.style} · {edl.captions.words}</div></div></div>}
      </div>
      <table className="edl">
        <thead><tr><th>#</th><th>⏱</th><th>{t.shot}</th><th>✂</th><th>⤢</th><th>↔</th><th>♪</th><th /></tr></thead>
        <tbody>
          {edl.shots.map((s, i) => (
            <tr key={s.id}>
              <td>{i + 1}</td>
              <td dir="ltr">{fmt(s.start)}–{fmt(s.start + s.duration)}</td>
              <td className="ellipsis">{byId[s.mediaId]?.name} <span className="muted" dir="ltr">{s.in}–{s.out}s{s.speed !== 1 ? ` ×${s.speed}` : ''}</span></td>
              <td>{s.section}</td>
              <td dir="ltr">{s.zoom?.type === 'none' ? '—' : `${s.zoom.from}→${s.zoom.to}`}</td>
              <td>{s.transition?.type}</td>
              <td>{s.sfx?.type || ''}</td>
              <td className="muted small">{tx(s.zoom?.reason) || tx(s.reason)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
