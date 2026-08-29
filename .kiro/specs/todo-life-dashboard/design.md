# Design Document — Todo Life Dashboard

## Overview

The Todo Life Dashboard is a zero-dependency, single-page personal productivity homepage. It is delivered as three static files — `index.html`, `css/style.css`, and `js/app.js` — and runs entirely in the browser with no build step, no framework, and no backend. All persistent state lives in `localStorage`.

The page is composed of four independent widgets that are initialised once at page load and communicate only through shared `localStorage` keys and direct DOM manipulation within their own scope. There is no global event bus, no virtual DOM, and no module bundler. Each widget is implemented as a self-contained JavaScript object (module pattern via IIFE) inside `app.js`.

### Design Goals

- **Zero external requests at runtime** — all assets are bundled in the three files; no CDN calls.
- **Resilient storage** — every `localStorage` access is wrapped in `try/catch`; failures degrade gracefully to in-memory operation with a visible (non-blocking) warning banner.
- **Strict browser API surface** — only APIs present in Chrome 109+, Firefox 109+, Edge 109+, and Safari 16+ are used, matching the compatibility table in the requirements.
- **Progressive enhancement** — HTML structure is meaningful on its own; CSS provides layout and visual polish; JS adds interactivity.

---

## Architecture

The application has a flat, three-layer structure. There is no routing, no state-management library, and no build pipeline.

```
┌─────────────────────────────────────────────────┐
│                  index.html                      │
│  ┌─────────────────────────────────────────────┐ │
│  │               css/style.css                  │ │
│  └─────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────┐ │
│  │                js/app.js                     │ │
│  │  ┌──────────┐ ┌────────┐ ┌────────────────┐ │ │
│  │  │ Greeting │ │ Timer  │ │   TaskList     │ │ │
│  │  │  Module  │ │ Module │ │    Module      │ │ │
│  │  └──────────┘ └────────┘ └────────────────┘ │ │
│  │  ┌───────────────────────────────────────┐   │ │
│  │  │          QuickLinks Module            │   │ │
│  │  └───────────────────────────────────────┘   │ │
│  │  ┌───────────────────────────────────────┐   │ │
│  │  │          Storage Utility              │   │ │
│  │  └───────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**Initialisation flow:**

```
DOMContentLoaded
    ├── StorageUtil.init()       // detect localStorage availability
    ├── GreetingModule.init()    // render + start 60s interval
    ├── TimerModule.init()       // render 25:00, bind controls
    ├── TaskListModule.init()    // load from storage, render list
    └── QuickLinksModule.init()  // load from storage, render links
