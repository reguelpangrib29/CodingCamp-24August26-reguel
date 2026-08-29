# Implementation Plan: Todo Life Dashboard

## Overview

Build a zero-dependency, single-page productivity homepage delivered as three static files (`index.html`, `css/style.css`, `js/app.js`). All state lives in `localStorage`. The implementation follows the module pattern defined in the design document — five IIFEs (StorageUtil, GreetingModule, TimerModule, TaskListModule, QuickLinksModule) wired together in a `DOMContentLoaded` handler.

---

## Tasks

- [ ] 1. Scaffold project file structure and HTML skeleton
  - Create `index.html` at project root with semantic HTML5 structure
  - Add four widget sections: `#greeting-widget`, `#timer-widget`, `#tasks-widget`, `#quicklinks-widget`
  - Add storage warning banner markup (`#storage-warning`) hidden by default
  - Add `<link>` to `css/style.css` and `<script defer>` to `js/app.js`
  - Create `css/style.css` with an empty rule set and reset/base styles
  - Create `js/app.js` with a `DOMContentLoaded` listener and placeholder IIFE stubs for all five modules
  - _Requirements: 7.3_

- [x] 2. Implement StorageUtil module
  - [x] 2.1 Implement `StorageUtil.init()` — probe write/read/delete; set `available` flag
    - Write the probe inside a `try/catch`; set `available = false` on any exception
    - _Requirements: 4.4, 6.4_
  - [x] 2.2 Implement `StorageUtil.get(key)` — `localStorage.getItem` + `JSON.parse` with error handling
    - Catch parse errors and missing-key case; return `null` in both
    - _Requirements: 4.2, 6.2_
  - [x] 2.3 Implement `StorageUtil.set(key, value)` — `JSON.stringify` + `localStorage.setItem` with error handling
    - Guard on `available`; catch `DOMException` (quota); call `showWarning()` on failure
    - _Requirements: 4.1, 4.4, 6.1, 6.4_
  - [x] 2.4 Implement `StorageUtil.showWarning(message)` and `dismissWarning()`
    - Show `#storage-warning` by toggling a CSS class; wire dismiss button
    - Use `role="alert"` and `aria-live="polite"` for accessibility
    - _Requirements: 4.4, 4.5, 6.4, 6.5_
  - [ ]* 2.5 Write property test for storage deserialization safety (Property 13)
    - **Property 13: Storage deserialization safety**
    - **Validates: Requirements 4.5, 6.5**
    - Generator: `fc.string()` stored under `tld_tasks` / `tld_links`; assert init() does not throw and returns a valid array

- [x] 3. Implement Greeting Widget
  - [x] 3.1 Implement pure helper functions: `formatTime(date)`, `formatDate(date)`, `getSalutation(hour)`
    - `formatTime`: zero-padded 24-hour HH:MM; fallback `"--:--"` if `getHours()` returns NaN
    - `formatDate`: use `toLocaleDateString` with `{ weekday:'long', year:'numeric', month:'long', day:'numeric' }`; manual fallback if `Intl` is unavailable
    - `getSalutation`: 0–4 → "Good Night", 5–11 → "Good Morning", 12–17 → "Good Afternoon", 18–23 → "Good Evening"
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8_
  - [ ]* 3.2 Write property test for salutation completeness and correctness (Property 1)
    - **Property 1: Salutation completeness and correctness**
    - **Validates: Requirements 1.3, 1.4, 1.5, 1.6**
    - Generator: `fc.integer({ min: 0, max: 23 })`; assert one of the four strings returned, correct for each hour range
  - [ ]* 3.3 Write property test for time format invariant (Property 2)
    - **Property 2: Time format invariant**
    - **Validates: Requirements 1.1**
    - Generator: `fc.date()`; assert result matches `^\d{2}:\d{2}$` with hours 00–23, minutes 00–59
  - [x] 3.4 Implement `GreetingModule.init()` and `render()`
    - `init()`: call `render()` immediately, then start `setInterval(render, 60000)`
    - `render()`: update DOM elements for time, date, and salutation; wrap `new Date()` in try/catch for req 1.8
    - Wire `destroy()` to `clearInterval` for test teardown
    - _Requirements: 1.1, 1.2, 1.7, 1.8_

