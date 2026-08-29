/* ==========================================================================
   Todo Life Dashboard — app.js
   Zero-dependency, single-page productivity homepage.
   All state lives in localStorage; all modules are self-contained IIFEs.
   ========================================================================== */

'use strict';

/* --------------------------------------------------------------------------
   Storage Utility
   Centralises all localStorage access. All reads/writes go through here.
   -------------------------------------------------------------------------- */
const StorageUtil = (function () {
  return {
    available: false,

    /** Probe localStorage; set available flag. */
    init() {
      const PROBE_KEY = '__tld_probe__';
      try {
        localStorage.setItem(PROBE_KEY, '1');
        localStorage.getItem(PROBE_KEY);
        localStorage.removeItem(PROBE_KEY);
        this.available = true;
      } catch {
        this.available = false;
      }

      // Wire the dismiss button once (idempotent — button is in HTML from load)
      const dismissBtn = document.getElementById('storage-warning-dismiss');
      if (dismissBtn) {
        dismissBtn.addEventListener('click', () => this.dismissWarning());
      }
    },

    /**
     * Read a value from localStorage.
     * @param {string} key
     * @returns {*} Parsed value, or null on miss / parse error.
     */
    get(key) {
      if (!this.available) return null;
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? null : JSON.parse(raw);
      } catch {
        return null;
      }
    },

    /**
     * Write a value to localStorage.
     * Shows warning banner on failure.
     * @param {string} key
     * @param {*} value
     */
    set(key, value) {
      if (!this.available) {
        this.showWarning('Storage is unavailable. Changes will not be saved this session.');
        return;
      }
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        this.showWarning('Could not save data: ' + e.message);
      }
    },

    /**
     * Show the non-blocking warning banner.
     * @param {string} message
     */
    showWarning(message) {
      const banner = document.getElementById('storage-warning');
      const text = document.getElementById('storage-warning-text');
      if (banner && text) {
        text.textContent = message;
        banner.classList.add('is-visible');
      }
    },

    /** Hide the warning banner. */
    dismissWarning() {
      const banner = document.getElementById('storage-warning');
      if (banner) {
        banner.classList.remove('is-visible');
      }
    },
  };
})();

/* --------------------------------------------------------------------------
   Greeting Module
   Reads Date from the browser; renders time, date, and salutation.
   Refreshes every 60 seconds.
   -------------------------------------------------------------------------- */
const GreetingModule = (function () {
  let _intervalId = null;

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
   * Format a Date as "Weekday, Month DD, YYYY".
   * Falls back to ISO date string if Intl is unavailable.
   * @param {Date} date
   * @returns {string}
   */
  function formatDate(date) {
    try {
      return date.toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return date.toDateString();
    }
  }

  /**
   * Return a time-sensitive salutation for the given hour (0–23).
   * @param {number} hour
   * @returns {string}
   */
  function getSalutation(hour) {
    if (hour >= 5  && hour <= 11) return 'Good Morning';
    if (hour >= 12 && hour <= 17) return 'Good Afternoon';
    if (hour >= 18 && hour <= 23) return 'Good Evening';
    return 'Good Night'; // 0–4
  }

  return {
    init() {
      this.render();
      _intervalId = setInterval(() => this.render(), 60000);
    },

    render() {
      let now;
      try {
        now = new Date();
        if (isNaN(now.getTime())) throw new Error('Invalid date');
      } catch {
        const salEl = document.getElementById('greeting-salutation');
        const timeEl = document.getElementById('greeting-time');
        if (salEl) salEl.textContent = 'Time unavailable';
        if (timeEl) timeEl.textContent = '--:--';
        return;
      }

      const salEl  = document.getElementById('greeting-salutation');
      const timeEl = document.getElementById('greeting-time');
      const dateEl = document.getElementById('greeting-date');

      if (salEl)  salEl.textContent  = getSalutation(now.getHours());
      if (timeEl) timeEl.textContent = formatTime(now);
      if (dateEl) dateEl.textContent = formatDate(now);
    },

    /** Clear the interval (used in tests). */
    destroy() {
      clearInterval(_intervalId);
      _intervalId = null;
    },

    // Expose pure helpers for testing
    _formatTime: formatTime,
    _formatDate: formatDate,
    _getSalutation: getSalutation,
  };
})();

