// YouTube Playables SDK wrapper.
// In the Playables environment `ytgame` is provided by the script tag in index.html.
// Anywhere else (local dev, itch, etc.) every call falls back to safe local behavior.
import { SAVE_KEY } from './config.js';

const sdk = () => (typeof ytgame !== 'undefined' ? ytgame : null);

export const YT = {
  get inYouTube() {
    const s = sdk();
    return !!(s && s.IN_PLAYABLES_ENV);
  },

  firstFrameReady() {
    try { if (this.inYouTube) sdk().game.firstFrameReady(); } catch (e) { this.logError(e); }
  },

  gameReady() {
    try { if (this.inYouTube) sdk().game.gameReady(); } catch (e) { this.logError(e); }
  },

  // Resolves to a parsed save object ({} when empty/corrupt). Never rejects.
  async loadData() {
    try {
      let raw = '';
      if (this.inYouTube) {
        raw = await sdk().game.loadData();
      } else {
        raw = localStorage.getItem(SAVE_KEY) || '';
      }
      if (!raw) return {};
      const obj = JSON.parse(raw);
      return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) {
      this.logError(e);
      return {};
    }
  },

  // Fire-and-forget persistence; serializes for you.
  async saveData(obj) {
    try {
      const raw = JSON.stringify(obj);
      if (this.inYouTube) {
        await sdk().game.saveData(raw);
      } else {
        localStorage.setItem(SAVE_KEY, raw);
      }
    } catch (e) {
      this.logError(e);
    }
  },

  async sendScore(value) {
    try {
      const v = Math.max(0, Math.floor(value));
      if (this.inYouTube) await sdk().engagement.sendScore({ value: v });
    } catch (e) {
      this.logError(e);
    }
  },

  isAudioEnabled() {
    try { if (this.inYouTube) return sdk().system.isAudioEnabled(); } catch (e) { /* fall through */ }
    return true;
  },

  onAudioEnabledChange(cb) {
    try { if (this.inYouTube) return sdk().system.onAudioEnabledChange(cb); } catch (e) { this.logError(e); }
    return () => {};
  },

  onPause(cb) {
    try { if (this.inYouTube) return sdk().system.onPause(cb); } catch (e) { this.logError(e); }
    // Local dev convenience only — certification forbids relying on Page Visibility
    // in the Playables environment, so this path never runs there.
    // ?noautopause disables it for automated testing.
    if (location.search.includes('noautopause')) return () => {};
    const handler = () => { if (document.hidden) cb(); };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  },

  onResume(cb) {
    try { if (this.inYouTube) return sdk().system.onResume(cb); } catch (e) { this.logError(e); }
    if (location.search.includes('noautopause')) return () => {};
    const handler = () => { if (!document.hidden) cb(); };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  },

  logError(e) {
    try {
      if (e) console.error('[game]', e.name || '', e.message || String(e), e);
      const s = sdk();
      if (s && s.IN_PLAYABLES_ENV) s.health.logError();
    } catch (_) { /* never throw from the error path */ }
  },
};
