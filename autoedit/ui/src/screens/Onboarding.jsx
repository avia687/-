import React, { useRef, useState } from 'react';
import { useApp } from '../App.jsx';
import { uploadFile } from '../api.js';

/** First run: quick system check, then three optional steps. */
export default function Onboarding() {
  const { t, state, updateSettings, go, refresh } = useApp();
  const [step, setStep] = useState(0);
  const fileRef = useRef();
  const sys = state.system;
  const gb = sys.freeBytes ? (sys.freeBytes / 1e9).toFixed(1) : null;
  const finish = async (path) => { await updateSettings({ onboardingDone: true }); go(path); };

  return (
    <div className="onboarding">
      <div className="card ob-card">
        <div className="logo-mark big" />
        <h1>{t.obWelcome}</h1>
        <p className="muted">{t.obSub}</p>
        {step === 0 && (
          <>
            <ul className="checks">
              <li className={sys.mediaEngine ? 'ok' : 'bad'}>{sys.mediaEngine ? '✓' : '✗'} {sys.mediaEngine ? t.obEngineOk : t.obEngineBad}</li>
              {gb && <li className={Number(gb) > 5 ? 'ok' : 'bad'}>{Number(gb) > 5 ? '✓' : '!'} {t.obSpace(gb)}</li>}
            </ul>
            <button className="btn primary huge" disabled={!sys.mediaEngine} onClick={() => setStep(1)}>{t.next}</button>
          </>
        )}
        {step > 0 && (
          <ol className="ob-steps">
            {[t.ob1, t.ob2, t.ob3].map(([title, sub], i) => (
              <li key={title} className={step === i + 1 ? 'now' : step > i + 1 ? 'done' : ''}>
                <div className="num">{step > i + 1 ? '✓' : i + 1}</div>
                <div className="grow"><strong>{title}</strong><div className="muted small">{sub}</div></div>
                {step === 1 && i === 0 && <div className="row gap"><button className="btn ghost" onClick={() => setStep(2)}>{t.later}</button><button className="btn" onClick={() => finish('settings/instagram')}>{t.connectIg}</button></div>}
                {step === 2 && i === 1 && (
                  <div className="row gap">
                    <button className="btn ghost" onClick={() => setStep(3)}>{t.later}</button>
                    <button className="btn" onClick={() => fileRef.current.click()}>{t.uploadLogo}</button>
                    <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={async (e) => { const f = e.target.files[0]; if (f) { await uploadFile(`/api/brand/logo?name=${encodeURIComponent(f.name)}`, f); await refresh(); setStep(3); } }} />
                  </div>
                )}
                {step === 3 && i === 2 && <button className="btn primary" onClick={() => finish('home')}>{t.start}</button>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