```

No module depends on another module's internal state. The Storage Utility is the only shared helper.

---

## Components and Interfaces

### 1. Storage Utility (`StorageUtil`)

Centralises all `localStorage` access. All reads/writes anywhere in `app.js` go through this utility.

```javascript
StorageUtil = {
  available: Boolean,     // set during init(); false if localStorage throws
  init(),                 // probes localStorage; sets available
  get(key) → value|null,  // JSON.parse; returns null on parse error or miss
  set(key, value),        // JSON.stringify; shows global warning if unavailable
  showWarning(message),   // renders non-blocking warning banner in DOM
  dismissWarning()        // removes the banner
}
```

**Error handling contract:**
- `get()` catches `JSON.parse` errors and returns `null` (caller treats as "no data").
- `set()` catches write errors (quota exceeded, security error) and calls `showWarning()`.
- Neither method throws; callers do not need their own `try/catch`.

---

### 2. Greeting Module (`GreetingModule`)

Reads `Date` from the browser and renders time, date, and salutation. Runs a `setInterval` that refreshes every 60 000 ms.

**Public interface:**

```javascript
GreetingModule = {
  init(),      // render immediately, start interval
  render(),    // called by init() and by the interval tick
  destroy()    // clearInterval; used in tests
}
```

**Key internal functions:**

- `formatTime(date) → "HH:MM"` — zero-padded 24-hour hours and minutes.
- `formatDate(date) → "Weekday, Month DD, YYYY"` — uses `Date` methods (`toLocaleDateString` with `{ weekday:'long', year:'numeric', month:'long', day:'numeric' }` in the browser locale, or a manual fallback if `Intl` is unavailable).
- `getSalutation(hour) → string` — pure function; returns one of four salutation strings based on the hour (0–23).

---

### 3. Timer Module (`TimerModule`)

Manages a Pomodoro countdown. State is kept in memory only — the timer is not persisted to `localStorage` (a browser refresh resets to 25:00, which is standard Pomodoro behaviour).

**Public interface:**

```javascript
TimerModule = {
  init(),    // render 25:00, bind Start/Stop/Reset buttons
  // internal state (not exposed):
  //   _remaining: Number (seconds)
  //   _intervalId: Number|null
  //   _running: Boolean
}
```

**Control state machine:**

```
          ┌──────────────────────────────────┐
          │             IDLE (25:00)          │
          │  Start: enabled                  │
          │  Stop:  disabled                 │
          │  Reset: enabled (no-op if idle)  │
          └───────────┬──────────────────────┘
                      │ Start pressed
                      ▼
          ┌──────────────────────────────────┐
          │            RUNNING               │
          │  Start: disabled                 │
          │  Stop:  enabled                  │
          │  Reset: enabled                  │
          └──────┬──────────────┬────────────┘
      Stop pressed│              │ reaches 00:00
                  ▼              ▼
          ┌────────────┐  ┌──────────────────┐
          │  PAUSED    │  │   FINISHED       │
          │ Start: on  │  │  Start: disabled  │
          │ Stop: off  │  │  Stop:  disabled  │
          │ Reset: on  │  │  Reset: enabled  │
          └──────┬─────┘  └──────────────────┘
        Start    │ Reset
        pressed  │ pressed
          │      ▼
          │  ┌──────────────────┐
          └─►│      IDLE        │
             └──────────────────┘
```

**Tick algorithm:**

```
every second (setInterval, 1000 ms):
    _remaining -= 1
    update display (formatCountdown(_remaining))
    if _remaining <= 0:
        clearInterval(_intervalId)
        _running = false
        updateButtonStates(FINISHED)
        notifySessionEnd()
```

`notifySessionEnd()` first attempts `new Audio(...)` with a short base64-encoded beep tone; if the `Audio` constructor throws (unsupported environment), it falls back to `window.alert()`.

---

### 4. Task List Module (`TaskListModule`)

Manages the in-memory task array and syncs it to `localStorage` after every mutation. Renders the full list by rebuilding the DOM subtree of the list container (no virtual DOM diffing required at this scale).

**Public interface:**

```javascript
TaskListModule = {
  init(),             // load from storage, render
  addTask(text),      // validate, push, persist, re-render
  editTask(id, text), // validate, update, persist, re-render
  toggleTask(id),     // flip done, persist, re-render
  deleteTask(id),     // splice, persist, re-render
  render()            // rebuild the list DOM from _tasks[]
}
```

**Task ID:** Generated with `Date.now().toString(36) + Math.random().toString(36).slice(2)` — a short, collision-resistant string requiring no external library.

**Validation:**
- Empty / whitespace-only: rejected; inline message shown below input.
- > 500 characters: rejected; inline message shown below input.
- Validation messages are inserted as `<span role="alert">` elements so screen readers announce them.

**Edit-mode exclusivity:** Only one task row can be in edit mode at a time. When a new row enters edit mode, any currently open edit field is immediately discarded (unsaved changes lost — per requirement 3.4).

**Re-render strategy:** On every mutation, `render()` clears `innerHTML` of the list `<ul>` and reconstructs all `<li>` elements from the `_tasks` array. This is safe at the 500-task cap.

---

### 5. Quick Links Module (`QuickLinksModule`)

Manages the in-memory quick-link array, renders shortcut `<button>` elements, and enforces the 50-link cap.

**Public interface:**

```javascript
QuickLinksModule = {
  init(),               // load from storage, render
  addLink(label, url),  // validate, normalise URL, push, persist, re-render
  deleteLink(id),       // splice, persist, re-render
  render()              // rebuild the links DOM
}
```

**URL normalisation:** If the URL does not start with `http://` or `https://` (case-insensitive prefix check), prepend `https://` before saving.