/* --------------------------------------------------------------------------
   Timer Module
   Manages a Pomodoro countdown. State is in-memory only (not persisted).
   -------------------------------------------------------------------------- */
const TimerModule = (function () {
  // --- Private state ---
  let _remaining  = 1500;   // seconds (25:00)
  let _running    = false;
  let _intervalId = null;

  // --- DOM element references (resolved in init) ---
  let _display    = null;
  let _btnStart   = null;
  let _btnStop    = null;
  let _btnReset   = null;

  // -------------------------------------------------------------------------
  // Pure helpers
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Button-state helpers
  // -------------------------------------------------------------------------

  /** IDLE: Start on, Stop off, Reset on. */
  function _applyIdleState() {
    _btnStart.disabled = false;
    _btnStop.disabled  = true;
    _btnReset.disabled = false;
  }

  /** RUNNING: Start off, Stop on, Reset on. */
  function _applyRunningState() {
    _btnStart.disabled = true;
    _btnStop.disabled  = false;
    _btnReset.disabled = false;
  }

  /** FINISHED: Start off, Stop off, Reset on. */
  function _applyFinishedState() {
    _btnStart.disabled = true;
    _btnStop.disabled  = true;
    _btnReset.disabled = false;
  }

  // -------------------------------------------------------------------------
  // Notification
  // -------------------------------------------------------------------------

  /** Notify the user that the Pomodoro session has ended. */
  function _notifySessionEnd() {
    try {
      // 440 Hz sine beep, ~0.3 s, 8-bit mono 8 kHz PCM WAV with 20 ms fade envelope.
      // Generated with Node.js Buffer; no CDN or external dependency required.
      const beepB64 =
        'UklGRoQJAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YWAJAA' +
        'CAgIGCgoODg4KAfnx6eHd4eXx/g4eLjY6Oi4eCfHZxbWxtcXZ9hY2TmJqYlI2Ee3Fp' +
        'Y2FiZ296hZGboqWknpWJe25iWlZXXWd1hJShq7CvqZ2OfWtcUUtLUl5vgpWms7u7tKeV' +
        'gGtXSUA/RlRnfpWru8XHwLKdhWtUQTYzOkleeZStws/SzL2mi21SOy0oLT1VcpGvx9je' +
        '2cmxknFRNiQdITFKao2tydzk4NG4mXdVOSYcHy1FZIaoxNnj4tS9n31bPigdHipAXoCi' +
        'wNbi49jCpYNhQyweHSc8WHqcu9Ph5NrHq4lnSC8gHCQ3U3OWts/f5N3LsJBtTTMiHCIz' +
        'TW2QsMvd5N/PtpZzUzckHCAvSGeJq8fa5OHTu5x6WDwnHR4sQ2GDpcLY4+LWwKKAXkAq' +
        'Hh0oPlt9n73U4uPZxKiGZEUtHxwmOVV3mbjR4OTcya2NakoxIRwjNVBwk7PN3uTezbOT' +
        'cFA1IxwhMUpqja3J3OTg0biZd1U5JhwfLUVkhqjE2ePi1L2ffVs+KB0eKkBegKLA1uLj' +
        '2MKlg2FDLB4dJzxYepy70+Hk2seriWdILyAcJDdTc5a2z9/k3cuwkG1NMyIcIjNNbZCw' +
        'y93k38+2lnNTNyQcIC9IZ4mrx9rk4dO7nHpYPCcdHixDYYOlwtjj4tbAooBeQCoeHSg+' +
        'W32fvdTi49nEqIZkRS0fHCY5VXeZuNHg5NzJrY1qSjEhHCM1UHCTs83e5N7Ns5NwUDUj' +
        'HCExSmqNrcnc5ODRuJl3VTkmHB8tRWSGqMTZ4+LUvZ99Wz4oHR4qQF6AosDW4uPYwqWD' +
        'YUMsHh0nPFh6nLvT4eTax6uJZ0gvIBwkN1NzlrbP3+Tdy7CQbU0zIhwiM01tkLDL3eTf' +
        'z7aWc1M3JBwgL0hniavH2uTh07ucelg8Jx0eLENhg6XC2OPi1sCigF5AKh4dKD5bfZ+9' +
        '1OLj2cSohmRFLR8cJjlVd5m40eDk3MmtjWpKMSEcIzVQcJOzzd7k3s2zk3BQNSMcITFK' +
        'ao2tydzk4NG4mXdVOSYcHy1FZIaoxNnj4tS9n31bPigdHipAXoCiwNbi49jCpYNhQywe' +
        'HSc8WHqcu9Ph5NrHq4lnSC8gHCQ3U3OWts/f5N3LsJBtTTMiHCIzTW2QsMvd5N/Ptpb' +
        'zUzckHCAvSGeJq8fa5OHTu5x6WDwnHR4sQ2GDpcLY4+LWwKKAXkAqHh0oPlt9n73U4u' +
        'PZxKiGZEUtHxwmOVV3mbjR4OTcya2NakoxIRwjNVBwk7PN3uTezbOTcFA1IxwhMUpqja' +
        '3J3OTg0biZd1U5JhwfLUVkhqjE2ePi1L2ffVs+KB0eKkBegKLA1uLj2MKlg2FDLB4dJz' +
        'xYepy70+Hk2seriWdILyAcJDdTc5a2z9/k3cuwkG1NMyIcIjNNbZCwy93k38+2lnNTNy' +
        'QcIC9IZ4mrx9rk4dO7nHpYPCcdHixDYYOlwtjj4tbAooBeQCoeHSg+W32fvdTi49nEqI' +
        'ZkRS0fHCY5VXeZuNHg5NzJrY1qSjEhHCM1UHCTs83e5N7Ns5NwUDUjHCExSmqNrcnc5O' +
        'DRuJl3VTkmHB8tRWSGqMTZ4+LUvZ99Wz4oHR4qQF6AosDW4uPYwqWDYUMsHh0nPFh6n' +
        'LvT4eTax6uJZ0gvIBwkN1NzlrbP3+Tdy7CQbU0zIhwiM01tkLDL3eTfz7aWc1M3JBwg' +
        'L0hniavH2uTh07ucelg8Jx0eLENhg6XC2OPi1sCigF5AKh4dKD5bfZ+91OLj2cSohmRF' +
        'LR8cJjlVd5m40eDk3MmtjWpKMSEcIzVQcJOzzd7k3s2zk3BQNSMcITFKao2tydzk4NG4' +
        'mXdVOSYcHy1FZIaoxNnj4tS9n31bPigdHipAXoCiwNbi49jCpYNhQyweHSc8WHqcu9Ph' +
        '5NrHq4lnSC8gHCQ3U3OWts/f5N3LsJBtTTMiHCIzTW2QsMvd5N/PtpZzUzckHCAvSGeJ' +
        'q8fa5OHTu5x6WDwnHR4sQ2GDpcLY4+LWwKKAXkAqHh0oPlt9n73U4uPZxKiGZEUtHxwm' +
        'OVV3mbjR4OTcya2NakoxIRwjNVBwk7PN3uTezbOTcFA1IxwhMUpqja3J3OTg0biZd1U5' +
        'JhwfLUVkhqjE2ePi1L2ffVs+KB0eKkBegKLA1uLj2MKlg2FDLB4dJzxYepy70+Hk2ser' +
        'iWdILyAcJDdTc5a2z9/j3Mqvj25PNyciKDlRb46rw9PY08Wuk3VaQzQuMT5TbIait8bN' +
        'yr+slXtjTkA5O0VVa4KZrLrBwLeplYBrWUxFRU1aa36Roq61ta+klYNyY1dRUFVfbHyL' +
        'maOpqqaekoV3a2JcW15lb3uGkZmen52Xj4V8c2xoZmhtc3uDio+TlJOPioR+eXVycnN1' +
        'eX2BhIeIiYiGhIKAfn19fX5+f4A=';
      const audio = new Audio('data:audio/wav;base64,' + beepB64);
      audio.play().catch(() => window.alert('Pomodoro session complete!'));
    } catch {
      window.alert('Pomodoro session complete!');
    }
  }

  // -------------------------------------------------------------------------
  // Tick
  // -------------------------------------------------------------------------

  function _tick() {
    _remaining -= 1;
    _display.textContent = formatCountdown(_remaining);

    if (_remaining <= 0) {
      clearInterval(_intervalId);
      _intervalId = null;
      _running = false;
      _applyFinishedState();
      _notifySessionEnd();
    }
  }

  // -------------------------------------------------------------------------
  // Control handlers
  // -------------------------------------------------------------------------

  function _onStart() {
    // Guard: do nothing if already running or finished (remaining === 0)
    if (_running || _remaining <= 0) return;
    _running = true;
    _intervalId = setInterval(_tick, 1000);
    _applyRunningState();
  }

  function _onStop() {
    if (!_running) return;
    clearInterval(_intervalId);
    _intervalId = null;
    _running = false;
    _applyIdleState(); // returns to PAUSED/IDLE — Start re-enabled
  }

  function _onReset() {
    clearInterval(_intervalId);
    _intervalId = null;
    _running = false;
    _remaining = 1500;
    _display.textContent = formatCountdown(_remaining);
    _applyIdleState();
  }

  // -------------------------------------------------------------------------
  // Public interface
  // -------------------------------------------------------------------------

  return {
    /**
     * Resolve DOM refs, render 25:00, apply IDLE button state,
     * and bind Start / Stop / Reset click handlers.
     * Requirements: 2.1, 2.9
     */
    init() {
      _display  = document.getElementById('timer-display');
      _btnStart = document.getElementById('timer-start');
      _btnStop  = document.getElementById('timer-stop');
      _btnReset = document.getElementById('timer-reset');

      // Initialise state
      _remaining  = 1500;
      _running    = false;
      _intervalId = null;

      // Render initial display
      _display.textContent = formatCountdown(_remaining); // "25:00"

      // Apply IDLE button state (Req 2.1, 2.9)
      _applyIdleState();

      // Bind control handlers
      _btnStart.addEventListener('click', _onStart);
      _btnStop.addEventListener('click',  _onStop);
      _btnReset.addEventListener('click', _onReset);
    },

    // Expose pure helper for testing (Property 3)
    _formatCountdown: formatCountdown,
  };
})();

