/**
 * LoreForge Planner - Cross-Module Event Bus
 * Enables modules to communicate without tight coupling.
 * Changing one object automatically updates every other object that references it.
 */

class EventBus {
  constructor() {
    this.handlers = new Map();
  }

  on(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event).add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  emit(event, data) {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (e) {
          console.error(`[EventBus] Error in handler for "${event}":`, e);
        }
      });
    }
    // Also emit to wildcard listeners
    const wildcards = this.handlers.get('*');
    if (wildcards) {
      wildcards.forEach(handler => {
        try {
          handler({ event, data });
        } catch (e) {
          console.error(`[EventBus] Error in wildcard handler:`, e);
        }
      });
    }
  }

  off(event, handler) {
    this.handlers.get(event)?.delete(handler);
  }

  clear() {
    this.handlers.clear();
  }
}

export const events = new EventBus();

// Standard events
export const Events = {
  // Object lifecycle
  OBJECT_CREATED: 'object:created',
  OBJECT_UPDATED: 'object:updated',
  OBJECT_DELETED: 'object:deleted',
  
  // Relationships
  RELATIONSHIP_CREATED: 'relationship:created',
  RELATIONSHIP_UPDATED: 'relationship:updated',
  RELATIONSHIP_DELETED: 'relationship:deleted',
  
  // Board events
  PIECE_MOVED: 'board:piece_moved',
  PIECE_SELECTED: 'board:piece_selected',
  FACTION_UPDATED: 'board:faction_updated',
  OBJECTIVE_PROGRESS: 'board:objective_progress',
  
  // Navigation
  MODULE_CHANGED: 'nav:module_changed',
  OBJECT_FOCUSED: 'nav:object_focused',
  
  // Save
  SAVE_STARTED: 'save:started',
  SAVE_COMPLETED: 'save:completed',
  SAVE_FAILED: 'save:failed',
  
  // AI
  AI_SUGGESTION: 'ai:suggestion',
  AI_WARNING: 'ai:warning',
  
  // Toast notifications
  TOAST: 'ui:toast',
};
