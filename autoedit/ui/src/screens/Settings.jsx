import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../App.jsx';
import { api, uploadFile } from '../api.js';

const TABS = ['ai', 'instagram', 'brand', 'export', 'privacy', 'advanced'];

export default function Settings({ tab }) {
  const { t, go } = useApp();
  const cur = TABS.includes(tab) ? tab : 'ai';
  return (
    <div className="page settings">
      <h2>{t.settings}</h2>
      <div className="tabs" role="tablist">
        {TABS.map((k) => <button key={k} role="tab" aria-selected={cur === k} className={cur === k ? 'on' : ''} onClick={() => go(`settings/${k}`)}>{t.tabs[k]}</button>)}
      </div>
      <div className="tab-body">
        {cur === 'ai' && <AiTab />}
        {cur === 'instagram' && <InstagramTab />}
        {cur === 'brand' && <BrandTab />}
        {cur === 'export' && <ExportTab />}
        {cur === 'privacy' && <PrivacyTab />}
        {cur === 'advanced' && <AdvancedTab />}
      </div>
    </div>
  );
}

function KeyRow({ name, info }) {
  const { t, state, refresh } = useApp();
  const [value, setValue] = useState('');
  const [status, setStatus] = useState(null);
  const s = state.secrets[name];
  const save = async () => {
    setStatus('checking');
    const r = await api.setSecret(name, value).catch(() => ({ ok: false, reason: 'error' }));
    setStatus(r.ok ? 'ok' : r.reason || 'error');
    if (r.ok) { setValue(''); refresh(); }
  };
  return (
    <div className="card keyrow">
      <div className="row between"><strong>{info[0]}</strong><span className={`pill ${s?.set ? 'ok' : ''}`}>{s?.set ? `${t.keyOk} ${s.hint}` : t.notConnected}</span></div>
      <p className="muted small">{info[1]}</p>
      <div className="row gap">
        <input type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} placeholder={t.keyPh} />
        <button className="btn primary" disabled={!value.trim() || status === 'checking'} onClick={save}>{status === 'checking' ? t.checking : t.save}</button>
        {s?.set && <button className="btn ghost" onClick={async () => { await api.setSecret(name, ''); refresh(); setStatus(null); }}>{t.remove}</button>}
      </div>
      {status && status !== 'ok' && status !== 'checking' && <div className="danger-text small">{t.keyBad[status] || t.keyBad.error}</div>}
    </div>
  );
}

function AiTab() {
  const { t } = useApp();
  return (
    <>
      <p className="muted">{t.aiIntro}</p>
      <KeyRow name="openai" info={t.keyOpenai} />
      <KeyRow name="anthropic" info={t.keyAnthropic} />
    </>
  );
}

