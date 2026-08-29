/**
 * helpers.js — Pure helper functions shared between js/app.js (browser) and
 * the test suite (Node.js / CommonJS).
 *
 * The browser version of app.js contains identical inline copies of these
 * functions inside their respective IIFEs. This file exports them so that
 * tests/properties.test.js can import and exercise them without a bundler.
 *
 * IMPORTANT: Keep these implementations byte-for-byte identical to their
 * counterparts in js/app.js. If you change a function in app.js, update
 * this file too (and vice versa).
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// GreetingModule helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a Date as zero-padded 24-hour HH:MM.
 * Returns "--:--" if hours/minutes are not valid numbers.
 * @param {Date} date
 * @returns {string}
 */
function formatTime(date) {
  const h = date.getHours();
  const m = date.getMinutes();
  if (isNaN(h) || isNaN(m)) return '--:--';
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

/**
 * Return a time-sensitive salutation for the given hour (0–23).
 * @param {number} hour  Integer in the range 0–23
 * @returns {string}  One of "Good Morning", "Good Afternoon", "Good Evening", "Good Night"
 */
function getSalutation(hour) {
  if (hour >= 5  && hour <= 11) return 'Good Morning';
  if (hour >= 12 && hour <= 17) return 'Good Afternoon';
  if (hour >= 18 && hour <= 23) return 'Good Evening';
  return 'Good Night'; // 0–4
}

// ─────────────────────────────────────────────────────────────────────────────
// TimerModule helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a total-seconds value as zero-padded MM:SS.
 * @param {number} totalSeconds  Integer 0–1500
 * @returns {string}  e.g. "25:00", "04:59"
 */
function formatCountdown(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

// ─────────────────────────────────────────────────────────────────────────────
// TaskListModule helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a task description string.
 * @param {string} text
 * @returns {string|null}  Error message string, or null if valid.
 */
function validateTask(text) {
  if (!text || text.trim().length === 0) return 'Task description cannot be empty.';
  if (text.trim().length > 500) return 'Task description cannot exceed 500 characters.';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// QuickLinksModule helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalise URL: prepend "https://" if no protocol present.
 * @param {string} url
 * @returns {string}
 */
function normaliseUrl(url) {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return 'https://' + trimmed;
}

/**
 * Validate quick-link label and URL.
 * @param {string} label
 * @param {string} url
 * @returns {{ labelError: string|null, urlError: string|null }}
 */
function validateLink(label, url) {
  let labelError = null;
  let urlError   = null;

  if (!label || label.trim().length === 0) {
    labelError = 'Label cannot be empty';
  } else if (label.trim().length > 100) {
    labelError = 'Label must be 100 characters or fewer';
  }

  if (!url || url.trim().length === 0) {
    urlError = 'URL cannot be empty';
  } else if (url.trim().length > 2048) {
    urlError = 'URL must be 2048 characters or fewer';
  }

  return { labelError, urlError };
}

// ─────────────────────────────────────────────────────────────────────────────
// CommonJS exports (used by tests/properties.test.js)
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  formatTime,
  getSalutation,
  formatCountdown,
  validateTask,
  normaliseUrl,
  validateLink,
};