- [x] 4. Implement Timer Widget
  - [x] 4.1 Implement `formatCountdown(totalSeconds)` pure helper
    - Zero-padded MM:SS string; `Math.floor(seconds / 60)` for minutes, `seconds % 60` for seconds
    - _Requirements: 2.1, 2.3_
  - [ ]* 4.2 Write property test for countdown format invariant (Property 3)
    - **Property 3: Countdown format invariant**
    - **Validates: Requirements 2.1, 2.3**
    - Generator: `fc.integer({ min: 0, max: 1500 })`; assert result matches `^\d{2}:\d{2}$` with correct minute/second values
  - [x] 4.3 Implement `TimerModule.init()` — render 25:00, bind Start/Stop/Reset buttons
    - Initialise `_remaining = 1500`, `_running = false`, `_intervalId = null`
    - Apply IDLE button state: Start enabled, Stop disabled, Reset enabled
    - _Requirements: 2.1, 2.9_
  - [x] 4.4 Implement Start control handler — begin countdown, transition to RUNNING state
    - Guard: `if (_running || _remaining <= 0) return`
    - Set `_running = true`; start `setInterval` tick (1000 ms); disable Start, enable Stop
    - _Requirements: 2.2, 2.8_
  - [x] 4.5 Implement Stop control handler — pause countdown, transition to PAUSED state
    - `clearInterval`; set `_running = false`; enable Start, disable Stop
    - _Requirements: 2.4, 2.9_
  - [x] 4.6 Implement Reset control handler — stop and reset to 25:00, transition to IDLE state
    - Works from RUNNING, PAUSED, or FINISHED; `clearInterval`; set `_remaining = 1500`; update display; apply IDLE state
    - _Requirements: 2.5, 2.11_
  - [x] 4.7 Implement tick algorithm and session-end notification
    - Each tick: decrement `_remaining`, update display; at 0 → clear interval, set FINISHED state, call `notifySessionEnd()`
    - `notifySessionEnd()`: attempt `new Audio(...)` with base64 beep; fallback to `window.alert()`
    - _Requirements: 2.6, 2.7_

- [x] 5. Checkpoint — ensure Greeting and Timer widgets are fully wired and functional
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Task List Widget — core data operations
  - [x] 6.1 Implement `generateId()` helper and task validation logic
    - `generateId`: `Date.now().toString(36) + Math.random().toString(36).slice(2)`
    - Validation: reject empty/whitespace; reject > 500 chars; return error message string or null
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 6.2 Implement `TaskListModule.init()` — load from storage and render
    - Call `StorageUtil.get('tld_tasks')`; run deserialization guard (filter by type); set `_tasks`; call `render()`
    - If raw key existed but parsed value is not a valid array, call `StorageUtil.showWarning()`
    - _Requirements: 4.2, 4.3, 4.5_
  - [x] 6.3 Implement `TaskListModule.addTask(text)` — validate, push, persist, re-render
    - Trim text; validate; push `{ id, text, done: false, createdAt: Date.now() }`; call `StorageUtil.set`; `render()`
    - Show inline `<span role="alert">` validation error on rejection; clear input on success
    - _Requirements: 3.1, 3.2, 3.3, 4.1_
  - [ ]* 6.4 Write property test for task addition grows list and persists (Property 4)
    - **Property 4: Task addition grows list and persists**
    - **Validates: Requirements 3.1, 4.1**
    - Generator: `fc.string({ minLength: 1, maxLength: 500 }).filter(s => s.trim().length > 0)`; assert list length +1 and storage contains new entry
  - [ ]* 6.5 Write property test for whitespace and over-length task rejection (Property 5)
    - **Property 5: Whitespace and over-length task rejection**
    - **Validates: Requirements 3.2, 3.3**
    - Generator: `fc.oneof(fc.stringOf(fc.constantFrom(' ','\t','\n')), fc.string({ minLength: 501 }))`; assert list length unchanged and storage unmodified
  - [x] 6.6 Implement `TaskListModule.editTask(id, text)` — validate, update, persist, re-render
    - Enforce edit-mode exclusivity: discard any other open edit field before opening a new one
    - On confirm: trim and validate; update matching task's `text`; persist; `render()`
    - On confirm with empty/whitespace: discard edit silently, revert to display text
    - _Requirements: 3.4, 3.5, 3.6_
  - [x] 6.7 Implement `TaskListModule.toggleTask(id)` — flip `done`, persist, re-render
    - Find task by id; flip `done`; persist; `render()`
    - Visual: strikethrough + checked indicator when `done = true`; remove both when `done = false`
    - _Requirements: 3.7, 3.8, 4.1_
  - [ ]* 6.8 Write property test for task completion toggle is an involution (Property 6)
    - **Property 6: Task completion toggle is an involution**
    - **Validates: Requirements 3.7, 3.8**
    - Generator: `fc.boolean()` as initial done state; assert toggle twice returns original value
  - [x] 6.9 Implement `TaskListModule.deleteTask(id)` — splice, persist, re-render
    - Remove task with matching id; persist; `render()`; DOM update within 200 ms
    - _Requirements: 3.9, 3.10, 4.1_
  - [ ]* 6.10 Write property test for task delete removes exactly the targeted task (Property 7)
    - **Property 7: Task delete removes exactly the targeted task**
    - **Validates: Requirements 3.9, 3.10**
    - Generator: `fc.array(taskArbitrary(), { minLength: 1 })`; assert only the targeted id is removed, others remain in original relative order
  - [x] 6.11 Implement `TaskListModule.render()` — rebuild DOM from `_tasks` array
    - Clear `<ul>` `innerHTML`; reconstruct all `<li>` items in `_tasks` order (ascending `createdAt`)
    - Each `<li>`: completion toggle, text display (or edit field), edit button, delete button
    - Cap: if `_tasks.length >= 500`, disable the add-task input and submit button
    - _Requirements: 3.10, 3.11_
  - [ ]* 6.12 Write property test for task insertion-order invariant (Property 8)
    - **Property 8: Task insertion-order invariant**
    - **Validates: Requirements 3.10**
    - Generator: `fc.array(fc.oneof(addOpArb, deleteOpArb, toggleOpArb))`; assert surviving tasks always match ascending `createdAt` order
  - [ ]* 6.13 Write property test for task persistence round-trip (Property 9)
    - **Property 9: Task persistence round-trip**
    - **Validates: Requirements 4.1, 4.2**
    - Generator: `fc.array(taskArbitrary())`; serialise to storage, call `init()`, assert deeply equal array in same order

