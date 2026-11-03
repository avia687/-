// Instagram Intelligence — official Instagram API with Instagram Login (OAuth). Never asks for a password,
// never scrapes. Only metrics the API actually returns are stored; Content DNA states its confidence.
import path from 'node:path';
import crypto from 'node:crypto';
import { atomicWriteJson, readJsonSafe } from './store.js';
import { probe } from './ffmpeg.js';
import { log } from './log.js';

const GRAPH = 'https://graph.instagram.com/v23.0';
const SCOPES = ['instagram_business_basic', 'instagram_business_manage_insights'];
const MEDIA_FIELDS = 'id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count,thumbnail_url,media_url';
const T = (he, en) => ({ he, en });

export class Instagram {
  constructor({ settings, ai, dataDir, openExternal }) {
    Object.assign(this, { settings, ai, openExternal });
    this.file = path.join(dataDir, 'instagram.json');
    this.data = readJsonSafe(this.file) || { config: { appId: '', redirectUri: '' }, account: null, media: [], syncedAt: null };
    this.pendingState = null;
  }

  save() { return atomicWriteJson(this.file, this.data); }
  token() { return this.settings.getSecret('instagram_token'); }

  status() {
    const c = this.data.config;
    return {
      configured: !!(c.appId && this.settings.getSecret('meta_app_secret')),
      appId: c.appId || '',
      redirectUri: c.redirectUri || '',
      connected: !!(this.data.account && this.token()),
      account: this.data.account ? { username: this.data.account.username, accountType: this.data.account.account_type, followers: this.data.account.followers_count ?? null, mediaCount: this.data.account.media_count ?? null } : null,
      syncedAt: this.data.syncedAt,
      posts: this.data.media.length,
      tokenExpiresAt: this.data.tokenExpiresAt || null,
      scopes: SCOPES,
    };
  }

  async configure({ appId, appSecret, redirectUri }) {
    if (appId !== undefined) this.data.config.appId = String(appId).trim();
    if (redirectUri !== undefined) this.data.config.redirectUri = String(redirectUri).trim();
    if (appSecret) await this.settings.setSecret('meta_app_secret', String(appSecret).trim());
    await this.save();
    return this.status();
  }

  redirectUri(port) { return this.data.config.redirectUri || `http://localhost:${port}/oauth/instagram/callback`; }

  /** Build the official authorization URL and open it in the user's browser. */
  async startConnect(port) {
    const st = this.status();
    if (!st.configured) return { ok: false, reason: 'not_configured' };
    this.pendingState = crypto.randomBytes(16).toString('hex');
    const u = new URL('https://www.instagram.com/oauth/authorize');
    u.searchParams.set('client_id', this.data.config.appId);
    u.searchParams.set('redirect_uri', this.redirectUri(port));
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', SCOPES.join(','));
    u.searchParams.set('state', this.pendingState);
    const auto = /^http:\/\/(localhost|127\.0\.0\.1)/.test(this.redirectUri(port));
    if (this.openExternal) this.openExternal(u.toString());
    return { ok: true, url: u.toString(), automatic: auto };
  }

