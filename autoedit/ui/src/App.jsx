import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { STR, tx } from './i18n.js';
import Home from './screens/Home.jsx';
import Project from './screens/Project.jsx';
import Projects from './screens/Projects.jsx';
import Settings from './screens/Settings.jsx';
import Onboarding from './screens/Onboarding.jsx';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

function parseHash() {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [screen, id, sub] = h.split('/');
  return { screen: screen || 'home', id, sub };
}

export default function App() {
  const [state, setState] = useState(null);
  const [route, setRoute] = useState(parseHash());
  const [jobs, setJobs] = useState({});
  const [toast, setToast] = useState(null);
  const projectListeners = useRef(new Set());

  const lang = state?.settings?.lang || 'he';
  const t = STR[lang];
  const refresh = useCallback(async () => {
    try {
      const s = await api.state();
      setState(s);
      setJobs((prev) => { const next = { ...prev }; for (const j of s.jobs) next[j.id] = j; return next; });
    } catch { /* server starting */ setTimeout(() => refresh(), 800); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  }, [lang]);

  // Live updates: job progress + project changes (Server-Sent Events).
  useEffect(() => {
    const es = new EventSource('/api/events');
    es.addEventListener('job', (e) => {
      const j = JSON.parse(e.data);
      setJobs((prev) => ({ ...prev, [j.id]: j }));
    });
    let timer = null;
    es.addEventListener('project', (e) => {
      const { id } = JSON.parse(e.data);
      for (const fn of projectListeners.current) fn(id);
      clearTimeout(timer);
      timer = setTimeout(async () => { try { const projects = await api.projects(); setState((s) => (s ? { ...s, projects } : s)); } catch { /* ignore */ } }, 300);
    });
    es.addEventListener('instagram', (e) => setState((s) => (s ? { ...s, instagram: JSON.parse(e.data) } : s)));
    return () => es.close();
  }, []);

  const go = useCallback((path) => { window.location.hash = `#/${path}`; }, []);
  const notify = useCallback((msg, kind = 'info') => {
    setToast({ msg, kind, id: Date.now() });
    setTimeout(() => setToast((x) => (x && Date.now() - x.id > 3500 ? null : x)), 4000);
  }, []);
  const onProjectChange = useCallback((fn) => { projectListeners.current.add(fn); return () => projectListeners.current.delete(fn); }, []);
  const updateSettings = useCallback(async (patch) => {
    const settings = await api.settings(patch);
    setState((s) => ({ ...s, settings }));
    return settings;
  }, []);

  // Keyboard shortcuts: Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z redo (on a project), Esc → home.
  useEffect(() => {
    const on = (e) => {
      if (e.target.closest('input,textarea,select')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (route.screen === 'project' && route.id && mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        (e.shiftKey ? api.redo(route.id) : api.undo(route.id)).catch(() => {});
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [route]);

  const value = useMemo(() => ({ state, setState, refresh, lang, t, tx: (v) => tx(lang, v), go, route, jobs, notify, onProjectChange, updateSettings }), [state, refresh, lang, t, go, route, jobs, notify, onProjectChange, updateSettings]);

  if (!state) {
    return <div className="boot"><div className="logo-mark big" /><div className="pulse-dots"><span /><span /><span /></div></div>;
  }
  const showOnboarding = !state.settings.onboardingDone;

  return (
    <Ctx.Provider value={value}>
      <div className="app">
        <header className="topbar">
          <button className="brand" onClick={() => go('home')}><span className="logo-mark" />AutoEdit</button>
          <nav>
            <button className={route.screen === 'home' ? 'on' : ''} onClick={() => go('home')}>{t.home}</button>
            <button className={route.screen === 'projects' ? 'on' : ''} onClick={() => go('projects')}>{t.myProjects}</button>
            <button className={route.screen === 'settings' ? 'on' : ''} onClick={() => go('settings')}>{t.settings}</button>
          </nav>
          <div className="topbar-end">
            <div className="seg small" role="group" aria-label={t.mode}>
              <button className={state.settings.mode !== 'pro' ? 'on' : ''} onClick={() => updateSettings({ mode: 'beginner' })}>{t.beginner}</button>
              <button className={state.settings.mode === 'pro' ? 'on' : ''} onClick={() => updateSettings({ mode: 'pro' })}>{t.pro}</button>
            </div>
            <button className="lang" onClick={() => updateSettings({ lang: lang === 'he' ? 'en' : 'he' })}>{lang === 'he' ? 'EN' : 'עב'}</button>
          </div>
        </header>
        <main>
          {showOnboarding ? <Onboarding /> : (
            <>
              {route.screen === 'home' && <Home />}
              {route.screen === 'project' && route.id && <Project id={route.id} key={route.id} />}
              {route.screen === 'projects' && <Projects />}
              {route.screen === 'settings' && <Settings tab={route.id} />}
            </>
          )}
        </main>
        {toast && <div className={`toast ${toast.kind}`} key={toast.id} role="status">{toast.msg}</div>}
      </div>
    </Ctx.Provider>
  );
}