- [x] 7. Implement Quick Links Widget — core data operations
  - [x] 7.1 Implement Quick Link validation and URL normalisation logic
    - Validation: reject empty label, label > 100 chars, empty URL, URL > 2048 chars; return per-field error message
    - Normalisation: prepend `"https://"` if URL does not start with `http://` or `https://` (case-insensitive)
    - _Requirements: 5.1, 5.2, 5.3_
  - [ ]* 7.2 Write property test for QuickLink URL normalisation (Property 10)
    - **Property 10: QuickLink URL normalisation**
    - **Validates: Requirements 5.3**
    - Generator: `fc.string()` for non-protocol URLs and `fc.webUrl()` for valid URLs; assert stored URL always starts with http:// or https://
  - [ ]* 7.3 Write property test for QuickLink invalid input rejection (Property 11)
    - **Property 11: QuickLink invalid input rejection**
    - **Validates: Requirements 5.2**
    - Generator: `fc.oneof(emptyLabelArb, longLabelArb, emptyUrlArb, longUrlArb)`; assert list length unchanged, storage unmodified
  - [x] 7.4 Implement `QuickLinksModule.init()` — load from storage and render
    - Call `StorageUtil.get('tld_links')`; run deserialization guard; set `_links`; call `render()`
    - If raw value is non-null and non-array, call `StorageUtil.showWarning()`
    - Enable add-link input only after render completes
    - _Requirements: 5.6, 6.2, 6.3, 6.5_
  - [x] 7.5 Implement `QuickLinksModule.addLink(label, url)` — validate, normalise, push, persist, re-render
    - Trim both fields; validate; normalise URL; push `{ id, label, url }`; persist; `render()`
    - Show per-field inline `<span role="alert">` on rejection
    - _Requirements: 5.1, 5.2, 5.3, 6.1_
  - [x] 7.6 Implement `QuickLinksModule.deleteLink(id)` — splice, persist, re-render
    - Remove matching id; persist; `render()`; no confirmation required
    - _Requirements: 5.5, 6.1_
  - [x] 7.7 Implement `QuickLinksModule.render()` — rebuild shortcut buttons from `_links` array
    - Clear container `innerHTML`; render one `<button>` per link with label text and delete control
    - Each button opens URL in new tab (`window.open(url, '_blank')`)
    - Cap: when `_links.length >= 50`, disable add-link form and show cap-reached message; re-enable when count drops below 50
    - _Requirements: 5.4, 5.5, 5.6, 5.8_
  - [ ]* 7.8 Write property test for QuickLink persistence round-trip (Property 12)
    - **Property 12: QuickLink persistence round-trip**
    - **Validates: Requirements 5.6, 5.7, 6.1, 6.2**
    - Generator: `fc.array(quickLinkArbitrary())`; serialise to storage, call `init()`, assert same label/url values in same order