  /** Accepts the callback query (automatic) or a pasted redirect URL (manual). */
  async finishConnect(query, port) {
    try {
      let code = query.get?.('code');
      let state = query.get?.('state');
      if (!code && query.pasted) {
        const u = new URL(query.pasted);
        code = u.searchParams.get('code');
        state = u.searchParams.get('state');
      }
      if (!code) return { ok: false, reason: 'no_code' };
      if (this.pendingState && state && state !== this.pendingState) return { ok: false, reason: 'state_mismatch' };
      code = code.replace(/#_$/, '');
      const form = new URLSearchParams({
        client_id: this.data.config.appId, client_secret: this.settings.getSecret('meta_app_secret'),
        grant_type: 'authorization_code', redirect_uri: this.redirectUri(port), code,
      });
      const shortRes = await fetch('https://api.instagram.com/oauth/access_token', { method: 'POST', body: form });
      const short = await shortRes.json();
      if (!shortRes.ok || !short.access_token) { log('warn', 'instagram.token_failed', { status: shortRes.status }); return { ok: false, reason: 'token_failed' }; }
      // Exchange for a long-lived (60-day) token.
      const ll = new URL('https://graph.instagram.com/access_token');
      ll.searchParams.set('grant_type', 'ig_exchange_token');
      ll.searchParams.set('client_secret', this.settings.getSecret('meta_app_secret'));
      ll.searchParams.set('access_token', short.access_token);
      const longRes = await fetch(ll);
      const long = await longRes.json();
      const token = long.access_token || short.access_token;
      await this.settings.setSecret('instagram_token', token);
      this.data.tokenExpiresAt = long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null;
      this.pendingState = null;
      await this.fetchAccount();
      await this.save();
      return { ok: true };
    } catch (err) {
      log('warn', 'instagram.connect_error', { error: String(err?.message || err) });
      return { ok: false, reason: 'error' };
    }
  }

  async api(pathname, params = {}) {
    const u = new URL(pathname.startsWith('http') ? pathname : GRAPH + pathname);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    if (!u.searchParams.has('access_token')) u.searchParams.set('access_token', this.token());
    const res = await fetch(u);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body?.error?.message || `HTTP ${res.status}`);
      err.status = res.status;
      err.igCode = body?.error?.code;
      throw err;
    }
    return body;
  }

  async fetchAccount() {
    this.data.account = await this.api('/me', { fields: 'user_id,username,account_type,media_count,followers_count' });
  }

  async refreshTokenIfNeeded() {
    const exp = this.data.tokenExpiresAt ? Date.parse(this.data.tokenExpiresAt) : 0;
    if (!exp || exp - Date.now() > 10 * 864e5) return;
    try {
      const r = await this.api('https://graph.instagram.com/refresh_access_token', { grant_type: 'ig_refresh_token' });
      if (r.access_token) {
        await this.settings.setSecret('instagram_token', r.access_token);
        this.data.tokenExpiresAt = new Date(Date.now() + (r.expires_in || 5184000) * 1000).toISOString();
      }
    } catch (e) { log('warn', 'instagram.refresh_failed', { error: String(e.message) }); }
  }

  /** Pull recent posts + per-post insights. Unavailable metrics stay null (never estimated). */
  async sync({ limit = 60 } = {}) {
    if (!this.token()) return { ok: false, reason: 'not_connected' };
    await this.refreshTokenIfNeeded();
    try { await this.fetchAccount(); } catch (e) { if (e.status === 401 || e.igCode === 190) return { ok: false, reason: 'expired' }; throw e; }
    const out = [];
    let next = null;
    let page = await this.api('/me/media', { fields: MEDIA_FIELDS, limit: '25' });
    while (page) {
      out.push(...(page.data || []));
      next = page.paging?.next;
      if (!next || out.length >= limit) break;
      page = await this.api(next);
    }
    const unavailable = new Set();
    for (const m of out.slice(0, limit)) {
      const isReel = m.media_product_type === 'REELS';
      const metrics = isReel
        ? ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions', 'ig_reels_avg_watch_time']
        : ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions'];
      m.insights = {};
      for (const metric of metrics) {
        try {
          const r = await this.api(`/${m.id}/insights`, { metric });
          const v = r.data?.[0]?.values?.[0]?.value ?? r.data?.[0]?.total_value?.value;
          m.insights[metric] = typeof v === 'number' ? v : null;
        } catch {
          m.insights[metric] = null;
          unavailable.add(metric);
        }
      }
      // Real video length: read the container header of the user's own video (no full download).
      if ((m.media_type === 'VIDEO' || isReel) && m.media_url) {
        try { m.duration = Math.round((await probe(m.media_url)).duration * 10) / 10; } catch { m.duration = null; }
      }
      delete m.media_url; // short-lived CDN URL; don't keep
    }
    this.data.media = out.slice(0, limit);
    this.data.unavailable = [...unavailable];
    this.data.syncedAt = new Date().toISOString();
    await this.save();
    return { ok: true, posts: this.data.media.length, unavailable: this.data.unavailable };
  }

  async disconnect() {
    await this.settings.setSecret('instagram_token', null);
    this.data.account = null;
    this.data.media = [];
    this.data.syncedAt = null;
    this.data.tokenExpiresAt = null;
    await this.save();
  }

  contentDna() { return computeContentDna(this.data.media); }

  /** "What should I post next?" — Claude when available, otherwise data-only suggestions. */
  async coach(question, settings) {
    const dna = this.contentDna();
    if (!dna.enough) return { ok: true, via: 'rules', answer: [T('עדיין אין מספיק נתונים. סנכרנו לפחות 8 פוסטים כדי לקבל המלצות אמינות.', 'Not enough data yet. Sync at least 8 posts to get reliable recommendations.')], ideas: [] };
    if (this.ai.available('chat') && settings.privacy.sendTranscriptsToAI !== false) {
      const top = [...this.data.media].sort((a, b) => (score(b) ?? 0) - (score(a) ?? 0)).slice(0, 8).map((m) => ({ caption: (m.caption || '').slice(0, 300), type: m.media_product_type, duration: m.duration, perf: score(m) }));
      const schema = { type: 'object', additionalProperties: false, required: ['summary', 'ideas'], properties: {
        summary: { type: 'string' },
        ideas: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'hook', 'format', 'length', 'why'], properties: { title: { type: 'string' }, hook: { type: 'string' }, format: { type: 'string' }, length: { type: 'string' }, why: { type: 'string' } } } },
      } };
      try {
        const lang = settings.lang === 'he' ? 'Hebrew' : 'English';
        const r = await this.ai.coach(`You are a content coach for a small business creator. Use ONLY the provided data. State uncertainty honestly; correlations are not causes. Answer in ${lang}. Suggest 3-5 concrete next videos.`,
          JSON.stringify({ question: question || 'What should I post next?', contentDna: dna, topPosts: top, brand: settings.brand?.name || null }), schema);
        return { ok: true, via: 'ai', answer: [{ he: r.summary, en: r.summary }], ideas: r.ideas };
      } catch (e) { log('warn', 'coach.ai_failed', { error: String(e.message) }); }
    }
    const ideas = dna.insights.filter((i) => i.confidence !== 'low').slice(0, 4).map((i) => ({ title: i.text.en, hook: '', format: '', length: '', why: i.text.he }));
    return { ok: true, via: 'rules', answer: dna.insights.slice(0, 3).map((i) => i.text), ideas };
  }
}