**Cap enforcement:** When `_links.length >= 50`, the add-link form inputs and submit button are disabled, and a cap-reached message is shown. Re-enabling happens automatically when a link is deleted and the count drops below 50.

---

## Data Models

### LocalStorage Keys

| Key | Owner Module | Value Type |
|-----|--------------|-----------|
| `tld_tasks` | TaskListModule | `Task[]` (JSON array) |
| `tld_links` | QuickLinksModule | `QuickLink[]` (JSON array) |

The `tld_` prefix (Todo Life Dashboard) prevents key collisions with other pages sharing the same origin.

---

### Task

```typescript
interface Task {
  id: string;       // unique short ID, e.g. "lf3k2abc7"
  text: string;     // 1–500 characters, trimmed on save
  done: boolean;    // false = incomplete, true = complete
  createdAt: number; // Unix ms timestamp; used to maintain insertion order
}
```

**Constraints enforced before saving:**
- `text.trim().length` must be ≥ 1 and ≤ 500.
- `done` must be a boolean (guarded during deserialization).
- Maximum 500 items in the array.

**Example:**

```json
[
  { "id": "lf3k2abc7", "text": "Write design doc", "done": false, "createdAt": 1722211200000 },
  { "id": "lf3k2abd8", "text": "Review PR",        "done": true,  "createdAt": 1722211260000 }
]
```

---

### QuickLink

```typescript
interface QuickLink {
  id: string;    // unique short ID
  label: string; // 1–100 characters, trimmed on save
  url: string;   // normalised URL (always starts with http:// or https://)
}
```

