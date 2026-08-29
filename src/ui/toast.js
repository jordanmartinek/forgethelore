/**
 * LoreForge Planner - Toast Notification System
 */

import { h } from '../core/renderer.js';
import { events, Events } from '../core/events.js';

let toastContainer = null;

export function initToasts() {
  toastContainer = h('div', { class: 'toast-container', id: 'toast-container' });
  document.body.appendChild(toastContainer);
  
  // Listen for toast events
  events.on(Events.TOAST, showToast);
}

export function showToast({ message, type = 'info', duration = 3000 }) {
  if (!toastContainer) {
    toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;
  }
  
  const icons = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌',
  };
  
  const toast = h('div', { class: `toast toast--${type}` },
    h('span', {}, icons[type] || 'ℹ️'),
    h('span', {}, message),
  );
  
  toastContainer.appendChild(toast);
  
  // Auto remove
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Direct toast helper — works whether or not the event bus is wired up.
 * Prefer this in UI code so we no longer need per-module toast implementations.
 * @param {string} message
 * @param {'info'|'success'|'warning'|'error'} [type]
 * @param {number} [duration]
 */
export function toast(message, type = 'info', duration = 3000) {
  showToast({ message, type, duration });
}

// Convenience functions
export function toastSuccess(message) {
  showToast({ message, type: 'success' });
}

export function toastError(message) {
  showToast({ message, type: 'error' });
}

export function toastWarning(message) {
  showToast({ message, type: 'warning' });
}

export function toastInfo(message) {
  showToast({ message, type: 'info' });
}
