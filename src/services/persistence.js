/**
 * Persistence Service
 * 
 * Uses localForage for IndexedDB-backed storage.
 * Stores: credentials, cached API data, user preferences, coach notes.
 * 
 * This is the "memory" layer that allows the app to retain
 * information over time (as requested).
 */
import localforage from 'localforage';

// Separate stores for different data types
const credentialsStore = localforage.createInstance({ name: 'coach-center', storeName: 'credentials' });
const dataStore = localforage.createInstance({ name: 'coach-center', storeName: 'cached-data' });
const notesStore = localforage.createInstance({ name: 'coach-center', storeName: 'coach-notes' });
const prefsStore = localforage.createInstance({ name: 'coach-center', storeName: 'preferences' });
const coachStore = localforage.createInstance({ name: 'coach-center', storeName: 'coach' });
const journalStore = localforage.createInstance({ name: 'coach-center', storeName: 'journal' });

const persistence = {
  // ─── Credentials ──────────────────────────────────────────
  async saveCredentials(provider, data) {
    return credentialsStore.setItem(provider, data);
  },

  async getCredentials(provider) {
    return credentialsStore.getItem(provider);
  },

  async clearCredentials(provider) {
    return credentialsStore.removeItem(provider);
  },

  // ─── Cached Data ──────────────────────────────────────────
  async cacheData(key, data, ttlMinutes = 15) {
    const entry = {
      data,
      cachedAt: Date.now(),
      expiresAt: Date.now() + ttlMinutes * 60 * 1000,
    };
    return dataStore.setItem(key, entry);
  },

  async getCachedData(key) {
    const entry = await dataStore.getItem(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      await dataStore.removeItem(key);
      return null;
    }
    return entry.data;
  },

  async clearCache() {
    return dataStore.clear();
  },

  // ─── Coach Notes (persistent memory) ─────────────────────
  async saveNote(id, note) {
    const notes = (await notesStore.getItem('all-notes')) || {};
    notes[id] = { ...note, updatedAt: new Date().toISOString() };
    return notesStore.setItem('all-notes', notes);
  },

  async getNotes() {
    return (await notesStore.getItem('all-notes')) || {};
  },

  async deleteNote(id) {
    const notes = (await notesStore.getItem('all-notes')) || {};
    delete notes[id];
    return notesStore.setItem('all-notes', notes);
  },

  // ─── User Preferences ─────────────────────────────────────
  async savePref(key, value) {
    return prefsStore.setItem(key, value);
  },

  async getPref(key, defaultValue = null) {
    const val = await prefsStore.getItem(key);
    return val !== null ? val : defaultValue;
  },

  // ─── Athlete Context (for AI coach, built over time) ──────
  async saveAthleteContext(context) {
    return prefsStore.setItem('athlete-context', {
      ...context,
      lastUpdated: new Date().toISOString(),
    });
  },

  async getAthleteContext() {
    return prefsStore.getItem('athlete-context');
  },

  // ─── Claude API Key ────────────────────────────────────────
  async saveClaudeApiKey(key) {
    return credentialsStore.setItem('claude', key);
  },

  async getClaudeApiKey() {
    return credentialsStore.getItem('claude');
  },

  // ─── Groq API Key ──────────────────────────────────────────
  async saveGroqApiKey(key) {
    return credentialsStore.setItem('groq', key);
  },

  async getGroqApiKey() {
    return credentialsStore.getItem('groq');
  },

  // ─── LLM Provider ('claude' | 'groq') ─────────────────────
  async saveLlmProvider(provider) {
    return prefsStore.setItem('llm-provider', provider);
  },

  async getLlmProvider() {
    return (await prefsStore.getItem('llm-provider')) || 'groq';
  },

  // ─── Training Journal ──────────────────────────────────────
  // Structured weekly snapshots for LLM memory
  // key: ISO week start date (YYYY-MM-DD, always Monday)
  async saveWeeklySnapshot(weekStart, snapshot) {
    return journalStore.setItem(weekStart, {
      ...snapshot,
      weekStart,
      savedAt: new Date().toISOString(),
    });
  },

  async getWeeklySnapshot(weekStart) {
    return journalStore.getItem(weekStart);
  },

  // Returns last N weeks, most recent first
  async getRecentJournal(n = 8) {
    const keys = await journalStore.keys();
    const sorted = keys.sort().reverse().slice(0, n);
    const entries = await Promise.all(sorted.map(k => journalStore.getItem(k)));
    return entries.filter(Boolean);
  },

  async clearJournal() {
    return journalStore.clear();
  },

  // ─── Coach Conversation History ────────────────────────────
  async saveConversationHistory(messages) {
    return coachStore.setItem('conversation-history', messages);
  },

  async getConversationHistory() {
    return (await coachStore.getItem('conversation-history')) || [];
  },

  async clearConversationHistory() {
    return coachStore.removeItem('conversation-history');
  },

  // ─── Athlete Onboarding Profile ────────────────────────────
  async saveAthleteProfile(profile) {
    return coachStore.setItem('athlete-profile', {
      ...profile,
      savedAt: new Date().toISOString(),
    });
  },

  async getAthleteProfile() {
    return coachStore.getItem('athlete-profile');
  },
};

export default persistence;
