/* =====================================================================
   p14 · Boot Pro – טוען את האחסון המקומי, מאתחל את שכבת ה-Pro ואז את האתחול המקורי
   ===================================================================== */
const Boot = (() => {
  let done; const ready = new Promise(r => { done = r; });
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error(name, e); } };
  function go() {
    safe('Level.init', () => Level.init());
    bootBase();
    safe('Glossary.init', () => Glossary.init());
    Level.apply();
    safe('DataUI.init', () => DataUI.init());
    (window.BootHooks || []).forEach(fn => safe('hook', fn));
    done();
  }
  Persist.init().then(go, go);
  return { ready };
})();
/** לבדיקות אוטומטיות: מחכה לסיום האתחול */
window.__testReady = () => Boot.ready;
