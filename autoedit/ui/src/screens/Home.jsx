import React, { useRef, useState } from 'react';
import { useApp } from '../App.jsx';
import { api, fileUrl, filesFromDrop } from '../api.js';
import { GOAL_PRESETS } from '../i18n.js';
import { enqueueUploads } from '../uploads.js';
import { ProjectCard } from './Projects.jsx';

export function DropZone({ onFiles, compact = false }) {
  const { t } = useApp();
  const [over, setOver] = useState(false);
  const filesRef = useRef();
  const folderRef = useRef();
  const fromInput = (e) => {
    const list = [...e.target.files].map((f) => ({ file: f, relPath: f.webkitRelativePath || f.name }));
    e.target.value = '';
    if (list.length) onFiles(list);
  };
  return (
    <div
      className={`dropzone ${over ? 'over' : ''} ${compact ? 'compact' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={async (e) => { e.preventDefault(); setOver(false); const list = await filesFromDrop(e); if (list.length) onFiles(list); }}
    >
      <div className="drop-icon" aria-hidden>⤓</div>
      <p>{t.drop}</p>
      <div className="row center gap">
        <button className="btn" onClick={() => filesRef.current.click()}>{t.pickFiles}</button>
        <span className="muted">{t.dropOr}</span>
        <button className="btn ghost" onClick={() => folderRef.current.click()}>{t.pickFolder}</button>
      </div>
      <input ref={filesRef} type="file" multiple hidden accept="video/*,audio/*,image/*,.heic,.heif,.mkv,.mts" onChange={fromInput} />
      <input ref={folderRef} type="file" hidden webkitdirectory="" directory="" onChange={fromInput} />
    </div>
  );
}

export default function Home() {
  const { t, state, go, notify } = useApp();
  const [goal, setGoal] = useState(null);
  const [busy, setBusy] = useState(false);

  const start = async (g, files) => {
    if (busy) return;
    setBusy(true);
    try {
      const preset = GOAL_PRESETS[g || 'auto'];
      const p = await api.createProject({ name: t.untitled, goal: g || 'auto', ...preset });
      if (files?.length) {
        const r = enqueueUploads(p.id, files);
        if (r.skipped) notify(t.filesSkipped(r.skipped));
      }
      go(`project/${p.id}`);
    } finally { setBusy(false); }
  };

  const recent = state.projects.slice(0, 4);
  const resumable = state.projects.find((p) => p.status === 'working' || (p.status === 'draft' && p.mediaCount > 0));

  return (
    <div className="home">
      <section className="hero">
        <h1>{t.homeTitle}</h1>
        <p className="muted lead">{t.homeSub}</p>
      </section>
      {resumable && (
        <div className="resume card">
          {resumable.thumb && <img src={fileUrl(resumable.id, resumable.thumb)} alt="" />}
          <div className="grow"><strong>{t.continueTitle}</strong><div className="muted">{resumable.name}</div></div>
          <button className="btn primary" onClick={() => go(`project/${resumable.id}`)}>{t.continueBtn}</button>
        </div>
      )}
      <section className="goals">
        {Object.entries(t.goals).map(([key, [icon, title, sub]]) => (
          <button key={key} className={`goal ${goal === key ? 'on' : ''} ${key === 'auto' ? 'auto' : ''}`} onClick={() => { setGoal(key); start(key); }} disabled={busy}>
            <span className="goal-icon" aria-hidden>{icon}</span>
            <span className="goal-title">{title}</span>
            <span className="goal-sub">{sub}</span>
          </button>
        ))}
      </section>
      <DropZone onFiles={(files) => start(goal || 'auto', files)} />
      {recent.length > 0 && (
        <section>
          <div className="row between"><h3>{t.recent}</h3><button className="link" onClick={() => go('projects')}>{t.allProjects}</button></div>
          <div className="grid cards4">{recent.map((p) => <ProjectCard key={p.id} p={p} />)}</div>
        </section>
      )}
    </div>
  );
}
