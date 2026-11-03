import React, { useState } from 'react';
import { useApp } from '../App.jsx';
import { api, fileUrl } from '../api.js';

const fmtDur = (s) => (s == null ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);

export function ProjectCard({ p, actions = false }) {
  const { t, lang, go, refresh, notify } = useApp();
  const [menu, setMenu] = useState(false);
  const date = new Date(p.updatedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const rename = async () => {
    const name = window.prompt(t.rename, p.name);
    if (name && name.trim()) { await api.updateProject(p.id, { name: name.trim() }); refresh(); }
  };
  const remove = async () => { if (window.confirm(t.confirmDelete)) { await api.deleteProject(p.id); refresh(); } };
  const dup = async () => { await api.duplicate(p.id); refresh(); notify('✓'); };
  return (
    <div className="pcard">
      <button className="pthumb" onClick={() => go(`project/${p.id}`)} aria-label={`${t.open} ${p.name}`}>
        {p.thumb ? <img src={fileUrl(p.id, p.thumb)} alt="" loading="lazy" /> : <div className="pthumb-empty">🎬</div>}
        {p.duration != null && <span className="badge dur">{fmtDur(p.duration)}</span>}
        {p.score != null && <span className="badge score">{p.score}</span>}
      </button>
      <div className="pmeta">
        <div className="row between">
          <strong className="ellipsis" title={p.name}>{p.name}</strong>
          {actions && (
            <div className="menu-wrap">
              <button className="icon" onClick={() => setMenu(!menu)} aria-label="menu">⋯</button>
              {menu && (
                <div className="menu" onMouseLeave={() => setMenu(false)}>
                  <button onClick={() => go(`project/${p.id}`)}>{t.open}</button>
                  <button onClick={rename}>{t.rename}</button>
                  <button onClick={dup}>{t.duplicate}</button>
                  <button className="danger" onClick={remove}>{t.delete}</button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="muted small row gap">
          <span className={`dot ${p.status}`} />{t.status[p.status] || p.status}
          <span>·</span><span>{t.platforms[p.platform] || ''}</span>
          <span>·</span><span>{date}</span>
        </div>
      </div>
    </div>
  );
}

export default function Projects() {
  const { t, state, go } = useApp();
  return (
    <div className="page">
      <div className="row between"><h2>{t.myProjects}</h2><button className="btn primary" onClick={() => go('home')}>+ {t.newProject}</button></div>
      {state.projects.length === 0 ? <div className="empty card">{t.noProjects}</div> : (
        <div className="grid cards4">{state.projects.map((p) => <ProjectCard key={p.id} p={p} actions />)}</div>
      )}
    </div>
  );
}
