/* ==========================================================================
   Ask — scripture-grounded reflection. Runs offline by default.
   ========================================================================== */
window.Views = window.Views || {};

Views.ask = function (ctx) {
  const initial = ctx.query.prompt || '';
  const settings = Store.settings();

  let thread = [];
  let busy = false;

  ctx.setHeader({
    lead: 'brand',
    trail: `<button type="button" data-act="clear" class="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors" aria-label="New conversation">${UI.icon('restart_alt', 'text-[20px]')}</button>`,
    progress: null,
  });

  ctx.root.innerHTML = `
    <section class="pt-space-xs space-y-space-md pb-space-2xl">
      <div class="space-y-0.5">
        <h1 class="font-display-lg-mobile text-display-lg-mobile text-primary tracking-tight">Ask</h1>
        <p class="font-body-md text-body-md text-on-surface-variant">
          ${
            AI.isApiEnabled()
              ? 'Answers grounded in your downloaded text'
              : 'On-device reflection grounded in the Book of Mormon'
          }
        </p>
      </div>

      <div id="ask-thread" class="space-y-space-lg"></div>
    </section>

    <form id="ask-form" class="fixed bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur-xl border-t border-outline-variant px-margin pt-space-sm pb-space-sm" aria-label="Ask a question">
      <div class="max-w-3xl mx-auto flex items-end gap-space-xs">
        <div class="relative flex-1">
          <label for="ask-input" class="sr-only">Your question</label>
          <textarea id="ask-input" rows="1" placeholder="What does the text teach about…"
            class="w-full resize-none max-h-32 bg-surface-container text-on-surface text-body-lg font-body-lg px-space-md py-3 pr-12 rounded-2xl border border-outline-variant focus:border-accent outline-none focus:ring-2 focus:ring-accent/40"></textarea>
          <button type="button" id="ask-mic" aria-label="Dictate question"
            class="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors">
            ${UI.icon('mic', 'text-[18px]')}
          </button>
        </div>
        <button type="submit" id="ask-send" aria-label="Send question"
          class="shrink-0 w-12 h-12 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center shadow-gold active:scale-[.95] transition-transform disabled:opacity-40 disabled:active:scale-100">
          ${UI.icon('arrow_upward', 'text-[22px]')}
        </button>
      </div>
      <p class="max-w-3xl mx-auto mt-1.5 font-marginalia text-marginalia text-on-surface-variant px-1">
        ${
          AI.isApiEnabled()
            ? 'Check every claim against the cited verses before you rely on it.'
            : 'Every answer cites verses from the text on this device.'
        }
      </p>
    </form>`;

  const threadEl = ctx.root.querySelector('#ask-thread');
  const input = ctx.root.querySelector('#ask-input');
  const sendBtn = ctx.root.querySelector('#ask-send');
  const micBtn = ctx.root.querySelector('#ask-mic');

  /* ------------------------------------------------------------ rendering */

  /** Fall back to wherever the reader last was, so Ask is never unanchored. */
  function implicitAnchor() {
    const p = Store.progress();
    if (!p || !p.book) return null;
    const v = Scripture.verse(p.book, p.chapter || 1, p.verse || 1);
    return v ? v.key : null;
  }

  /** "1-ne/3/7" -> { key, reference, bookSlug, chapter, verse } */
  function toCitation(key, reference) {
    const parts = String(key || '').split('/');
    if (parts.length !== 3) return null;
    const verse = Scripture.verse(parts[0], Number(parts[1]), Number(parts[2]));
    if (!verse) return null;
    return {
      key: verse.key,
      reference: verse.reference,
      bookSlug: verse.bookSlug,
      chapter: verse.chapter,
      verse: verse.verse,
    };
  }

  function citationChips(citations) {
    if (!citations.length) return '';
    return `<div class="flex flex-wrap items-center gap-1.5 pt-0.5">
        <span class="font-marginalia text-marginalia text-outline self-center pr-0.5">Scripture</span>
        ${citations
          .map(
            (c) => `<a href="#/read/${c.bookSlug}/${c.chapter}/${c.verse}"
              class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-surface-container border border-outline-variant hover:bg-surface-container-high transition-colors">
              ${UI.icon('menu_book', 'text-[13px] text-secondary')}
              <span class="font-label-md text-label-md text-primary">${UI.esc(c.reference)}</span>
            </a>`
          )
          .join('')}
      </div>`;
  }

  function promptChips(prompts) {
    if (!prompts || !prompts.length) return '';
    return `<div class="space-y-1.5 pt-1">
        <p class="font-marginalia text-marginalia text-outline">Keep studying</p>
        ${prompts
          .map(
            (p) => `<button type="button" data-prompt="${UI.esc(p)}"
              class="w-full text-left px-space-sm py-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container-high transition-colors flex items-center gap-space-sm">
              ${UI.icon('north_east', 'text-[15px] text-outline shrink-0')}
              <span class="font-body-md text-body-md text-primary">${UI.esc(p)}</span>
            </button>`
          )
          .join('')}
      </div>`;
  }

  function bubble(entry) {
    if (entry.role === 'user') {
      return `<div class="flex justify-end">
        <p class="max-w-[85%] bg-primary-container text-on-primary-container font-body-lg text-body-lg px-space-md py-3 rounded-2xl rounded-br-md">
          ${UI.esc(entry.text)}
        </p>
      </div>`;
    }

    const body = entry.pending
      ? `<div data-stream="${UI.esc(entry.id)}" class="space-y-2 pt-1" role="status" aria-label="Thinking">
           <div class="h-3.5 w-full rounded bg-surface-container-highest animate-pulse"></div>
           <div class="h-3.5 w-2/3 rounded bg-surface-container-highest animate-pulse"></div>
           <div class="h-3.5 w-1/2 rounded bg-surface-container-highest animate-pulse"></div>
         </div>`
      : `<div class="space-y-space-sm">
           ${entry.paragraphs
             .map((p, i) =>
               i === 0 && entry.title
                 ? `<div>
                      <span class="inline-flex items-center gap-1.5 font-label-md text-label-md uppercase tracking-wider text-secondary font-semibold mb-1">${UI.icon('menu_book', 'text-[14px]')}${UI.esc(entry.title)}</span>
                      <p class="font-body-lg text-body-lg text-on-surface leading-[1.68]">${UI.esc(p)}</p>
                    </div>`
                 : `<p class="font-body-lg text-body-lg text-on-surface leading-[1.68]">${UI.esc(p)}</p>`
             )
             .join('')}
           ${
             entry.notes && entry.notes.length
               ? `<ul class="space-y-1 bg-surface-container-low rounded-xl px-space-md py-space-sm">
                    ${entry.notes
                      .map(
                        (n) => `<li class="font-marginalia text-[12.5px] leading-[1.6] text-on-surface-variant flex gap-2">
                          ${UI.icon('sticky_note_2', 'text-[14px] text-outline shrink-0 mt-px')}<span>${UI.esc(n)}</span></li>`
                      )
                      .join('')}
                  </ul>`
               : ''
           }
           ${
             entry.fallback && entry.warning
               ? `<p class="font-marginalia text-marginalia text-on-surface-variant bg-surface-container-low rounded-lg px-space-sm py-2">
                    ${UI.esc(entry.warning)}
                  </p>`
               : ''
           }
           ${citationChips(entry.citations || [])}
           ${promptChips(entry.prompts)}
           <div class="flex items-center gap-1 pt-0.5">
             <button type="button" data-copy="${UI.esc(entry.id)}" class="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors" aria-label="Copy answer">${UI.icon('content_copy', 'text-[16px]')}</button>
             <button type="button" data-share="${UI.esc(entry.id)}" class="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors" aria-label="Share answer">${UI.icon('ios_share', 'text-[16px]')}</button>
             ${
               (entry.citations || []).length
                 ? `<a href="#/read/${entry.citations[0].bookSlug}/${entry.citations[0].chapter}/${entry.citations[0].verse}"
                      class="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors" aria-label="Open first citation">${UI.icon('open_in_new', 'text-[16px]')}</a>`
                 : ''
             }
             <button type="button" data-ask-save="${UI.esc(entry.id)}" class="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors" aria-label="Save to notes">${UI.icon('bookmark_add', 'text-[16px]')}</button>
             <span class="font-marginalia text-marginalia text-outline ml-1">${entry.source === 'api' ? 'Online' : 'On-device'}</span>
           </div>
         </div>`;

    return `<div class="flex gap-space-sm">
      <span class="w-8 h-8 shrink-0 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center">
        ${UI.icon(entry.source === 'api' ? 'smart_toy' : 'auto_stories', 'text-[17px]')}
      </span>
      <div class="min-w-0 flex-1">${body}</div>
    </div>`;
  }

  function render() {
    if (!thread.length) {
      threadEl.innerHTML = `
        <div class="bg-surface-container-low rounded-xl p-space-md shadow-level1">
          <div class="flex items-center gap-space-sm">
            ${UI.icon('auto_awesome', 'text-[20px] text-secondary')}
            <h2 class="font-headline-sm text-headline-sm text-primary">Start with a question</h2>
          </div>
          <p class="font-body-md text-body-md text-on-surface-variant mt-1.5">
            Answers are assembled from the ${Scripture.stats().verses.toLocaleString()} verses and ${Scripture.stats().footnotes.toLocaleString()} study notes already on this device, with citations you can open in the reader.
          </p>
        </div>
        <div class="space-y-space-xs">
          ${AI.suggestions(ctx.anchor)
            .map(
              (s) => `<button type="button" data-prompt="${UI.esc(s)}"
                class="w-full text-left p-space-sm rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors active:scale-[.99] flex items-center gap-space-sm">
                ${UI.icon('north_east', 'text-[16px] text-outline shrink-0')}
                <span class="font-body-md text-body-md text-primary">${UI.esc(s)}</span>
              </button>`
            )
            .join('')}
        </div>`;
    } else {
      threadEl.innerHTML = thread.map(bubble).join('');
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }

    threadEl.querySelectorAll('[data-prompt]').forEach((btn) =>
      btn.addEventListener('click', () => {
        input.value = btn.dataset.prompt;
        ask();
      })
    );
  }

  /* --------------------------------------------------------------- asking */

  /** The model's requested follow-ups never pollute the live preview. */
  function stripFollowUp(text) {
    const at = String(text || '').lastIndexOf('FOLLOW-UP:');
    return at === -1 ? String(text || '') : String(text || '').slice(0, at).trim();
  }

  /** Streamed text replaces the "thinking" pulse inside the pending bubble. */
  function showLive(bubbleId, text) {
    const live = stripFollowUp(text).trim();
    const el = threadEl.querySelector('[data-stream="' + bubbleId + '"]');
    if (!el || !live) return;
    el.classList.remove('space-y-2');
    el.setAttribute('aria-label', 'Writing answer');
    el.innerHTML = `<p class="font-body-lg text-body-lg text-on-surface leading-[1.68] whitespace-pre-line">${UI.esc(live)}</p>`;
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  async function ask() {
    if (busy) return;
    const question = input.value.trim();
    if (!question) {
      UI.toast('Type a question first', { tone: 'bad', icon: 'error' });
      input.focus();
      return;
    }

    thread.push({ role: 'user', text: question, id: 'u' + Date.now() });
    input.value = '';
    autoGrow();
    render();

    busy = true;
    sendBtn.disabled = true;
    const pendingId = 'p' + Date.now();
    thread.push({ role: 'assistant', id: pendingId, pending: true });
    render();

    let result;
    try {
      result = await AI.reflect(question, ctx.anchor || implicitAnchor(), {
        history: thread,
        onDelta: (text) => showLive(pendingId, text),
      });
    } catch (err) {
      result = {
        mode: 'local',
        title: '',
        paragraphs: [err.message || 'Something went wrong.'],
        sources: [],
        notes: [],
        prompts: [],
      };
    }

    const citations = (result.sources || [])
      .map((s) => toCitation(s.key, s.reference))
      .filter(Boolean)
      .filter((c, i, arr) => arr.findIndex((x) => x.key === c.key) === i);

    const entry = {
      role: 'assistant',
      id: 'a' + Date.now(),
      paragraphs: result.paragraphs || [],
      title: result.title || '',
      citations,
      prompts: result.prompts || [],
      notes: result.notes || [],
      source: result.mode === 'api' ? 'api' : 'local',
      fallback: !!result.fallback,
      warning: result.warning || '',
    };

    const index = thread.findIndex((m) => m.id === pendingId);
    if (index !== -1) thread[index] = entry;
    else thread.push(entry);

    busy = false;
    sendBtn.disabled = false;
    render();

    const first = citations[0];
    Store.addHistory({
      question,
      answer: entry.paragraphs.join('\n\n'),
      source: entry.source,
      verseKey: first ? first.key : null,
      anchor: first ? first.reference : '',
    });
  }

  /* ---------------------------------------------------------------- misc */

  function autoGrow() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 128) + 'px';
  }

  function findEntry(id) {
    return thread.find((m) => m.id === id) || null;
  }

  input.addEventListener('input', autoGrow);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      ask();
    }
  });

  ctx.root.querySelector('#ask-form').addEventListener('submit', (event) => {
    event.preventDefault();
    ask();
  });

  /* dictation, where the browser supports it */
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    micBtn.disabled = true;
    micBtn.classList.add('opacity-40', 'cursor-not-allowed');
    micBtn.title = 'Dictation is not available in this browser';
  } else {
    let listening = false;
    let recognizer = null;
    micBtn.addEventListener('click', () => {
      if (listening && recognizer) {
        recognizer.stop();
        return;
      }
      recognizer = new Recognition();
      recognizer.lang = 'en-US';
      recognizer.interimResults = true;
      recognizer.maxAlternatives = 1;
      const base = input.value.trim();
      recognizer.onstart = () => {
        listening = true;
        micBtn.classList.add('text-error');
        UI.toast('Listening…', { duration: 1200 });
      };
      recognizer.onresult = (event) => {
        let text = '';
        for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
        input.value = (base ? base + ' ' : '') + text;
        autoGrow();
      };
      recognizer.onerror = () => UI.toast('Could not hear that', { tone: 'bad', icon: 'error' });
      recognizer.onend = () => {
        listening = false;
        micBtn.classList.remove('text-error');
      };
      try {
        recognizer.start();
      } catch (_) {
        UI.toast('Dictation unavailable', { tone: 'bad', icon: 'error' });
      }
    });
  }

  // the new-conversation button lives in the fixed header
  ctx.onHeader('[data-act="clear"]', () => {
    if (!thread.length) {
      input.focus();
      return;
    }
    UI.confirm({
      title: 'Start a new conversation?',
      message: 'This clears the thread on screen. Saved answers stay in your history.',
      confirmLabel: 'New conversation',
    }).then((ok) => {
      if (!ok) return;
      thread = [];
      render();
      input.focus();
    });
  });

  UI.on(ctx.root, 'click', '[data-copy]', (event, btn) => {
    const entry = findEntry(btn.dataset.copy);
    if (!entry) return;
    const refs = (entry.citations || []).map((c) => c.reference).join(', ');
    const text = entry.paragraphs.join('\n\n') + (refs ? '\n\n— ' + refs : '');
    UI.copy(text).then((ok) =>
      UI.toast(ok ? 'Answer copied' : 'Could not copy', { tone: ok ? 'good' : 'bad', icon: ok ? 'check' : 'error' })
    );
  });

  UI.on(ctx.root, 'click', '[data-share]', (event, btn) => {
    const entry = findEntry(btn.dataset.share);
    if (!entry) return;
    const refs = (entry.citations || []).map((c) => c.reference).join(', ');
    const text = entry.paragraphs.join('\n\n') + (refs ? '\n\n— ' + refs : '');
    UI.share(text, 'Liahona').then((result) => {
      if (result === 'copied') UI.toast('Answer copied', { tone: 'good', icon: 'check' });
      else if (result === 'failed') UI.toast('Could not share', { tone: 'bad', icon: 'error' });
    });
  });

  UI.on(ctx.root, 'click', '[data-ask-save]', (event, btn) => {
    const entry = findEntry(btn.dataset.askSave);
    if (!entry) return;
    const refs = (entry.citations || []).map((c) => c.reference).join(', ');
    const body = entry.paragraphs.join('\n\n') + (refs ? '\n\n— ' + refs : '');
    const target = entry.citations[0];
    const key = target ? target.key : 'general';
    const existing = Store.noteFor(key);
    const stamp = UI.isoDate() + ' · Asked';
    Store.setNote(key, existing ? existing + '\n\n' + stamp + '\nQ: ' + body : stamp + '\nQ: ' + body);
    UI.toast(target ? 'Saved to ' + target.reference : 'Saved to notes', { tone: 'good', icon: 'bookmark_add' });
  });

  if (initial) {
    input.value = initial;
    ask();
  } else {
    render();
  }
};