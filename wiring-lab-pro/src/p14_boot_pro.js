/* =====================================================================
   p14 · Boot Pro – מאתחל את שכבת ה-Pro ואז מפעיל את האתחול המקורי
   ===================================================================== */
(function bootPro() {
  try { Level.init(); } catch (e) { console.error('Level.init', e); }
  bootBase();
  try { Glossary.init(); } catch (e) { console.error('Glossary.init', e); }
  Level.apply();
})();