**Constraints enforced before saving:**
- `label.trim().length` must be ≥ 1 and ≤ 100.
- `url.trim().length` must be ≥ 1 and ≤ 2048.
- URL is normalised (https:// prepended if no protocol present).
- Maximum 50 items in the array.

**Example:**

```json
[
  { "id": "m1a3n0bc1", "label": "GitHub",  "url": "https://github.com" },
  { "id": "m1a3n0bd2", "label": "MDN Docs", "url": "https://developer.mozilla.org" }
]
```

---

### LocalStorage Deserialization Guard

When reading from `localStorage`, each module validates the parsed value before use:

```javascript
function loadTasks() {
  const raw = StorageUtil.get('tld_tasks');
  if (!Array.isArray(raw)) return [];
  return raw.filter(t =>
    typeof t.id === 'string' &&
    typeof t.text === 'string' &&
    typeof t.done === 'boolean'
  );
}
```

Items that fail validation are silently dropped. If the result is an empty array (all items invalid or key missing), requirement 4.5 is satisfied — the module renders an empty list and shows a warning if the raw value was non-null and non-array.

---

## Key Algorithms

### Greeting Salutation

```javascript
function getSalutation(hour) {
  if (hour >= 5  && hour <= 11) return 'Good Morning';
  if (hour >= 12 && hour <= 17) return 'Good Afternoon';
  if (hour >= 18 && hour <= 23) return 'Good Evening';
  return 'Good Night'; // 0–4
}
```

### Time Formatting

```javascript
function formatTime(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
```

### Countdown Display

```javascript
function formatCountdown(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
```

### Task ID Generation

```javascript
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
```

### LocalStorage Read/Write Pattern

```javascript
// StorageUtil.get
get(key) {
  if (!this.available) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
},

// StorageUtil.set
set(key, value) {
  if (!this.available) { this.showWarning('Storage unavailable…'); return; }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    this.showWarning('Could not save data: ' + e.message);
  }
}
```

---

## UI Layout

### File Structure

```
project-root/
├── index.html          ← single HTML file; all widget markup
├── css/
│   └── style.css       ← all styles; no external fonts or icon libraries
└── js/
    └── app.js          ← all JavaScript; four module IIFEs + StorageUtil
```

### Page Layout (Responsive Grid)

The page uses CSS Grid with a single-column layout on narrow viewports and a two-column layout on wider screens.

```
┌────────────────────────────────────────┐
│             #greeting-widget            │  ← full-width top row
├───────────────────┬────────────────────┤
│   #timer-widget   │  #tasks-widget     │  ← side by side ≥ 768 px
├───────────────────┴────────────────────┤
│           #quicklinks-widget            │  ← full-width bottom row
└────────────────────────────────────────┘
```

On viewports < 768 px (mobile), all four widgets stack vertically in a single column.

**Breakpoints:**

| Breakpoint | Layout |
|-----------|--------|
| < 768 px | 1-column stack |
| 768 px – 1279 px | 2-column grid (timer left, tasks right) |
| ≥ 1280 px | 2-column grid with increased padding and max-width container |

**Viewport width compliance (Req 8.3):** The outermost container uses `max-width: 1440px; margin: 0 auto; padding: 0 1rem;` so that content is never clipped from 320 px to 2560 px.

### Accessibility

- All interactive elements use native `<button>` and `<input>` elements (keyboard accessible by default).
- Validation error messages are wrapped in `<span role="alert">` so they are announced by screen readers immediately.
- Contrast ratio target: ≥ 4.5:1 for body text (≥ 14 px normal), ≥ 3:1 for large text (18 px or 14 px bold), per WCAG 2.1 AA (Req 8.4).
- Timer end notification uses `alert()` as an accessible fallback when the `Audio` API is unavailable.

### Warning Banner

A single, reusable non-blocking banner element is injected at the top of the page by `StorageUtil.showWarning()`:

```html
<div id="storage-warning" role="alert" aria-live="polite">
  ⚠ <span id="storage-warning-text"></span>
  <button id="storage-warning-dismiss" aria-label="Dismiss warning">✕</button>
</div>
```

The banner is hidden by default via CSS (`display: none`) and shown/hidden by toggling a CSS class.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Salutation completeness and correctness

*For any* integer hour in the range 0–23, `getSalutation(hour)` SHALL return exactly one of the four strings `"Good Morning"`, `"Good Afternoon"`, `"Good Evening"`, or `"Good Night"`, with the mapping being complete (every hour covered), non-overlapping (each hour maps to exactly one string), and correct per the defined hour ranges (0–4 → Night, 5–11 → Morning, 12–17 → Afternoon, 18–23 → Evening).

**Validates: Requirements 1.3, 1.4, 1.5, 1.6**

---

### Property 2: Time format invariant

*For any* valid `Date` object, `formatTime(date)` SHALL return a string that matches the regular expression `^\d{2}:\d{2}$` with the first two digits representing hours in the range 00–23 and the last two representing minutes in the range 00–59.

**Validates: Requirements 1.1**

---

### Property 3: Countdown format invariant

*For any* integer number of seconds in the range 0–1500 (0 to 25 minutes), `formatCountdown(seconds)` SHALL return a string matching `^\d{2}:\d{2}$` where the minute portion equals `Math.floor(seconds / 60)` (zero-padded) and the second portion equals `seconds % 60` (zero-padded).

**Validates: Requirements 2.1, 2.3**

---

### Property 4: Task addition grows the list and persists

*For any* task text of length 1–500 characters with at least one non-whitespace character, calling `addTask(text)` SHALL increase the in-memory task list length by exactly one, and immediately after the call `StorageUtil.get('tld_tasks')` SHALL return an array containing a task whose `text` equals the trimmed input and whose `done` is `false`.

**Validates: Requirements 3.1, 4.1**

---

### Property 5: Whitespace and over-length task rejection

*For any* string that is either entirely whitespace or has length greater than 500 characters, `addTask(text)` SHALL leave the in-memory task list length unchanged and SHALL not write a new task entry to `localStorage`.

**Validates: Requirements 3.2, 3.3**

---

### Property 6: Task completion toggle is an involution

*For any* task in the list, toggling its completion state twice in succession SHALL return the task to its original `done` value — that is, `toggleTask` is its own inverse.

**Validates: Requirements 3.7, 3.8**

---

### Property 7: Task delete removes exactly the targeted task

*For any* task list and any task `id` present in that list, calling `deleteTask(id)` SHALL remove the task with that `id` from the list while leaving all other tasks present and in their original relative order.

**Validates: Requirements 3.9, 3.10**

---

### Property 8: Task list insertion-order invariant

*For any* sequence of add, edit, toggle, and delete operations on the task list, the order of surviving tasks as returned by `TaskListModule.render()` SHALL always match ascending `createdAt` order, never permuting surviving tasks relative to each other.

**Validates: Requirements 3.10**

---

### Property 9: Task persistence round-trip

*For any* valid `Task[]` array serialized to `localStorage` under `tld_tasks`, calling `TaskListModule.init()` SHALL produce an in-memory task array that is deeply equal (same `id`, `text`, `done`, `createdAt` for every element) to the stored array, rendered in the same order.

**Validates: Requirements 4.1, 4.2**

---

### Property 10: QuickLink URL normalisation

*For any* URL string that does not begin with `http://` or `https://` (case-insensitive), the URL stored by `addLink` SHALL equal `"https://"` concatenated with the original trimmed string.

*For any* URL string that already begins with `http://` or `https://`, the URL stored by `addLink` SHALL equal the original trimmed string unchanged.

**Validates: Requirements 5.3**

---

### Property 11: QuickLink validation rejects invalid inputs

*For any* combination of `(label, url)` where `label.trim().length === 0`, `label.trim().length > 100`, `url.trim().length === 0`, or `url.trim().length > 2048`, calling `addLink(label, url)` SHALL leave the quick-link list unchanged and SHALL not write a new entry to `localStorage`.

**Validates: Requirements 5.2**

---

### Property 12: QuickLink persistence round-trip

*For any* valid `QuickLink[]` array written to `localStorage` under `tld_links`, calling `QuickLinksModule.init()` SHALL render all links with the same `label` and `url` values and in the same insertion order as stored.

**Validates: Requirements 5.6, 5.7, 6.1, 6.2**

---

### Property 13: Storage deserialization safety

*For any* arbitrary string stored under `tld_tasks` or `tld_links` in `localStorage` (including malformed JSON, non-array values, arrays with missing or wrongly-typed fields), calling the respective module's `init()` SHALL return a valid (possibly empty) in-memory array and SHALL not throw an uncaught exception.

**Validates: Requirements 4.5, 6.5**

---

## Error Handling

### LocalStorage Unavailability

`StorageUtil.init()` runs a probe write/read/delete at startup. If it throws, `StorageUtil.available` is set to `false`. All subsequent `set()` calls become no-ops that show the warning banner. All `get()` calls return `null`. Modules detect `null` and initialise from empty state, operating in-memory for the session.

### LocalStorage Quota Exceeded

`StorageUtil.set()` catches `DOMException` (QuotaExceededError). The warning banner is shown with a message stating that data could not be saved. The in-memory state remains correct; only persistence fails.

### Corrupted / Unexpected Data on Load

Each module's load function filters deserialized data through a type guard (see Deserialization Guard above). If the top-level value is not an array, the module renders an empty list and, if the raw key existed with a non-null, non-array value, calls `StorageUtil.showWarning()` to inform the user (Req 4.5, 6.5).

### Timer Edge Cases

- Start pressed at 00:00 — the button is disabled in FINISHED state; the handler is never invoked.
- Reset pressed while running — the interval is cleared before the state is reset to prevent a stale tick.
- Multiple rapid clicks on Start — the handler guards with `if (_running) return;` to prevent multiple intervals.

### Greeting Time Unavailable

`new Date()` does not throw in any supported browser. However, if `getHours()` returns `NaN` (theoretically impossible but guarded for robustness), `getSalutation` returns `"Good Day"` as a safe fallback, and `formatTime` renders `"--:--"` to satisfy Req 1.8.

---

## Testing Strategy

### Unit Tests

Unit tests cover pure functions and deterministic logic. They should be written using a lightweight test harness (e.g., a `tests/` directory with plain JS assertions and `console.assert`, or a minimal framework like **uvu** or **node:test** if a Node environment is acceptable for test-only use).

Focus areas:
- `getSalutation(hour)` — all 24 hours, boundary values (0, 4, 5, 11, 12, 17, 18, 23).
- `formatTime(date)` — midnight, noon, 9:05 AM (leading zeros), 23:59.
- `formatCountdown(seconds)` — 0, 1, 59, 60, 1499, 1500.
- `validateTask(text)` — empty string, whitespace-only, 500-char boundary, 501-char boundary.
- `validateQuickLink(label, url)` — empty label, 100-char label, 101-char label, missing protocol, http://, https://.
- `generateId()` — uniqueness across 10 000 sequential calls.
- `StorageUtil.get/set` — mock `localStorage`; test parse error, quota error, unavailable.

### Property-Based Tests

Property-based testing is applicable to this feature. The feature includes pure functions with clear input/output behavior (salutation mapping, time formatting, countdown formatting, URL normalisation, task validation, serialisation round-trips) where input variation reveals edge cases and 100+ iterations provide meaningful coverage.

**Recommended library:** [fast-check](https://github.com/dubzzz/fast-check) (works in Node; tests run as a separate build-free test suite).

Each property test must run a minimum of **100 iterations**.

Tag format: `// Feature: todo-life-dashboard, Property N: <property_text>`

**Property test mapping:**

| Design Property | Test Description | Generator |
|-----------------|-----------------|-----------|
| P1: Salutation completeness | For all hours 0–23, getSalutation returns one of 4 correct strings | `fc.integer({ min: 0, max: 23 })` |
| P2: Time format invariant | For all Dates, formatTime matches `^\d{2}:\d{2}$` | `fc.date()` |
| P3: Countdown format invariant | For all seconds 0–1500, formatCountdown matches `^\d{2}:\d{2}$` | `fc.integer({ min: 0, max: 1500 })` |
| P4: Task addition grows list and persists | For all valid texts, addTask grows list by 1 and persists it | `fc.string({ minLength: 1, maxLength: 500 }).filter(s => s.trim().length > 0)` |
| P5: Whitespace/over-length rejection | For all invalid texts, addTask leaves list unchanged | `fc.oneof(fc.stringOf(fc.constantFrom(' ','\t','\n')), fc.string({ minLength: 501 }))` |
| P6: Toggle is involution | For any task, toggle twice returns original done value | `fc.boolean()` (initial done state) |
| P7: Delete removes exactly target | For any list and id, deleteTask removes only that id | `fc.array(taskArbitrary(), { minLength: 1 })` |
| P8: Task insertion-order invariant | For any op sequence, order matches createdAt ascending | `fc.array(fc.oneof(addOpArb, deleteOpArb, toggleOpArb))` |
| P9: Task persistence round-trip | For any Task[], init renders deeply equal array | `fc.array(taskArbitrary())` |
| P10: URL normalisation | For any URL, normalised URL starts with http:// or https:// | `fc.string()` / `fc.webUrl()` |
| P11: QuickLink invalid input rejection | For any invalid (label, url) pair, addLink leaves list unchanged | `fc.oneof(emptyLabelArb, longLabelArb, emptyUrlArb, longUrlArb)` |
| P12: QuickLink persistence round-trip | For any QuickLink[], init renders same order | `fc.array(quickLinkArbitrary())` |
| P13: Storage deserialization safety | For any arbitrary string in storage keys, init does not throw | `fc.string()` |

### Integration / Smoke Tests

These are run manually or via a headless browser (e.g., Playwright) and cover:
- Full page load in each supported browser — verify all four widgets render within 1 s.
- `localStorage` disabled (private browsing with storage blocked) — verify warning banner appears and widgets remain functional.
- Viewport resize from 320 px to 2560 px — verify no horizontal overflow.
- Timer end notification — verify alert fires at 00:00.
- Page reload after adding tasks and links — verify persistence.
