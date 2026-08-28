/**
 * LoreForge Planner - DOM Renderer
 * Lightweight component-based rendering system
 */

// Simple reactive component system
export function createElement(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class' || key === 'className') {
      el.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (key.startsWith('on')) {
      const event = key.slice(2).toLowerCase();
      el.addEventListener(event, value);
    } else if (key === 'dataset') {
      Object.entries(value).forEach(([k, v]) => el.dataset[k] = v);
    } else if (key === 'innerHTML') {
      el.innerHTML = value;
    } else if (key === 'value') {
      el.value = value;
    } else if (key === 'checked' || key === 'disabled' || key === 'selected') {
      el[key] = value;
    } else {
      el.setAttribute(key, value);
    }
  }
  
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    if (typeof child === 'string' || typeof child === 'number') {
      el.appendChild(document.createTextNode(String(child)));
    } else if (child instanceof Node) {
      el.appendChild(child);
    }
  }
  
  return el;
}

// Shorthand
export const h = createElement;

// Render a component into a container
export function render(container, element) {
  container.innerHTML = '';
  if (element instanceof Node) {
    container.appendChild(element);
  } else if (typeof element === 'string') {
    container.innerHTML = element;
  }
}

/**
 * Re-render a container while preserving scroll positions.
 *
 * The app's modules re-render by clearing `innerHTML` and rebuilding, which
 * resets scroll position — jarring during long editing sessions. This opt-in
 * helper captures the scroll offsets of the container and any scrollable
 * descendants that carry a stable `id` or `data-scroll-key`, runs the caller's
 * rebuild, then restores those offsets after paint.
 *
 * Usage:
 *   renderPreservingScroll(container, () => { container.innerHTML=''; renderX(container); });
 *
 * @param {HTMLElement} container
 * @param {() => void} rebuild
 */
export function renderPreservingScroll(container, rebuild) {
  if (!container) { rebuild(); return; }

  // Capture scroll state keyed by a stable identifier.
  const saved = new Map();
  const record = (el) => {
    const key = el.id || el.getAttribute('data-scroll-key');
    if (key && (el.scrollTop || el.scrollLeft)) saved.set(key, { top: el.scrollTop, left: el.scrollLeft });
  };
  record(container);
  container.querySelectorAll('[id], [data-scroll-key]').forEach(record);
  const containerTop = container.scrollTop;
  const containerLeft = container.scrollLeft;

  rebuild();

  // Restore after the new DOM is in place.
  const restore = () => {
    container.scrollTop = containerTop;
    container.scrollLeft = containerLeft;
    saved.forEach((pos, key) => {
      const el = container.querySelector(`#${CSS && CSS.escape ? CSS.escape(key) : key}, [data-scroll-key="${key}"]`);
      if (el) { el.scrollTop = pos.top; el.scrollLeft = pos.left; }
    });
  };
  // rAF so layout has settled; fall back to sync if rAF is unavailable.
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(restore);
  else restore();
}

// Fragment helper
export function fragment(...children) {
  const frag = document.createDocumentFragment();
  for (const child of children.flat()) {
    if (child == null) continue;
    if (typeof child === 'string') {
      frag.appendChild(document.createTextNode(child));
    } else if (child instanceof Node) {
      frag.appendChild(child);
    }
  }
  return frag;
}

// SVG element creation
export function createSVGElement(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on')) {
      const event = key.slice(2).toLowerCase();
      el.addEventListener(event, value);
    } else {
      el.setAttribute(key, value);
    }
  }
  return el;
}

// Animation helper
export function animate(el, keyframes, options = {}) {
  return el.animate(keyframes, {
    duration: 200,
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    fill: 'forwards',
    ...options,
  });
}

// Conditional rendering
export function when(condition, content) {
  return condition ? content() : null;
}

// List rendering with keying
export function list(items, keyFn, renderFn) {
  return items.map((item, i) => {
    const el = renderFn(item, i);
    if (el instanceof Element) {
      el.dataset.key = keyFn(item);
    }
    return el;
  });
}
