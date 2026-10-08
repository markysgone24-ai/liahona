/* ==========================================================================
   Liahona — text to speech
   Wraps the Web Speech API, tracks the verse currently being spoken so the
   reader can highlight along, and surfaces real capability failures.
   ========================================================================== */
window.TTS = (function () {
  'use strict';

  const synth = window.speechSynthesis || null;

  const state = {
    supported: !!synth && typeof SpeechSynthesisUtterance === 'function',
    speaking: false,
    paused: false,
    queue: [],       // [{ text, key }]
    index: 0,
    rate: 1,
    onVerse: null,   // callback(key | null)
    onState: null,   // callback({ speaking, paused })
    onDone: null,    // callback() — fired when the queue drains naturally
  };

  const listeners = new Set();

  function notify() {
    const snapshot = { speaking: state.speaking, paused: state.paused, index: state.index, total: state.queue.length };
    listeners.forEach((fn) => {
      try { fn(snapshot); } catch (e) { console.error('[tts] listener', e); }
    });
    if (state.onState) state.onState(snapshot);
  }

  function supported() {
    return state.supported;
  }

  /** Some engines load their voice list asynchronously. */
  function voices() {
    if (!state.supported) return [];
    const list = synth.getVoices() || [];
    return list.filter((v) => /en(-|_|$)/i.test(v.lang));
  }

  /* No voice is chosen here: the browser/OS picks its own default voice.
     Hard-coding a name (Microsoft, Google, Samantha...) locked the app to one
     accent, so we leave `utter.voice` alone and let the engine decide. */

  function stop() {
    if (!state.supported) return;
    synth.cancel();
    state.onDone = null;
    const had = state.speaking;
    state.speaking = false;
    state.paused = false;
    state.queue = [];
    state.index = 0;
    if (had && state.onVerse) state.onVerse(null);
    notify();
  }

  /**
   * Natural end of the queue (the last utterance finished). Distinct from
   * stop(): it lets the caller chain onto the next chapter, if any.
   */
  function finishDone() {
    const had = state.speaking;
    const onDone = state.onDone;
    state.onDone = null;
    state.speaking = false;
    state.paused = false;
    state.queue = [];
    state.index = 0;
    if (had && state.onVerse) state.onVerse(null);
    notify();
    if (typeof onDone === 'function') {
      try {
        onDone();
      } catch (err) {
        console.error('[tts] onDone', err);
      }
    }
  }

  /** Chrome drops a speak() that follows cancel() immediately; give it a tick. */
  function speakAfterCancel() {
    setTimeout(speakItem, 60);
  }

  function speakItem() {
    if (!state.supported) return;
    const item = state.queue[state.index];
    if (!item) {
      stop();
      return;
    }
    const utter = new SpeechSynthesisUtterance(item.text);
    utter.rate = state.rate;
    utter.pitch = 1;

    utter.onstart = () => {
      state.speaking = true;
      if (state.onVerse) state.onVerse(item.key || null);
      notify();
    };
    utter.onend = () => {
      state.index++;
      if (state.index >= state.queue.length) {
        finishDone();
      } else {
        speakItem();
      }
    };
    utter.onerror = (event) => {
      // "interrupted"/"canceled" fire on stop(); not real failures
      if (event && (event.error === 'interrupted' || event.error === 'canceled')) return;
      const reason = (event && event.error) || 'unknown';
      console.warn('[tts] error', reason);
      stop();
      if (window.UI) UI.toast('Audio unavailable on this device', { tone: 'bad', icon: 'volume_off' });
    };

    synth.speak(utter);
  }

  /**
   * Speaks an ordered list of { text, key } segments, calling onVerse as each
   * begins so the reader can follow along.
   */
  function play(segments, options) {
    if (!state.supported) {
      UI.toast('Speech is not supported in this browser', { tone: 'bad', icon: 'volume_off' });
      return false;
    }
    const opts = options || {};
    const list = (segments || []).filter((s) => s && s.text);
    if (!list.length) return false;

    synth.cancel();
    state.queue = list;
    state.index = 0;
    state.rate = opts.rate || 1;
    state.onVerse = opts.onVerse || null;
    state.onDone = opts.onDone || null;
    state.speaking = true;
    state.paused = false;
    speakAfterCancel();
    notify();
    return true;
  }

  /** Restarts from a given segment index (verse granularity, like the reader). */
  function seek(index) {
    if (!state.supported) return false;
    if (!state.queue.length) return false;
    const target = Math.max(0, Math.min(state.queue.length - 1, Number(index) || 0));
    if (target === state.index && !state.paused) return true;
    synth.cancel();
    state.index = target;
    state.paused = false;
    speakAfterCancel();
    notify();
    return true;
  }

  /** Snapshot of the live queue, for the player bar. */
  function current() {
    return {
      index: state.index,
      total: state.queue.length,
      speaking: state.speaking,
      paused: state.paused,
      key: state.queue[state.index] ? state.queue[state.index].key : null,
    };
  }

  function pause() {
    if (!state.supported || !state.speaking) return;
    synth.pause();
    state.paused = true;
    notify();
  }

  function resume() {
    if (!state.supported || !state.paused) return;
    synth.resume();
    state.paused = false;
    notify();
  }

  function toggle() {
    if (!state.supported) {
      UI.toast('Speech is not supported in this browser', { tone: 'bad', icon: 'volume_off' });
      return;
    }
    if (state.paused) resume();
    else if (state.speaking) pause();
  }

  function setRate(rate) {
    state.rate = Math.min(2, Math.max(0.5, Number(rate) || 1));
    if (state.supported && state.speaking) {
      // restart the current segment so the new rate takes effect
      const at = state.index;
      synth.cancel();
      state.index = at;
      state.paused = false;
      speakAfterCancel();
    }
    notify();
  }

  function isSpeaking() {
    return state.speaking && !state.paused;
  }

  function onStateChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function onVerseChange(fn) {
    state.onVerse = fn;
  }

  // Stop cleanly when the tab is hidden so audio never runs on in the background.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.speaking) {
      synth && synth.pause();
      state.paused = true;
      notify();
    }
  });

  return {
    supported, voices, play, stop, pause, resume, toggle, setRate, seek, current,
    isSpeaking, onStateChange, onVerseChange, notify,
  };
})();