function InstagramTab() {
  const { t, state, notify, lang } = useApp();
  const ig = state.instagram;
  const [cfg, setCfg] = useState({ appId: ig.appId, appSecret: '', redirectUri: ig.redirectUri });
  const [pasted, setPasted] = useState('');
  const [connecting, setConnecting] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [dna, setDna] = useState(null);
  const [q, setQ] = useState('');
  const [coach, setCoach] = useState(null);
  const [asking, setAsking] = useState(false);
  const redirect = cfg.redirectUri || `http://localhost:${window.location.port}/oauth/instagram/callback`;

  useEffect(() => { if (ig.connected) api.igDna().then(setDna).catch(() => {}); }, [ig.connected, ig.syncedAt]);

  const saveCfg = async () => { await api.igConfig(cfg); setCfg((c) => ({ ...c, appSecret: '' })); notify('✓'); };
  const connect = async () => {
    const r = await api.igConnect();
    if (!r.ok) return notify(t.igSetupTitle, 'warn');
    setConnecting(r);
    if (!r.automatic || !window.autoedit) window.open(r.url, '_blank', 'noopener');
  };
  const sync = async () => {
    setSyncing(true);
    try { const r = await api.igSync(); if (!r.ok) notify(r.reason, 'warn'); } finally { setSyncing(false); }
  };

  return (
    <>
      <p className="muted">{t.igIntro}</p>
      <div className="hint">{t.igReq}</div>
      {!ig.connected && (
        <div className="card">
          <h4>{t.igSetupTitle}</h4>
          <ol className="steps">{t.igSetupSteps.map((s) => <li key={s}>{s}</li>)}</ol>
          <label>{t.appId}<input value={cfg.appId} onChange={(e) => setCfg({ ...cfg, appId: e.target.value })} /></label>
          <label>{t.appSecret}<input type="password" autoComplete="off" placeholder={ig.configured ? '••••••••' : ''} value={cfg.appSecret} onChange={(e) => setCfg({ ...cfg, appSecret: e.target.value })} /></label>
          <label>{t.redirect}<input dir="ltr" value={cfg.redirectUri} placeholder={redirect} onChange={(e) => setCfg({ ...cfg, redirectUri: e.target.value })} /></label>
          <div className="row gap"><button className="btn" onClick={saveCfg}>{t.save}</button>
            <button className="btn primary" disabled={!ig.configured} onClick={connect}>{t.connectIg}</button></div>
          {connecting && (
            <div className="paste">
              <p className="muted small">{t.pasteLink}</p>
              <div className="row gap"><input dir="ltr" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="https://…?code=…" />
                <button className="btn" disabled={!pasted} onClick={async () => { const r = await api.igFinish(pasted); notify(r.ok ? '✓' : r.reason, r.ok ? 'info' : 'warn'); }}>{t.finish}</button></div>
            </div>
          )}
        </div>
      )}
      {ig.connected && (
        <div className="card">
          <div className="row between">
            <div><strong>@{ig.account?.username}</strong> <span className="muted small">· {ig.account?.accountType} · {ig.account?.followers ?? '–'} followers</span></div>
            <div className="row gap">
              <button className="btn" disabled={syncing} onClick={sync}>{syncing ? t.syncing : t.sync}</button>
              <button className="btn ghost" onClick={() => api.igDisconnect()}>{t.disconnect}</button>
            </div>
          </div>
          {ig.syncedAt && <div className="muted small">{ig.posts} posts · {new Date(ig.syncedAt).toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')}</div>}
        </div>
      )}
      {ig.connected && (
        <div className="card">
          <h4>{t.dnaTitle}</h4>
          {!dna?.enough ? <p className="muted">{t.dnaNotEnough}</p> : (
            <>
              <div className="dna-stats">
                <div><b>{dna.posts}</b><span>posts</span></div>
                {dna.engagementRate != null && <div><b>{dna.engagementRate}%</b><span>engagement</span></div>}
                {Object.entries(dna.best).map(([k, v]) => <div key={k}><b>{v.value}</b><span>{k} · {t.conf[v.confidence]}</span></div>)}
              </div>
              <ul className="insights">{dna.insights.map((i) => <li key={i.key}><span className={`pill conf-${i.confidence}`}>{t.conf[i.confidence]}</span> {i.text[lang]}</li>)}</ul>
            </>
          )}
        </div>
      )}
      {ig.connected && (
        <div className="card">
          <h4>{t.coachTitle}</h4>
          <div className="row gap"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.coachPh} onKeyDown={(e) => e.key === 'Enter' && document.getElementById('askcoach').click()} />
            <button id="askcoach" className="btn primary" disabled={asking} onClick={async () => { setAsking(true); try { setCoach(await api.igCoach(q || t.coachPh)); } finally { setAsking(false); } }}>{asking ? t.checking : t.ask}</button></div>
          {coach && (
            <div className="coach">
              {coach.answer.map((a, i) => <p key={i}>{a[lang] || a.en}</p>)}
              {coach.ideas.map((idea, i) => <div key={i} className="idea"><strong>{idea.title}</strong>{idea.hook && <div>🎣 {idea.hook}</div>}<div className="muted small">{[idea.format, idea.length].filter(Boolean).join(' · ')}</div><div className="muted small">{idea.why}</div></div>)}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function BrandTab() {
  const { t, state, updateSettings, refresh } = useApp();
  const b = state.settings.brand;
  const fileRef = useRef();
  const [v, setV] = useState(0);
  const upload = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    await uploadFile(`/api/brand/logo?name=${encodeURIComponent(f.name)}`, f);
    await refresh();
    setV(Date.now());
  };
  return (
    <div className="card form">
      <label>{t.brandName}<input value={b.name} onChange={(e) => updateSettings({ brand: { name: e.target.value } })} /></label>
      <div className="field">
        <span>{t.logo}</span>
        <div className="row gap">
          {b.logo && <img className="logo-prev" src={`/brand/${b.logo}?v=${v}`} alt="" />}
          <button className="btn" onClick={() => fileRef.current.click()}>{t.uploadLogo}</button>
          {b.logo && <button className="btn ghost" onClick={async () => { await api.removeLogo(); refresh(); }}>{t.remove}</button>}
          <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={upload} />
        </div>
      </div>
      {b.logo && (
        <div className="field"><span>{t.logo}</span><div className="seg">{Object.entries(t.logoMode).map(([k, label]) => <button key={k} className={b.logoMode === k ? 'on' : ''} onClick={() => updateSettings({ brand: { logoMode: k } })}>{label}</button>)}</div></div>
      )}
      <label>{t.brandColor}<input type="color" value={b.colors?.find((c) => !/^#?(000000|111111|ffffff)$/i.test(c)) || '#FFE100'} onChange={(e) => updateSettings({ brand: { colors: [e.target.value] } })} /></label>
      <label>{t.cta}<input value={b.cta} placeholder={t.ctaPh} onChange={(e) => updateSettings({ brand: { cta: e.target.value } })} /></label>
    </div>
  );
}

function ExportTab() {
  const { t, state, updateSettings } = useApp();
  return (
    <div className="card form">
      <div className="field"><span>{t.defaultExport}</span><div className="seg">{Object.entries(state.presets).map(([k, label]) => <button key={k} className={state.settings.export.defaultPreset === k ? 'on' : ''} onClick={() => updateSettings({ export: { defaultPreset: k } })}>{label}</button>)}</div></div>
      {state.host.exportDir && <div className="field"><span>{t.exportFolder}</span><code dir="ltr">{state.host.exportDir}</code></div>}
    </div>
  );
}

function PrivacyTab() {
  const { t, state, updateSettings } = useApp();
  return (
    <>
      <div className="card"><dl className="privacy">{t.privacyItems.map(([a, b]) => <React.Fragment key={a}><dt>{a}</dt><dd>{b}</dd></React.Fragment>)}</dl></div>
      <div className="card form">
        <label className="check"><input type="checkbox" checked={state.settings.privacy.sendTranscriptsToAI !== false} onChange={(e) => updateSettings({ privacy: { sendTranscriptsToAI: e.target.checked } })} /> {t.sendToAi}</label>
        <div className="field"><span>{t.dataFolder}</span><code dir="ltr">{state.system.dataDir}</code></div>
      </div>
    </>
  );
}

function AdvancedTab() {
  const { t, state, updateSettings, lang } = useApp();
  const gb = state.system.freeBytes ? (state.system.freeBytes / 1e9).toFixed(1) : null;
  return (
    <div className="card form">
      <div className="field"><span>{t.mode}</span><div className="seg"><button className={state.settings.mode !== 'pro' ? 'on' : ''} onClick={() => updateSettings({ mode: 'beginner' })}>{t.beginner}</button><button className={state.settings.mode === 'pro' ? 'on' : ''} onClick={() => updateSettings({ mode: 'pro' })}>{t.pro}</button></div><small className="muted">{t.modeHelp}</small></div>
      <div className="field"><span>{t.lang}</span><div className="seg"><button className={lang === 'he' ? 'on' : ''} onClick={() => updateSettings({ lang: 'he' })}>עברית</button><button className={lang === 'en' ? 'on' : ''} onClick={() => updateSettings({ lang: 'en' })}>English</button></div></div>
      <div className="field"><span>Engine</span><span>{state.system.mediaEngine ? `✓ ${t.obEngineOk}` : `✗ ${t.obEngineBad}`}{gb ? ` · ${t.obSpace(gb)}` : ''}</span></div>
      <div className="field"><span>Features</span>
        {Object.entries(state.settings.flags).map(([k, v]) => <label key={k} className="check"><input type="checkbox" checked={v} onChange={(e) => updateSettings({ flags: { [k]: e.target.checked } })} /> {k}</label>)}
      </div>
    </div>
  );
}