/* --------------------------------------------------------------------------
   Task List Module
   Manages the in-memory task array; syncs to localStorage after every mutation.
   -------------------------------------------------------------------------- */
const TaskListModule = (function () {
  let _tasks = [];

  function _loadTasks() {
    const raw = StorageUtil.get('tld_tasks');
    if (!Array.isArray(raw)) {
      if (raw !== null) {
        StorageUtil.showWarning('Saved tasks could not be loaded (corrupted data). Starting with an empty list.');
      }
      return [];
    }
    return raw.filter(
      t =>
        typeof t.id === 'string' &&
        typeof t.text === 'string' &&
        typeof t.done === 'boolean'
    );
  }

  function _persist() {
    StorageUtil.set('tld_tasks', _tasks);
  }

  function _generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function _validateText(text) {
    if (!text || text.trim().length === 0) return 'Task description cannot be empty.';
    if (text.trim().length > 500) return 'Task description cannot exceed 500 characters.';
    return null;
  }

  return {
    /**
     * Load tasks from storage, render the list, and wire the add-task form.
     * Requirements: 4.2, 4.3, 4.5
     */
    init() {
      _tasks = _loadTasks();
      this.render();

      // Wire add-task form submission (guard with data attribute to prevent double-binding)
      const form = document.getElementById('task-add-form');
      if (form && !form.dataset.bound) {
        form.dataset.bound = 'true';
        form.addEventListener('submit', e => {
          e.preventDefault();
          const input = document.getElementById('task-input');
          if (input) this.addTask(input.value);
        });
      }
    },

    addTask(text) {
      const errorMsg = _validateText(text);
      const errorEl  = document.getElementById('task-input-error');
      if (errorMsg) {
        if (errorEl) errorEl.textContent = errorMsg;
        return;
      }
      if (errorEl) errorEl.textContent = '';

      const task = {
        id: _generateId(),
        text: text.trim(),
        done: false,
        createdAt: Date.now(),
      };
      _tasks.push(task);
      _persist();
      this.render();

      const input = document.getElementById('task-input');
      if (input) input.value = '';
    },

    editTask(id, text) {
      const errorMsg = _validateText(text);
      if (errorMsg) {
        // Discard edit silently, revert to display text
        this.render();
        return;
      }
      const task = _tasks.find(t => t.id === id);
      if (task) {
        task.text = text.trim();
        _persist();
      }
      this.render();
    },

    toggleTask(id) {
      const task = _tasks.find(t => t.id === id);
      if (task) {
        task.done = !task.done;
        _persist();
        this.render();
      }
    },

    deleteTask(id) {
      const idx = _tasks.findIndex(t => t.id === id);
      if (idx !== -1) {
        _tasks.splice(idx, 1);
        _persist();
        this.render();
      }
    },

    render() {
      const list    = document.getElementById('task-list');
      const input   = document.getElementById('task-input');
      const addBtn  = document.getElementById('task-add-btn');
      if (!list) return;

      // Enforce 500-item cap on the add form
      const atCap = _tasks.length >= 500;
      if (input) input.disabled = atCap;
      if (addBtn) addBtn.disabled = atCap;

      list.innerHTML = '';

      // Sort ascending by createdAt (insertion order)
      const sorted = [..._tasks].sort((a, b) => a.createdAt - b.createdAt);

      sorted.forEach(task => {
        const li = document.createElement('li');
        li.className = 'task__item' + (task.done ? ' task__item--done' : '');
        li.dataset.id = task.id;

        // Completion toggle
        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.checked = task.done;
        toggle.setAttribute('aria-label', 'Mark task complete');
        toggle.addEventListener('change', () => this.toggleTask(task.id));

        // Text span
        const textSpan = document.createElement('span');
        textSpan.className = 'task__text';
        textSpan.textContent = task.text;

        // Edit button
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn btn--icon';
        editBtn.setAttribute('aria-label', 'Edit task');
        editBtn.textContent = '✏';
        editBtn.addEventListener('click', () => this._openEditMode(li, task));

        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn btn--icon';
        deleteBtn.setAttribute('aria-label', 'Delete task');
        deleteBtn.textContent = '✕';
        deleteBtn.addEventListener('click', () => this.deleteTask(task.id));

        li.append(toggle, textSpan, editBtn, deleteBtn);
        list.appendChild(li);
      });
    },

    _openEditMode(li, task) {
      // Close any other open edit fields first (edit-mode exclusivity).
      // querySelectorAll returns a static NodeList, so we check length once
      // and call render() at most once to discard any unsaved changes (Req 3.4).
      const list = document.getElementById('task-list');
      if (list && list.querySelectorAll('.task__edit-input').length > 0) {
        this.render();
      }

      // Re-query li after potential re-render
      const currentLi = document.querySelector(`[data-id="${task.id}"]`);
      if (!currentLi) return;

      currentLi.innerHTML = '';

      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = task.done;
      toggle.setAttribute('aria-label', 'Mark task complete');
      toggle.addEventListener('change', () => this.toggleTask(task.id));

      const editInput = document.createElement('input');
      editInput.type = 'text';
      editInput.className = 'task__edit-input';
      editInput.value = task.text;
      editInput.maxLength = 500;
      editInput.setAttribute('aria-label', 'Edit task text');

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'btn btn--primary';
      saveBtn.textContent = 'Save';
      saveBtn.addEventListener('click', () => this.editTask(task.id, editInput.value));

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn btn--secondary';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', () => this.render());

      editInput.addEventListener('keydown', e => {
        if (e.key === 'Enter')  this.editTask(task.id, editInput.value);
        if (e.key === 'Escape') this.render();
      });

      currentLi.append(toggle, editInput, saveBtn, cancelBtn);
      editInput.focus();
    },
  };
})();

