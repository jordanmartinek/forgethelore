/**
 * LoreForge Planner - Main Entry Point
 * Creative Planning Operating System
 * 
 * Architecture:
 * - Local-first with IndexedDB persistence
 * - Reactive store (Zustand-inspired)
 * - Cross-module event bus for live updates
 * - Everything is an object with relationships
 * - Strategic Conflict Board as the central planning interface
 */

import { db } from './core/database.js';
import { appStore } from './core/store.js';
import { events, Events } from './core/events.js';
import { initAppShell } from './ui/app-shell.js';
import { initToasts, toastSuccess, toastInfo } from './ui/toast.js';

async function init() {
  try {
    // Initialize IndexedDB
    await db.init();
    console.log('[LoreForge] Database initialized');
    
    // Listen for save status changes
    db.onStatusChange((status) => {
      switch (status) {
        case 'saving':
          appStore.setState({ saveStatus: 'saving' });
          events.emit(Events.SAVE_STARTED);
          break;
        case 'saved':
          appStore.setState({ saveStatus: 'saved', lastSaved: Date.now() });
          events.emit(Events.SAVE_COMPLETED);
          break;
        case 'error':
          appStore.setState({ saveStatus: 'offline' });
          events.emit(Events.SAVE_FAILED);
          break;
      }
    });
    
    // Initialize toast notifications
    initToasts();
    
    // Set up cross-module event listeners
    initCrossModuleUpdates();
    
    // Initialize the application shell
    initAppShell();
    console.log('[LoreForge] Application shell initialized');
    
    // Welcome toast
    setTimeout(() => toastInfo('LoreForge Planner ready. Press Ctrl+K for commands.'), 500);
    
    // Set up autosave interval (hourly snapshots)
    setInterval(async () => {
      try {
        await db.createSnapshot('Auto-snapshot');
        console.log('[LoreForge] Hourly snapshot created');
      } catch (e) {
        console.warn('[LoreForge] Snapshot failed:', e);
      }
    }, 60 * 60 * 1000); // Every hour
    
    // Online/offline detection
    window.addEventListener('online', () => {
      appStore.setState({ saveStatus: 'saved' });
    });
    
    window.addEventListener('offline', () => {
      appStore.setState({ saveStatus: 'offline' });
    });
    
    // Prevent accidental navigation away
    window.addEventListener('beforeunload', (e) => {
      if (appStore.getState().saveStatus === 'saving') {
        e.preventDefault();
        e.returnValue = '';
      }
    });
    
    // Update object count in status bar
    updateObjectCount();
    
    // Register service worker for PWA install (desktop icon) and offline support
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        console.log('[LoreForge] Service worker registered — app works offline');
        // Check for updates periodically
        setInterval(() => reg.update(), 60 * 60 * 1000); // hourly
      }).catch(e => {
        console.warn('[LoreForge] SW registration skipped:', e.message);
      });
    }
    
    console.log('[LoreForge] ✨ LoreForge Planner ready');
    
  } catch (error) {
    console.error('[LoreForge] Initialization failed:', error);
    document.getElementById('app').innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#e8e8f0;font-family:system-ui;">
        <div style="text-align:center;">
          <h1 style="font-size:24px;margin-bottom:8px;">LoreForge Planner</h1>
          <p style="color:#9898b0;">Failed to initialize. Please refresh the page.</p>
          <p style="color:#ef4444;font-size:12px;margin-top:8px;">${error.message}</p>
        </div>
      </div>
    `;
  }
}

// Boot
document.addEventListener('DOMContentLoaded', init);

// Also init if DOM is already ready
if (document.readyState !== 'loading') {
  init();
}

/**
 * Cross-module updates:
 * When one object changes, automatically update every module that references it.
 */
function initCrossModuleUpdates() {
  // When an object is updated, propagate to all related views
  events.on(Events.OBJECT_UPDATED, ({ id, changes }) => {
    console.log(`[LoreForge] Object ${id} updated, propagating changes...`);
    // Trigger save
    appStore.setState({ saveStatus: 'saving' });
    setTimeout(() => appStore.setState({ saveStatus: 'saved' }), 400);
  });
  
  // When a relationship changes, update both related objects
  events.on(Events.RELATIONSHIP_UPDATED, ({ id, sourceId, targetId }) => {
    console.log(`[LoreForge] Relationship updated between ${sourceId} and ${targetId}`);
  });
  
  // Board piece movement triggers save
  events.on(Events.PIECE_MOVED, ({ pieceId, newPosition }) => {
    appStore.setState({ saveStatus: 'saving' });
    setTimeout(() => appStore.setState({ saveStatus: 'saved' }), 400);
  });
  
  // Module navigation tracking
  events.on(Events.MODULE_CHANGED, ({ module }) => {
    console.log(`[LoreForge] Navigated to ${module}`);
  });
}

/**
 * Update the object count in the status bar
 */
async function updateObjectCount() {
  try {
    const objects = await db.getAll('objects');
    const el = document.getElementById('status-objects');
    if (el) {
      el.textContent = `${objects.length} objects`;
    }
  } catch (e) {
    // DB might not have data yet
    const el = document.getElementById('status-objects');
    if (el) el.textContent = '0 objects';
  }
}
