/**
 * LoreForge Planner - Free Local AI (in-browser, no key) via WebLLM
 *
 * PHASE D (#9): a FREE AI backend that runs a small language model entirely in
 * the browser through WebGPU — no API key, no server, nothing leaves the device.
 * Used to power "interview a character" when the hardware supports it; otherwise
 * callers fall back to the deterministic character voice (character-voice.js).
 *
 * WebLLM is loaded LAZILY from a CDN only when the user opts in, so it never
 * bloats the app or runs on load. WebGPU is feature-detected first. All failure
 * paths are swallowed and reported via status callbacks — the UI degrades to the
 * deterministic voice and never breaks.
 *
 * NOTE: the actual model download + WebGPU inference cannot run in the offline
 * test sandbox. This module is built against WebLLM's documented API
 * (MLCEngine / CreateMLCEngine with an OpenAI-style chat.completions interface)
 * and is guarded so that, without WebGPU or the CDN, `isWebGpuAvailable()` is
 * false and no code path throws.
 */

// A small, fast instruction model — good enough for short in-character replies
// and reasonable to download once (cached by the browser afterward).
const DEFAULT_MODEL = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
const WEBLLM_CDN = 'https://esm.run/@mlc-ai/web-llm';

let _engine = null;
let _loadingPromise = null;
let _status = 'idle'; // 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'

/** Is WebGPU present? (Required for WebLLM.) */
export function isWebGpuAvailable() {
  return typeof navigator !== 'undefined' && !!navigator.gpu;
}

/** Current engine status. */
export function localAIStatus() { return _status; }

/** True once a model is loaded and ready to chat. */
export function isLocalAIReady() { return _status === 'ready' && !!_engine; }

/**
 * Load the local model (idempotent). Reports progress via onProgress(text,pct).
 * Resolves to true on success, false if unavailable/failed (never throws).
 * @param {object} [opts]
 * @param {string} [opts.model]
 * @param {(text:string, pct:number)=>void} [opts.onProgress]
 * @returns {Promise<boolean>}
 */
export async function ensureLocalAI({ model = DEFAULT_MODEL, onProgress } = {}) {
  if (isLocalAIReady()) return true;
  if (!isWebGpuAvailable()) { _status = 'unavailable'; return false; }
  if (_loadingPromise) return _loadingPromise;

  _status = 'loading';
  _loadingPromise = (async () => {
    try {
      // Dynamic import from CDN — kept out of the static graph on purpose.
      const webllm = await import(/* @vite-ignore */ WEBLLM_CDN);
      const create = webllm.CreateMLCEngine || (webllm.default && webllm.default.CreateMLCEngine);
      if (typeof create !== 'function') throw new Error('WebLLM API not found');
      _engine = await create(model, {
        initProgressCallback: (r) => {
          if (onProgress) onProgress(r.text || 'Loading model…', Math.round((r.progress || 0) * 100));
        },
      });
      _status = 'ready';
      return true;
    } catch (e) {
      console.warn('[LoreForge] Local AI unavailable:', e && e.message);
      _status = 'error';
      _engine = null;
      return false;
    } finally {
      _loadingPromise = null;
    }
  })();
  return _loadingPromise;
}

/**
 * Chat completion against the loaded local model.
 * @param {Array<{role:string, content:string}>} messages
 * @param {object} [opts] { temperature, maxTokens }
 * @returns {Promise<string>} the assistant's text (throws if not ready)
 */
export async function localChat(messages, { temperature = 0.8, maxTokens = 200 } = {}) {
  if (!isLocalAIReady()) throw new Error('Local AI is not ready');
  const res = await _engine.chat.completions.create({
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: false,
  });
  return res?.choices?.[0]?.message?.content ?? '';
}

/** Free the model (e.g. when the user turns local AI off). */
export async function unloadLocalAI() {
  try { if (_engine && _engine.unload) await _engine.unload(); } catch { /* ignore */ }
  _engine = null;
  _status = 'idle';
}
