/* ==========================================================================
   AI provider presets for the Ask engine.
   ========================================================================== */
window.AIProviders = {
  local: {
    label: 'Local AI (this PC)',
    description: 'Bundled Qwen2.5-1.5B model — no key, private',
    endpoint: 'http://localhost:11434/v1/chat/completions',
    model: 'qwen2.5-1.5b-instruct',
    keyPrefix: '',
    needsKey: false,
    testUrl: 'http://localhost:11434/v1/models',
  },
  llm7: {
    label: 'LLM7 (free, no key)',
    description: 'DeepSeek V4, GLM & more — anonymous, no sign-in',
    endpoint: 'https://api.llm7.io/v1/chat/completions',
    model: 'DeepSeek-V4-Flash-0731',
    keyPrefix: '',
    needsKey: false,
    testUrl: 'https://api.llm7.io/v1/models',
  },
  puter: {
    label: 'Puter (free cloud AI)',
    description: 'GPT-5, Claude, Gemini — one-time sign-in on first use',
    sdk: 'puter',
    endpoint: 'puter',
    model: 'gpt-5-mini',
    keyPrefix: '',
    needsKey: false,
    testUrl: 'https://js.puter.com/v2/',
  },
  openrouter: {
    label: 'OpenRouter',
    description: 'One key, many models — several free',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'deepseek/deepseek-chat:free',
    keyPrefix: 'sk-or-v1-',
    needsKey: true,
    testUrl: 'https://openrouter.ai/api/v1/auth/key',
  },
  openai: {
    label: 'OpenAI',
    description: 'GPT models on api.openai.com',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    keyPrefix: 'sk-',
    needsKey: true,
    testUrl: 'https://api.openai.com/v1/models',
  },
  groq: {
    label: 'Groq',
    description: 'Fast Llama models with a free tier',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    keyPrefix: 'gsk_',
    needsKey: true,
    testUrl: 'https://api.groq.com/openai/v1/models',
  },
};

window.AIProviders.byHost = function (endpoint) {
  if (/^puter$/i.test(String(endpoint || '').trim())) return 'puter';
  let host = '';
  try {
    host = new URL(endpoint).hostname;
  } catch (_) { /* not a URL yet */ }
  if (/llm7/i.test(host)) return 'llm7';
  if (/openrouter/i.test(host)) return 'openrouter';
  if (/^api\.openai/i.test(host)) return 'openai';
  if (/groq/i.test(host)) return 'groq';
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(host)) return 'local';
  return 'custom';
};

/** Models offered by the free Puter API (the text ones, image ones excluded). */
window.AIProviders.puterModels = [
  'gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5-chat-latest',
  'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4.5-preview',
  'gpt-4o', 'gpt-4o-mini', 'o1-mini', 'o3-mini', 'o4-mini',
  'claude-sonnet-4', 'claude-opus-4',
  'meta-llama/llama-4-maverick', 'mistralai/mistral-large',
  'google/gemini-2.5-flash',
];

/** OpenAI-style base URL from a full chat-completions endpoint. */
window.AIProviders.baseUrl = function (endpoint) {
  try {
    return endpoint.replace(/\/chat\/completions\/?$/, '');
  } catch (_) {
    return endpoint;
  }
};