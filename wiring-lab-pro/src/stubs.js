/* stubs – רק לבנייה חלקית (שלבים 1–3) */
if (typeof window.Academy === 'undefined') window.Academy = { html: () => '<p class="lead">האקדמיה תיטען בשלב 3.</p>', bind() {}, highlight() { Scene.select(null); } };
if (typeof window.Tools === 'undefined') window.Tools = { render() { $('#modeView').innerHTML = '<p class="lead">הכלים ייטענו בשלב 4.</p>'; }, restore() {} };
if (typeof window.WizardPlus === 'undefined') window.WizardPlus = { setupExtra: () => '', stepExtra: () => '', bindStep() {}, reset() {} };
if (typeof window.DataUI === 'undefined') window.DataUI = { html: () => '', bind() {}, init() {}, lockedCard: () => '', refreshNotices() {} };
if (typeof window.Builder === 'undefined') window.Builder = { render() { $('#modeView').innerHTML = '<p class="lead">בנה בעצמך ייטען בשלב 4.</p>'; }, restore() {}, refreshCatalog() {} };
if (typeof window.Cards === 'undefined') window.Cards = { html: () => '' };