- [ ] 8. Checkpoint — ensure Task List and Quick Links widgets are fully wired and functional
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Implement responsive CSS layout and visual polish
  - [x] 9.1 Implement CSS Grid page layout with responsive breakpoints
    - Single-column stack for viewports < 768 px; two-column grid (timer left, tasks right) for ≥ 768 px
    - Container: `max-width: 1440px; margin: 0 auto; padding: 0 1rem` to prevent overflow at 320–2560 px
    - _Requirements: 7.3, 8.3_
  - [-] 9.2 Implement widget card styles, typography, and interactive element styles
    - Base font: minimum 14 px; enforce ≥ 4.5:1 contrast ratio for normal text, ≥ 3:1 for large text (WCAG 2.1 AA)
    - Style task completion state: strikethrough + checked indicator
    - Style disabled button states and validation error messages
    - _Requirements: 8.2, 8.4_
  - [~] 9.3 Implement warning banner styles and storage-warning show/hide behaviour
    - `#storage-warning` hidden by default (`display: none`); shown by toggling `.is-visible` class
    - Position at top of page; non-blocking (does not prevent interaction with widgets below)
    - _Requirements: 4.4, 6.4_
  - [~] 9.4 Implement loading indicator and render-failure error message
    - Show a `#loading-indicator` element until `DOMContentLoaded` fires; hide it once all modules have initialised
    - If initialisation is not complete within 3 seconds, show an error message in place of the loading indicator
    - _Requirements: 8.5_

- [ ] 10. Wire all modules in `DOMContentLoaded` handler and cross-browser polish
  - [ ] 10.1 Wire initialisation sequence: `StorageUtil.init()` → `GreetingModule.init()` → `TimerModule.init()` → `TaskListModule.init()` → `QuickLinksModule.init()`
    - Wrap each call in a `try/catch`; on uncaught error display per-requirement 7.4 message
    - Remove loading indicator after all modules have initialised successfully
    - _Requirements: 7.1, 7.2, 7.4, 8.1_
  - [ ] 10.2 Audit all DOM interactions for keyboard accessibility and screen-reader compatibility
    - Verify all interactive elements are native `<button>` or `<input>` elements
    - Verify all validation messages use `<span role="alert">`
    - Verify timer end `alert()` fallback is reachable via keyboard flow
    - _Requirements: 7.1, 8.2, 8.4_

- [x] 11. Set up property-based test infrastructure
  - [x] 11.1 Create `tests/` directory and install fast-check as a dev-only dependency
    - Add `tests/properties.test.js`; configure Node `node:test` runner or a minimal harness
    - Document run command (e.g., `node --test tests/properties.test.js`) in a comment at the top of the file
    - _Requirements: 7.3 (no build step for app; tests are a separate optional suite)_
  - [x] 11.2 Export pure functions from `js/app.js` for test consumption (or duplicate them in a shared module)
    - Only `getSalutation`, `formatTime`, `formatCountdown`, and validation/normalisation helpers need to be exported
    - _Requirements: 7.3_

- [ ] 12. Final checkpoint — full integration verification
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP build
- Each task references specific requirements for full traceability
- Checkpoints at tasks 5, 8, and 12 ensure incremental validation
- Property tests (Properties 1–13) validate universal correctness properties using fast-check with ≥ 100 iterations each
- Unit tests validate specific examples and boundary values
- The entire app ships as three files (`index.html`, `css/style.css`, `js/app.js`); the `tests/` directory is a development artefact only

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1", "2.2", "2.3", "2.4"] },
    { "id": 1, "tasks": ["2.5", "3.1", "4.1", "6.1", "7.1"] },
    { "id": 2, "tasks": ["3.2", "3.3", "3.4", "4.2", "4.3", "11.1"] },
    { "id": 3, "tasks": ["4.4", "4.5", "4.6", "4.7", "6.2", "7.4", "11.2"] },
    { "id": 4, "tasks": ["4.2", "6.3", "7.2", "7.3"] },
    { "id": 5, "tasks": ["6.4", "6.5", "6.6", "7.5", "7.6"] },
    { "id": 6, "tasks": ["6.7", "6.8", "6.9", "7.7"] },
    { "id": 7, "tasks": ["6.10", "6.11", "6.12", "6.13", "7.8"] },
    { "id": 8, "tasks": ["9.1", "9.2", "9.3", "9.4"] },
    { "id": 9, "tasks": ["10.1", "10.2"] }
  ]
}
```
