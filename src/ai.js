/* ==========================================================================
   Liahona — reflection engine

   Two engines exist, and the app is explicit about which one produced an
   answer:

   • on-device — fully offline. Retrieval over the downloaded verses plus the
                 study notes, assembled into a structured reflection. No
                 network, no key, nothing invented beyond what the text says.
   • cloud     — an OpenAI-compatible /chat/completions endpoint. Provider,
                 model, and key live in the PRIMARY/SECONDARY constants below
                 (one config block — there is no Settings UI for it). Every
                 answer is grounded in retrieved scripture first, and Ask falls
                 back to the on-device engine whenever every provider is
                 unreachable or throttled — on-device is the last resort, never
                 the default.

   The on-device engine never claims to be a language model.
   ========================================================================== */
window.AI = (function () {
  'use strict';

  /* ------------------------------------------------- provider configuration
     Swap providers by editing these constants only. Any OpenAI-compatible
     /chat/completions host works: DeepSeek, Google Gemini (its OpenAI-compatible
     endpoint), Groq, OpenRouter, a local Ollama/vLLM box, and so on. PRIMARY is
     tried first; SECONDARY (optional) covers 429s and outages automatically.
     For local use at 127.0.0.1 a key constant is fine; if the app is ever
     hosted publicly, move the key into a tiny Cloudflare Worker proxy so it is
     never shipped to browsers. */
  const PRIMARY_ENDPOINT = 'https://api.llm7.io/v1/chat/completions';
  const PRIMARY_MODEL = 'DeepSeek-V4-Flash-0731';
  const PRIMARY_API_KEY = ''; // keyless anonymous gateway — leave empty

  const SECONDARY_ENDPOINT = ''; // e.g. 'https://api.deepseek.com/v1/chat/completions'
  const SECONDARY_MODEL = '';
  const SECONDARY_API_KEY = '';

  const AI_LIMITS = {
    maxAnswerTokens: 700,        // capped per completion
    maxContextVerses: 12,        // verses handed to the model
    maxContextEntries: 14,       // verses + chapter frame + note lines combined
    maxVerseChars: 1200,         // per-verse text cap
    maxHistory: 6,               // turns carried into the prompt
    requestTimeoutMs: 30000,     // watchdog for a single completion
    quotaBackoffMs: 60 * 60 * 1000,  // 429 without a wait hint → pause provider
    serverBackoffMs: 5 * 60 * 1000,  // 5xx → brief pause, then switch
    cacheMax: 40,
    cacheTtlMs: 30 * 60 * 1000,  // answers are reusable for ~30 minutes
  };

  const PROVIDER_CHAIN = [
    { id: 'primary', endpoint: PRIMARY_ENDPOINT, model: PRIMARY_MODEL, apiKey: PRIMARY_API_KEY },
    { id: 'secondary', endpoint: SECONDARY_ENDPOINT, model: SECONDARY_MODEL, apiKey: SECONDARY_API_KEY },
  ].filter((p) => p.endpoint && p.model);

  /* Per-provider cooldowns, remembered only in memory. A 429 means that
     provider is throttled for a while; the chain moves on and gives it another
     chance on a fresh page load. */
  const providerBlocks = new Map(PROVIDER_CHAIN.map((p) => [p.id, 0]));

  /* Reusable answers are cached by normalized question + anchor + passage refs,
     so a repeated question never spends the quota twice. */
  const ANSWER_CACHE = new Map();
  const CACHE_STAMP = new Map();

  function cachePing() {
    const now = Date.now();
    for (const [key, at] of CACHE_STAMP) {
      if (now - at > AI_LIMITS.cacheTtlMs) {
        ANSWER_CACHE.delete(key);
        CACHE_STAMP.delete(key);
      }
    }
  }

  function cacheKeyFor(question, anchorKey, refs) {
    return JSON.stringify([
      String(question).toLowerCase().replace(/\s+/g, ' ').trim(),
      String(anchorKey || ''),
      (refs || []).map((r) => String(r || '').toLowerCase()).sort().join('|'),
    ]);
  }

  function cacheStore(key, value) {
    cachePing();
    if (ANSWER_CACHE.has(key)) ANSWER_CACHE.delete(key);
    ANSWER_CACHE.set(key, value);
    CACHE_STAMP.set(key, Date.now());
    if (ANSWER_CACHE.size > AI_LIMITS.cacheMax) {
      const oldest = ANSWER_CACHE.keys().next().value;
      ANSWER_CACHE.delete(oldest);
      CACHE_STAMP.delete(oldest);
    }
  }

  function cacheGet(key) {
    cachePing();
    return CACHE_STAMP.has(key) ? ANSWER_CACHE.get(key) : null;
  }

  function providerBlockedAt(id) {
    return providerBlocks.get(id) || 0;
  }

  function markProviderBlocked(id, detail) {
    const match = String(detail || '').match(/retry\s+after\s+(\d+)\s*seconds?/i);
    const waitMs = match ? Number(match[1]) * 1000 : AI_LIMITS.quotaBackoffMs;
    const until = Math.max(providerBlockedAt(id), Date.now() + waitMs);
    providerBlocks.set(id, until);
    console.warn(
      '[Ask] ' + id + ' is throttled (' + (detail || 'HTTP 429') +
        ') — switching provider and pausing it until ' + new Date(until).toLocaleTimeString() + '.'
    );
  }

  function markProviderDown(id, detail) {
    const until = Math.max(providerBlockedAt(id), Date.now() + AI_LIMITS.serverBackoffMs);
    providerBlocks.set(id, until);
    console.warn(
      '[Ask] ' + id + ' server error (' + (detail || 'HTTP 5xx') +
        ') — noting a temporary outage and trying the next provider.'
    );
  }

  function quietFallbackNotice() {
    return 'The service is unavailable right now, so this answer was composed from the scriptures on your device.';
  }

  const STOPWORDS = new Set(
    ('a about all am an and any are as at be been being but by can could did do does doing ' +
      'for from had has have having he her here hers him his how i if in into is it its me my ' +
      'of on or our ours she should so some that the their them then there these they this to ' +
      'was we were what when where which who whom why will with would you your yours ' +
      'tell me explain about what does mean saying said word verse passage scripture book mormon ' +
      'question answer please help understand').split(/\s+/)
  );

  const REFLECTIVE_TEMPLATES = [
    (topic) => `What would it look like to apply “${topic}” in a decision you face this week?`,
    (topic) => `Which of these passages speaks most directly to your situation, and why that one?`,
    (topic) => `Where have you already lived this principle without naming it?`,
    (topic) => `What would you need to change to live “${topic}” more fully?`,
  ];

  /* ------------------------------------------------------------- helpers */

  function contentTerms(question) {
    const words = String(question || '')
      .toLowerCase()
      .match(/[a-z0-9’']+/g) || [];
    return words.filter((w) => w.length > 2 && !STOPWORDS.has(w));
  }

  function detectIntent(question) {
    const q = String(question || '').toLowerCase().trim();
    if (/^(what is|what are|define|meaning of|what does .* mean)\b/.test(q)) return 'define';
    if (/\b(why|how come|reason|background|historical|context|when did)\b/.test(q)) return 'context';
    if (/\b(compare|difference|versus| vs\.?|contrast)\b/.test(q)) return 'compare';
    if (/\b(how (can|do|should) i|what should i|apply|practical|help me)\b/.test(q)) return 'apply';
    if (/^(where is|which verse|find|locate|show me)\b/.test(q)) return 'locate';
    return 'explore';
  }

  /** Evenly samples hits so we don't return five consecutive verses. */
  function diversify(results, limit) {
    const out = [];
    const usedRefs = new Set();
    const usedChapters = new Set();
    for (const row of results) {
      if (out.length >= (limit || 5)) break;
      const chapterKey = row.verse.bookSlug + '/' + row.verse.chapter;
      const refKey = row.verse.key;
      if (usedRefs.has(refKey)) continue;
      if (usedChapters.has(chapterKey) && out.length < 2) continue;
      out.push(row);
      usedRefs.add(refKey);
      usedChapters.add(chapterKey);
    }
    if (out.length < (limit || 5)) {
      for (const row of results) {
        if (out.length >= (limit || 5)) break;
        if (usedRefs.has(row.verse.key)) continue;
        out.push(row);
        usedRefs.add(row.verse.key);
      }
    }
    return out;
  }

  /* --------------------------------------------------- local composition */

  function composeLocal(question, anchorKey) {
    const anchor = anchorKey ? Scripture.verseByKey(anchorKey) : null;
    const terms = contentTerms(question);
    const intent = detectIntent(question);

    // 1. an explicit reference in the question wins
    const refMatch = String(question || '').match(
      /\b(1 Nephi|2 Nephi|3 Nephi|4 Nephi|Jacob|Enos|Jarom|Omni|Words of Mormon|Mosiah|Alma|Helaman|Mormon|Ether|Moroni)\s+(\d+)(?::(\d+))?/i
    );
    let resolved = null;
    if (refMatch) {
      resolved = Scripture.resolveReference(refMatch[0], anchor ? anchor.bookSlug : null);
    }

    // 2. otherwise retrieve
    let hits = [];
    let searchTerms = terms;
    if (!searchTerms.length && anchor) searchTerms = contentTerms(anchor.text);
    if (searchTerms.length) {
      const q = Scripture.search(searchTerms.slice(0, 6).join(' '), { limit: 40 });
      hits = diversify(q.results, 6);
    }

    // 3. assemble the anchor set
    const primary = [];
    if (resolved && (resolved.chapter || resolved.verse)) {
      const v = Scripture.verse(resolved.bookSlug, resolved.chapter, resolved.verse);
      if (v) primary.push(v);
    }
    if (anchor && !primary.some((p) => p.key === anchor.key)) primary.push(anchor);
    hits.forEach((h) => {
      if (primary.length >= 3) return;
      if (!primary.some((p) => p.key === h.verse.key)) primary.push(h.verse);
    });

    if (!primary.length) {
      return {
        mode: 'local',
        title: 'Nothing in the text matched',
        paragraphs: [
          `No verse in the Book of Mormon contains ${terms.length ? `“${terms.join('”, “')}”` : 'that phrasing'}.`,
          'Try a single keyword, or ask for a reference directly — for example “2 Nephi 2:15” or “Alma 37:6”.',
        ],
        sources: [],
        notes: [],
        prompts: ['faith', 'forgiveness', 'patience', 'prophecy'].map((t) => `What does ${t} look like in the Book of Mormon?`),
      };
    }

    const paragraphs = [];
    const sources = [];
    const notes = [];
    const prompts = [];

    /* --- opening: the verses themselves, quoted --- */
    const quotes = primary.slice(0, 3).map((v) => {
      sources.push({ key: v.key, reference: v.reference });
      return `“${v.text}” — ${v.reference}`;
    });
    paragraphs.push(quotes.join(' '));

    /* --- intent-aware framing --- */
    if (intent === 'define') {
      paragraphs.push(
        'The clearest definition in the text comes from the verse above. Read the phrase without paraphrasing it, then read the surrounding verses in context — the Book of Mormon tends to define by narrative rather than by sentence.'
      );
    } else if (intent === 'context') {
      paragraphs.push('For background, open the chapter and read the surrounding verses; the argument unfolds across a chapter rather than inside one line.');
    } else if (intent === 'compare') {
      paragraphs.push('Open each passage side by side in the reader and compare what each says about the outcome, not just the words used.');
    } else if (intent === 'apply') {
      paragraphs.push('To apply this, name the specific decision in front of you, then read the passage as instruction rather than description.');
    } else {
      paragraphs.push('These are the passages in the text that carry the most weight on your question.');
    }

    /* --- cross-references the official study notes cite --- */
    for (const verse of primary.slice(0, 2)) {
      const crossRefs = Scripture.crossReferencesFor(verse.bookSlug, verse.chapter, verse.verse);
      if (crossRefs.length) {
        notes.push(
          `The study notes on ${verse.reference} cite: ` +
            crossRefs.map((c) => c.reference).join(', ') + '.'
        );
      }
    }

    /* --- further passages --- */
    const more = hits
      .filter((h) => !primary.some((p) => p.key === h.verse.key))
      .slice(0, 3);
    if (more.length) {
      sources.push(...more.map((h) => ({ key: h.verse.key, reference: h.verse.reference })));
      paragraphs.push(
        'Related: ' + more.map((h) => `${h.verse.reference} “${UI.esc(h.verse.text.slice(0, 90))}${h.verse.text.length > 90 ? '…' : ''}”`).join('  ')
      );
    }

    /* --- reflective close --- */
    const topic = terms[0] || (anchor ? contentTerms(anchor.text)[0] : null);
    if (topic) {
      prompts.push(REFLECTIVE_TEMPLATES[0](topic));
      prompts.push(REFLECTIVE_TEMPLATES[1](topic));
    }
    prompts.push(`What is the context of ${primary[0].reference}?`);
    if (primary[0]) prompts.push(`How would you apply ${primary[0].reference} today?`);

    return {
      mode: 'local',
      title: primary[0].reference,
      paragraphs,
      sources: dedupeSources(sources),
      notes,
      prompts: prompts.slice(0, 4),
      intent,
    };
  }

  function dedupeSources(sources) {
    const seen = new Set();
    return sources.filter((s) => {
      if (seen.has(s.key)) return false;
      seen.add(s.key);
      return true;
    });
  }

  /* ----------------------------------------------------------- api mode */

  /** A local inference server never needs a key. */
  function isLocalEndpoint(endpoint) {
    try {
      return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(new URL(endpoint).hostname);
    } catch (_) {
      return false;
    }
  }

  /** The free Puter provider needs neither endpoint nor key. */
  function isPuter(cfg) {
    return !!(cfg && (cfg.sdk === 'puter' || /^puter$/i.test(String(cfg.endpoint || '').trim())));
  }

  /** Keyless anonymous gateways (e.g. LLM7) accept a placeholder "key". */
  function isKeylessAnon(endpoint) {
    try {
      return /llm7\.io/i.test(new URL(endpoint).hostname);
    } catch (_) {
      return false;
    }
  }

  let puterPromise = null;
  /** Injects the Puter SDK on demand; resolves to whether it is usable. */
  function ensurePuter() {
    if (window.puter) return Promise.resolve(true);
    if (puterPromise) return puterPromise;
    puterPromise = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'https://js.puter.com/v2/';
      s.async = true;
      s.onload = () => resolve(!!window.puter);
      s.onerror = () => {
        puterPromise = null;
        resolve(false);
      };
      document.head.appendChild(s);
      setTimeout(() => resolve(!!window.puter), 15000);
    });
    return puterPromise;
  }

  /** Retrieves the passages most relevant to the question: the anchor verse
      plus its footnote cross-references, then keyword hits boosted toward the
      current book and chapter (the anchor's own verse always ranks highest),
      capped to fit the model context. Every pick resolves to a real verse key
      so Ask can link it back into the reader. */
  function buildGrounding(question, anchorKey) {
    const anchor = anchorKey ? Scripture.verseByKey(anchorKey) : null;
    const terms = contentTerms(question);
    const picked = new Map(); // verse.key -> weight

    const addCandidate = (verse, boost) => {
      if (!verse || picked.has(verse.key)) return;
      picked.set(verse.key, boost);
    };

    // The anchor verse (where the reader currently is) and the verses its
    // study notes cross-reference always sit at the top of the context.
    if (anchor) {
      addCandidate(anchor, 12);
      Scripture.crossReferencesFor(anchor.bookSlug, anchor.chapter, anchor.verse)
        .slice(0, 4)
        .forEach((v) => addCandidate(v, 6));
    }

    // Keyword retrieval, boosted toward the current book and chapter so the
    // answer stays close to where the reader is studying.
    if (terms.length) {
      const q = Scripture.search(terms.slice(0, 6).join(' '), { limit: 24 });
      for (const row of q.results) {
        let boost = 2 + Math.log2(row.score || 1);
        if (!anchor) boost += 2;
        if (anchor && row.verse.bookSlug === anchor.bookSlug) boost += 3;
        if (anchor && row.verse.chapter === anchor.chapter) boost += 3;
        addCandidate(row.verse, boost);
      }
    }

    // If nothing matched the wording directly, let the local engine's
    // retrieval stand in so the model always has some text to answer from.
    if (!picked.size) {
      const local = composeLocal(question, anchorKey);
      (local.sources || []).slice(0, 6).forEach((s) => {
        const v = Scripture.verseByKey(s.key);
        if (v) addCandidate(v, 1);
      });
    }

    const best = [...picked.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, AI_LIMITS.maxContextVerses)
      .map(([key]) => Scripture.verseByKey(key))
      .filter(Boolean);

    const corpus = [];
    if (anchor) {
      const ch = Scripture.chapter(anchor.bookSlug, anchor.chapter);
      const frame = [ch && ch.summary, ch && ch.intro].filter(Boolean).join(' ');
      if (frame) corpus.push({ ref: 'Chapter ' + anchor.bookSlug + ' ' + anchor.chapter, text: frame });
    }
    for (const v of best) {
      corpus.push({ key: v.key, ref: v.reference, text: String(v.text || '').slice(0, AI_LIMITS.maxVerseChars) });
    }
    if (anchor) {
      Scripture.footnotesFor(anchor.bookSlug, anchor.chapter, anchor.verse)
        .slice(0, 3)
        .forEach((n) =>
          corpus.push({ ref: anchor.reference + ' note ' + n.marker, text: String(n.text || '').slice(0, 300) })
        );
    }

    return corpus.slice(0, AI_LIMITS.maxContextEntries);
  }

  const SYSTEM_PROMPT =
    'You are a careful scripture-study companion for The Book of Mormon, working ' +
    'only against the passages downloaded on this device. The PROVIDED PASSAGES ' +
    'block lists verses, chapter summaries, and study-note cross-references; each ' +
    'has a reference header like [1 Nephi 3:7] or [Chapter 1 Nephi 1].\n\n' +
    'Answer the QUESTION directly in plain language with 2-4 short paragraphs. ' +
    'Reason from the provided passages only — never from outside knowledge. Cite ' +
    'every claim with its verse reference in parentheses, e.g. (1 Nephi 2:23), ' +
    'using exactly the reference shown for that passage. When it helps, explain ' +
    'the context: who is speaking, to whom, and why. If the provided passages do ' +
    'not answer the question, say so plainly and honestly instead of guessing. Be ' +
    'respectful and doctrinally careful; never invent quotes, references, or events.\n\n' +
    'End your answer with a line starting with "FOLLOW-UP:" followed by 3 or 4 ' +
    'short follow-up questions, one per line, that continue studying this answer. ' +
    'If you could not answer, write "FOLLOW-UP:" and nothing after it.';

  /** Keeps the last ~6 non-empty turns and strips junk from assistant copies. */
  function normalizeHistory(history, currentQuestion) {
    const turns = Array.isArray(history) ? history.slice() : [];
    if (turns.length) {
      const last = turns[turns.length - 1];
      if (last && last.role === 'user' && String(last.text || '').trim() === String(currentQuestion || '').trim()) {
        turns.pop(); // the live question is appended as the final user turn
      }
    }
    return turns
      .filter((t) => t && (t.role === 'user' || t.role === 'assistant'))
      .slice(-AI_LIMITS.maxHistory)
      .map((t) => {
        let content = '';
        if (t.role === 'user') content = String(t.text || '');
        else content = (Array.isArray(t.paragraphs) ? t.paragraphs : [t.text || '']).join('\n\n');
        content = String(content || '').replace(/\n?\s*FOLLOW-UP:.+$/is, '').trim().slice(0, 1400);
        return content ? { role: t.role, content } : null;
      })
      .filter(Boolean);
  }

  function buildMessages(history, grounding, question) {
    const contextText = grounding.map((g) => `[${g.ref}]\n${g.text}`).join('\n\n');
    const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
    messages.push(...normalizeHistory(history, question));
    messages.push({ role: 'user', content: 'PROVIDED PASSAGES\n' + contextText + '\n\nQUESTION\n' + question });
    return messages;
  }

  /** Splits the model reply into paragraphs and follow-up questions. */
  function parseApiAnswer(content, grounding) {
    let text = String(content || '').trim();
    let prompts = [];
    const followAt = text.lastIndexOf('FOLLOW-UP:');
    if (followAt !== -1) {
      const tail = text.slice(followAt + 'FOLLOW-UP:'.length);
      text = text.slice(0, followAt).trim();
      prompts = tail
        .split(/\n+/)
        .map((line) => line.replace(/^[\s-–—•*\d.)]+/, '').trim())
        .filter((line) => line.length > 8 && !/^follow-?up:?$/i.test(line))
        .slice(0, 4);
    }
    const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    if (!paragraphs.length) paragraphs.push('No answer came back — please try again.');
    const sources = grounding
      .filter((g) => g.key)
      .map((g) => ({ key: g.key, reference: g.ref }));
    return {
      mode: 'api',
      title: '',
      paragraphs,
      sources,
      notes: [],
      prompts,
      groundedOn: grounding.length,
    };
  }

  async function apiError(response) {
    let detail = '';
    try {
      const body = await response.json();
      detail = (body.error && body.error.message) || '';
    } catch (_) { /* body was not json */ }
    const err = new Error(`Endpoint returned ${response.status}${detail ? ': ' + detail : ''}`);
    err.status = response.status;
    err.detail = detail || '';
    return err;
  }

  function pickContent(payload) {
    const choice = payload && payload.choices && payload.choices[0];
    if (!choice) return '';
    const content = (choice.message && choice.message.content) || choice.text || '';
    return String(content || '');
  }

  async function readSse(response, onDelta) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        let json;
        try {
          json = JSON.parse(data);
        } catch (_) {
          continue;
        }
        const delta =
          json && json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content;
        if (typeof delta === 'string' && delta) {
          full += delta;
          if (onDelta) onDelta(full);
        }
      }
    }
    if (!full) throw new Error('The endpoint returned an empty answer.');
    return full;
  }

  /** One OpenAI-compatible completion, streaming when the caller listens. */
  async function streamChatCompletion(provider, messages, onDelta, signal) {
    const headers = { 'content-type': 'application/json' };
    if (provider.apiKey) headers.authorization = 'Bearer ' + provider.apiKey;
    else if (isKeylessAnon(provider.endpoint)) headers.authorization = 'Bearer unused';
    if (/openrouter\.ai/i.test(provider.endpoint)) headers['x-title'] = 'Liahona';

    let response;
    try {
      response = await fetch(provider.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: provider.model,
          temperature: 0.3,
          max_tokens: AI_LIMITS.maxAnswerTokens,
          stream: true,
          messages,
        }),
        signal,
      });
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      throw new Error('Network error — could not reach the endpoint.');
    }

    if (!response.ok) throw await apiError(response);

    const ctype = (response.headers.get('content-type') || '').toLowerCase();
    if (ctype.indexOf('text/event-stream') === -1) {
      // the endpoint ignored stream:true and answered in one JSON body
      const payload = await response.json();
      const full = pickContent(payload);
      if (!full) throw new Error('The endpoint returned an empty answer.');
      if (onDelta) onDelta(full);
      return full;
    }

    return await readSse(response, onDelta);
  }

  /** Bounds the request so a stalled cloud call still lets Ask fall back to
      the on-device engine instead of hanging on "Writing…" forever. */
  async function callApi(provider, messages, onDelta) {
    const controller = new AbortController();
    const watchdog = setTimeout(() => controller.abort(), AI_LIMITS.requestTimeoutMs);
    try {
      return await streamChatCompletion(provider, messages, onDelta, controller.signal);
    } catch (err) {
      if (err && err.name === 'AbortError') {
        throw Object.assign(new Error('The cloud answer took too long.'), { status: 408 });
      }
      throw err;
    } finally {
      clearTimeout(watchdog);
    }
  }

  /* -------------------------------------------------------------- public */

  function isApiEnabled() {
    return PROVIDER_CHAIN.length > 0;
  }

  /**
   * Produces a reflection. Tries every cloud provider in order (primary then
   * secondary), streams the answer when a listener is attached, and reserves
   * the on-device engine as the last resort. Reports which path was taken, and
   * keeps the reason for any fallback quiet in the UI.
   */
  async function reflect(question, anchorKey, opts) {
    const text = String(question || '').trim();
    if (!text) throw new Error('Ask something first.');

    const options = opts || {};
    const history = options.history || [];
    const onDelta = typeof options.onDelta === 'function' ? options.onDelta : null;

    const grounding = buildGrounding(text, anchorKey);
    if (!grounding.length) return composeLocal(text, anchorKey);
    const cacheKey = cacheKeyFor(text, anchorKey, grounding.map((g) => g.ref));

    // Pure on-device mode (both endpoint constants left blank).
    if (!PROVIDER_CHAIN.length) {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return composeLocal(text, anchorKey);
    }

    const cached = cacheGet(cacheKey);
    if (cached) {
      const raw = cached.raw || (cached.paragraphs || []).join('\n\n');
      if (onDelta && raw) onDelta(raw);
      return cached;
    }

    for (const provider of PROVIDER_CHAIN) {
      if (Date.now() < providerBlockedAt(provider.id)) continue;
      try {
        const messages = buildMessages(history, grounding, text);
        const answer = await callApi(provider, messages, onDelta);
        const entry = Object.assign(parseApiAnswer(answer, grounding), {
          fallback: false,
          warning: '',
          raw: answer,
        });
        cacheStore(cacheKey, entry);
        return entry;
      } catch (err) {
        if (onDelta) onDelta(''); // clear any half-streamed text
        const status = (err && err.status) || 0;
        if (status === 429) markProviderBlocked(provider.id, err.detail);
        else if (status >= 500) markProviderDown(provider.id, err.detail);
        else console.warn('[Ask] ' + provider.id + ' failed: ' + (err && err.message));
      }
    }

    // Every cloud provider failed or is cooling down — on-device is the last
    // resort. The UI gets a quiet notice; the console holds the detail.
    const fallback = composeLocal(text, anchorKey);
    fallback.fallback = true;
    fallback.prompts = []; // nothing model-derived exists on failure
    fallback.warning = quietFallbackNotice();
    fallback.raw = (fallback.paragraphs || []).join('\n\n');
    cacheStore(cacheKey, fallback);
    return fallback;
  }

  /** Canned prompts shown in the empty Ask view. */
  function suggestions(anchorKey) {
    const anchor = anchorKey ? Scripture.verseByKey(anchorKey) : null;
    const base = [
      'What is the context of ' + (anchor ? anchor.reference : '1 Nephi 3:7') + '?',
      'What does faith mean in the Book of Mormon?',
      'Why did Nephi return to Jerusalem?',
      'How does the Atonement apply to daily repentance?',
      'What does "none other than he hath done it" mean?',
      'Where does the Book of Mormon teach patience?',
    ];
    return base;
  }

  /**
   * Verifies an endpoint + key without sending a scripture prompt. Each
   * provider exposes a lightweight authenticated call; for a generic
   * OpenAI-compatible host this is GET <base>/models.
   */
  async function testConnection(endpoint, apiKey) {
    // The free Puter provider: verify the SDK loads, no key, no REST call.
    if (/^puter$/i.test(String(endpoint || '').trim())) {
      if (window.location.protocol === 'file:') {
        throw new Error('Puter needs the app served over http://localhost — a shortcut is included.');
      }
      const loaded = await ensurePuter();
      if (!loaded) throw new Error('Puter SDK could not be loaded.');
      return { url: 'Puter (js.puter.com)', status: 200 };
    }
    if (!/^https?:\/\//i.test(endpoint)) {
      throw new Error('Enter a valid endpoint URL first.');
    }
    let host = '';
    try {
      host = new URL(endpoint).hostname;
    } catch (_) { /* handled below */ }

    let url;
    let fallbackUrl = null;
    let headers = {};
    try {
      const origin = new URL(endpoint).origin;
      if (/llm7\.io/i.test(host)) {
        // the models catalog is public; sending the placeholder key trips
        // the GET preflight, so test it bare like the browser will anyway
        url = `${origin}/v1/models`;
      } else if (/openrouter\.ai/i.test(host)) {
        url = `${origin}/api/v1/auth/key`;
      } else if (/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(host)) {
        // Local servers expose different health endpoints; try the
        // OpenAI-compatible one first, then the Ollama one.
        url = `${origin}/v1/models`;
        fallbackUrl = `${origin}/api/tags`;
      } else {
        url = AIProviders.baseUrl(endpoint) + '/models';
      }
    } catch (_) {
      throw new Error('The endpoint is not a valid URL.');
    }
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;

    let response;
    try {
      response = await fetch(url, { method: 'GET', headers });
    } catch (err) {
      throw new Error('Could not reach the endpoint over the network.');
    }
    if (!response.ok && fallbackUrl) {
      try {
        response = await fetch(fallbackUrl, { method: 'GET', headers });
      } catch (_) { /* keep the first response */ }
    }
    if (!response.ok) {
      let detail = '';
      try {
        const body = await response.json();
        detail = (body.error && (body.error.message || body.error.code)) || body.message || '';
      } catch (_) { /* not json */ }
      throw new Error(`Connection test failed (HTTP ${response.status})${detail ? `: ${detail}` : ''}`);
    }

    return { url, status: response.status };
  }

  return { reflect, isApiEnabled, suggestions, contentTerms, detectIntent, composeLocal, testConnection, engineName: PRIMARY_MODEL };
})();