// Cloud AI (Claude) — used only when the user added a key, and only with compact, non-media context.
// Everything AutoEdit needs also works locally without it; the AI makes requests smarter, not possible.
import Anthropic from '@anthropic-ai/sdk';
import { OP_SCHEMA } from './nlEdit.js';
import { log } from './log.js';

const MODEL = 'claude-opus-5-5';

const OPS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ops'],
  properties: {
    ops: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['op', 'value'],
        properties: {
          op: { type: 'string', enum: Object.keys(OP_SCHEMA) },
          value: { anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }] },
        },
      },
    },
  },
};

const EDIT_SYSTEM = `You are the AI Director inside AutoEdit, a video editor for people who don't know editing.
Translate the user's change request (Hebrew or English) into edit operations for the CURRENT video.
Operations:
- duration (number, seconds 5-600): target length
- cutHead (number, seconds): remove this much from the start
- pace (number 0.5-2, relative multiplier; 1.3 = faster)
- zoom (number 0-2, relative multiplier; 0 = no zoom)
- effects (0 or 1): 0 = minimal/no effects
- style ("viral" | "cinematic" | "premium")
- captionStyle ("minimal"|"bold"|"modern"|"luxury"|"viral"|"corporate"|"creator"|"none")
- hookFirst (boolean): open with the strongest moment
- logoEnd (boolean)
- musicVolume (number 0-2, relative)
- voice ("natural"|"clear"|"studio")
- look ("clean"|"social"|"cinematic"|"luxury"|"warm"|"cold")
- platform ("instagram"|"tiktok"|"shorts"|"youtube")
- improve (true): user asks to make it better without specifics
Return only operations the request actually asks for. If nothing applies, return an empty list.
Quality rule: never add effects the user didn't ask for.`;

export class AI {
  constructor(settings) { this.settings = settings; }

  key() { return this.settings.getSecret('anthropic'); }

  available(kind = 'chat') {
    const s = this.settings.get();
    if (kind === 'chat' && !s.flags.llmDirector) return false;
    return !!this.key();
  }

  client() { return new Anthropic({ apiKey: this.key(), maxRetries: 2, timeout: 60_000 }); }

  async json(system, user, schema, { maxTokens = 4000, effort = 'low' } = {}) {
    const res = await this.client().beta.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { effort, format: { type: 'json_schema', schema } },
    });
    if (res.stop_reason === 'refusal') throw new Error('ai_refused');
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    return JSON.parse(text);
  }

  async mapEditRequest(text, context) {
    const out = await this.json(EDIT_SYSTEM, `Current video context (JSON):\n${JSON.stringify(context)}\n\nUser request:\n${text}`, OPS_SCHEMA);
    log('info', 'ai.map_edit', { ops: out.ops?.length || 0 });
    return out.ops || [];
  }

  /** Validates a key with a tiny request; returns a user-friendly result. */
  async testKey(key) {
    try {
      const c = new Anthropic({ apiKey: key, maxRetries: 0, timeout: 20_000 });
      await c.messages.create({ model: MODEL, max_tokens: 16, output_config: { effort: 'low' }, messages: [{ role: 'user', content: 'Reply with OK.' }] });
      return { ok: true };
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) return { ok: false, reason: 'invalid_key' };
      if (err instanceof Anthropic.PermissionDeniedError) return { ok: false, reason: 'no_permission' };
      if (err instanceof Anthropic.RateLimitError) return { ok: true, warning: 'rate_limited' };
      if (err instanceof Anthropic.APIConnectionError) return { ok: false, reason: 'offline' };
      return { ok: false, reason: 'error' };
    }
  }

  /** Generic structured call used by the Content Coach. */
  async coach(system, payload, schema) { return this.json(system, payload, schema, { maxTokens: 8000, effort: 'medium' }); }
}