/* --------------------------------------------------------------------------
   Quick Links Module
   Manages the in-memory quick-link array; renders shortcut buttons.
   -------------------------------------------------------------------------- */
const QuickLinksModule = (function () {
  let _links = [];

  function _loadLinks() {
    const raw = StorageUtil.get('tld_links');
    if (!Array.isArray(raw)) {
      if (raw !== null) {
        StorageUtil.showWarning('Saved quick links could not be loaded (corrupted data). Starting with an empty list.');
      }
      return [];
    }
    return raw.filter(
      l =>
        typeof l.id === 'string' &&
        typeof l.label === 'string' &&
        typeof l.url === 'string'
    );
  }

  function _persist() {
    StorageUtil.set('tld_links', _links);
  }

  function _generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

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

  return {
    init() {
      // Disable add-link inputs before loading/rendering (Req 6.2 — enable only after render)
      const labelInput = document.getElementById('quicklink-label-input');
      const urlInput   = document.getElementById('quicklink-url-input');
      const addBtn     = document.getElementById('quicklink-add-btn');
      if (labelInput) labelInput.disabled = true;
      if (urlInput)   urlInput.disabled   = true;
      if (addBtn)     addBtn.disabled     = true;

      _links = _loadLinks();
      this.render();

      // Enable add-link input only after render completes (Req 6.2)
      if (labelInput) labelInput.disabled = false;
      if (urlInput)   urlInput.disabled   = false;
      if (addBtn)     addBtn.disabled     = _links.length >= 50;

      // Wire add-link form submission
      const form = document.getElementById('quicklink-add-form');
      if (form && !form.dataset.bound) {
        form.dataset.bound = 'true';
        form.addEventListener('submit', e => {
          e.preventDefault();
          const label = (labelInput && labelInput.value) || '';
          const url   = (urlInput   && urlInput.value)   || '';
          this.addLink(label, url);
        });
      }
    },

    addLink(label, url) {
      const { labelError, urlError } = validateLink(label, url);
      const labelErr  = document.getElementById('quicklink-label-error');
      const urlErr    = document.getElementById('quicklink-url-error');

      if (labelErr) labelErr.textContent = labelError || '';
      if (urlErr)   urlErr.textContent   = urlError   || '';

      if (labelError || urlError) return;

      const link = {
        id: _generateId(),
        label: label.trim(),
        url: normaliseUrl(url),
      };
      _links.push(link);
      _persist();
      this.render();

      // Clear inputs on success
      const labelInput = document.getElementById('quicklink-label-input');
      const urlInput   = document.getElementById('quicklink-url-input');
      if (labelInput) labelInput.value = '';
      if (urlInput)   urlInput.value   = '';
    },

    deleteLink(id) {
      const idx = _links.findIndex(l => l.id === id);
      if (idx !== -1) {
        _links.splice(idx, 1);
        _persist();
        this.render();
      }
    },

    render() {
      const container   = document.getElementById('quicklinks-list');
      const capMessage  = document.getElementById('quicklinks-cap-message');
      const labelInput  = document.getElementById('quicklink-label-input');
      const urlInput    = document.getElementById('quicklink-url-input');
      const addBtn      = document.getElementById('quicklink-add-btn');
      if (!container) return;

      const atCap = _links.length >= 50;

      // Cap enforcement
      if (capMessage) capMessage.hidden = !atCap;
      if (labelInput) labelInput.disabled = atCap;
      if (urlInput)   urlInput.disabled   = atCap;
      if (addBtn)     addBtn.disabled     = atCap;

      container.innerHTML = '';

      _links.forEach(link => {
        const item = document.createElement('div');
        item.className = 'quicklink__item';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'quicklink__btn';
        btn.textContent = link.label;
        btn.setAttribute('aria-label', `Open ${link.label}`);
        btn.addEventListener('click', () => window.open(link.url, '_blank', 'noopener,noreferrer'));

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'quicklink__delete';
        deleteBtn.setAttribute('aria-label', `Delete ${link.label}`);
        deleteBtn.textContent = '✕';
        deleteBtn.addEventListener('click', () => this.deleteLink(link.id));

        item.append(btn, deleteBtn);
        container.appendChild(item);
      });
    },

    // Expose helpers for testing (Properties 10, 11)
    normaliseUrl: normaliseUrl,
    validateLink: validateLink,
  };
})();

/* --------------------------------------------------------------------------
   DOMContentLoaded — Wire all modules
   -------------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', function () {
  const loadingEl  = document.getElementById('loading-indicator');
  const dashboardEl = document.getElementById('dashboard');

  // 3-second timeout for load failure (Req 8.5)
  const loadTimeout = setTimeout(() => {
    if (loadingEl && !loadingEl.classList.contains('is-hidden')) {
      loadingEl.innerHTML = '<span>Dashboard could not be loaded. Please refresh the page.</span>';
    }
  }, 3000);

  try {
    StorageUtil.init();
    GreetingModule.init();
    TimerModule.init();
    TaskListModule.init();
    QuickLinksModule.init();

    clearTimeout(loadTimeout);

    // Reveal dashboard, hide loading indicator
    if (loadingEl)   loadingEl.classList.add('is-hidden');
    if (dashboardEl) dashboardEl.hidden = false;
  } catch (e) {
    clearTimeout(loadTimeout);
    if (loadingEl) {
      loadingEl.innerHTML =
        '<span>An error occurred loading the dashboard: ' +
        (e && e.message ? e.message : 'Unknown error') +
        '. Please refresh the page.</span>';
    }
    console.error('Dashboard initialisation error:', e);
  }
});