/** Primary performance number for a post: views when available, else reach, else interactions. */
export function score(m) {
  const i = m.insights || {};
  return i.views ?? i.reach ?? (m.like_count != null ? (m.like_count + 3 * (m.comments_count || 0)) : null);
}

const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};

function confidence(nA, nB, ratio) {
  if (nA >= 10 && nB >= 10 && ratio >= 1.3) return 'high';
  if (nA >= 5 && nB >= 5 && ratio >= 1.2) return 'medium';
  return 'low';
}

/**
 * Content DNA: compares the median performance of groups of posts. Every insight lists sample sizes and
 * a confidence level, and is phrased as an association ("appear to perform better"), never a cause.
 */
export function computeContentDna(media) {
  const posts = (media || []).map((m) => ({ ...m, perf: score(m) })).filter((m) => m.perf != null);
  const out = { enough: posts.length >= 8, posts: posts.length, insights: [], best: {} };
  if (!out.enough) return out;
  const overall = median(posts.map((p) => p.perf));
  const er = posts.filter((p) => p.insights?.reach && p.insights?.total_interactions != null).map((p) => p.insights.total_interactions / p.insights.reach);
  out.medianPerf = overall;
  out.engagementRate = er.length >= 5 ? Math.round(median(er) * 1000) / 10 : null;

  const dims = [
    { key: 'length', label: T('אורך', 'Length'), get: (p) => p.duration == null ? null : p.duration < 15 ? '<15s' : p.duration < 30 ? '15–30s' : p.duration < 60 ? '30–60s' : '60s+' },
    { key: 'format', label: T('פורמט', 'Format'), get: (p) => p.media_product_type === 'REELS' ? 'Reels' : p.media_type === 'CAROUSEL_ALBUM' ? 'Carousel' : p.media_type === 'IMAGE' ? 'Photo' : 'Video' },
    { key: 'day', label: T('יום', 'Day'), get: (p) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(p.timestamp).getDay()] },
    { key: 'time', label: T('שעה', 'Time'), get: (p) => { const h = new Date(p.timestamp).getHours(); return h < 11 ? 'morning' : h < 16 ? 'afternoon' : h < 20 ? 'evening' : 'night'; } },
    { key: 'caption', label: T('אורך כיתוב', 'Caption length'), get: (p) => { const n = (p.caption || '').length; return n < 80 ? 'short' : n < 300 ? 'medium' : 'long'; } },
    { key: 'hashtags', label: T('האשטגים', 'Hashtags'), get: (p) => { const n = ((p.caption || '').match(/#\S+/g) || []).length; return n === 0 ? '0' : n <= 5 ? '1–5' : '6+'; } },
    { key: 'question', label: T('שאלה בכיתוב', 'Question in caption'), get: (p) => (/[?？]/.test(p.caption || '') ? 'yes' : 'no') },
  ];
  for (const d of dims) {
    const groups = {};
    for (const p of posts) { const g = d.get(p); if (g != null) (groups[g] ||= []).push(p.perf); }
    const entries = Object.entries(groups).filter(([, v]) => v.length >= 3).map(([g, v]) => ({ g, n: v.length, med: median(v) }));
    if (entries.length < 2) continue;
    entries.sort((a, b) => b.med - a.med);
    const best = entries[0];
    const rest = entries.slice(1).flatMap((e) => groups[e.g]);
    const ratio = best.med / (median(rest) || 1);
    const conf = confidence(best.n, rest.length, ratio);
    out.best[d.key] = { value: best.g, n: best.n, ratio: Math.round(ratio * 100) / 100, confidence: conf };
    if (ratio >= 1.1) {
      out.insights.push({
        key: d.key, value: best.g, confidence: conf, n: best.n, others: rest.length, lift: Math.round((ratio - 1) * 100),
        text: T(`פוסטים עם ${d.label.he} "${best.g}" נראים כמביאים כ-${Math.round((ratio - 1) * 100)}% יותר צפיות (${best.n} פוסטים מול ${rest.length}). זה קשר בנתונים, לא הוכחה לסיבה.`,
          `Posts with ${d.label.en.toLowerCase()} "${best.g}" appear to get ~${Math.round((ratio - 1) * 100)}% more views (${best.n} vs ${rest.length} posts). This is a correlation, not proof of cause.`),
      });
    }
  }
  const rank = { high: 0, medium: 1, low: 2 };
  out.insights.sort((a, b) => rank[a.confidence] - rank[b.confidence] || b.lift - a.lift);
  // Hint for the AI Director: preferred length when the evidence is at least medium.
  const L = out.best.length;
  if (L && L.confidence !== 'low') out.directorHint = { targetDuration: { '<15s': 12, '15–30s': 25, '30–60s': 45, '60s+': 60 }[L.value], confidence: L.confidence };
  return out;
}
