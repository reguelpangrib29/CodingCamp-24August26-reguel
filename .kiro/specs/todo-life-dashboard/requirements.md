# Requirements Document

## Introduction

The **Todo Life Dashboard** is a single-page, browser-based personal productivity homepage built with plain HTML, CSS, and JavaScript. It displays a live date and time greeting, provides a Pomodoro-style focus timer, lets users manage a persistent to-do list, and stores customizable quick-link shortcuts — all without any server-side component, framework, or build step. All user data is persisted exclusively via the browser's Local Storage API.

---

## Glossary

- **Dashboard**: The single HTML page that renders all widgets.
- **Greeting_Widget**: The UI section that displays the current time, date, and a time-sensitive salutation.
- **Timer_Widget**: The UI section that hosts the Pomodoro countdown timer and its controls.
- **Task_List_Widget**: The UI section that manages the user's to-do items.
- **Task**: A single to-do item with a text description and a completion state.
- **Quick_Links_Widget**: The UI section that renders user-defined shortcut buttons.
- **Quick_Link**: A single shortcut entry consisting of a label and a URL.
- **Local_Storage**: The browser's `localStorage` Web Storage API used for client-side persistence.
- **Pomodoro_Session**: A focused work interval of 25 minutes tracked by the Timer_Widget.
- **Modern_Browser**: Chrome 109+, Firefox 109+, Edge 109+, and Safari 16+.

---

## Requirements

### Requirement 1: Live Greeting Display

**User Story:** As a user, I want to see the current time, date, and a contextual greeting when I open the Dashboard, so that I have immediate situational awareness without checking another app.

#### Acceptance Criteria

1. THE Greeting_Widget SHALL display the current local time in 24-hour HH:MM format, updated every 60 seconds (±1 second tolerance).
2. THE Greeting_Widget SHALL display the current local date in the format "Weekday, Month DD, YYYY" (e.g., "Monday, August 28, 2026").
3. WHEN the local hour is between 05:00 and 11:59 inclusive, THE Greeting_Widget SHALL display the salutation "Good Morning".
4. WHEN the local hour is between 12:00 and 17:59 inclusive, THE Greeting_Widget SHALL display the salutation "Good Afternoon".
5. WHEN the local hour is between 18:00 and 23:59 inclusive, THE Greeting_Widget SHALL display the salutation "Good Evening".
6. WHEN the local hour is between 00:00 and 04:59 inclusive, THE Greeting_Widget SHALL display the salutation "Good Night".
7. WHEN the Dashboard page is loaded, THE Greeting_Widget SHALL render the correct time, date, and salutation within 1 second without requiring any user interaction.
8. IF the local time cannot be retrieved, THEN THE Greeting_Widget SHALL display a placeholder message (e.g., "Time unavailable") in place of the time and salutation without crashing or leaving the widget blank.

---

### Requirement 2: Pomodoro Focus Timer

**User Story:** As a user, I want a 25-minute countdown timer with start, stop, and reset controls, so that I can use the Pomodoro technique to manage focused work sessions.

#### Acceptance Criteria

1. WHEN the Dashboard is loaded, THE Timer_Widget SHALL initialise the countdown display to 25:00 (MM:SS format).
2. WHEN the user activates the Start control, THE Timer_Widget SHALL begin counting down from the current displayed time at one-second intervals.
3. WHILE the timer is counting down, THE Timer_Widget SHALL update the display in MM:SS format once per second.
4. WHEN the user activates the Stop control, THE Timer_Widget SHALL pause the countdown and retain the remaining time on the display.
5. WHEN the user activates the Reset control, THE Timer_Widget SHALL stop the countdown and reset the display to 25:00.
6. WHEN the countdown reaches 00:00, THE Timer_Widget SHALL stop the countdown automatically and disable the Stop control.
7. WHEN the countdown reaches 00:00, THE Timer_Widget SHALL notify the user that the Pomodoro session has ended via a browser alert or an audible signal lasting no more than 3 seconds, as supported by the browser.
8. WHILE the timer is counting down, THE Timer_Widget SHALL disable the Start control.
9. WHILE the timer is paused or reset, THE Timer_Widget SHALL disable the Stop control.
10. IF the user activates the Start control when the countdown display shows 00:00, THEN THE Timer_Widget SHALL take no action and keep the Start control disabled.
11. WHEN the user activates the Reset control while the timer is actively counting down, THE Timer_Widget SHALL stop the countdown, reset the display to 25:00, enable the Start control, and disable the Stop control.

---

### Requirement 3: To-Do Task Management

**User Story:** As a user, I want to add, edit, mark complete, and delete tasks, so that I can track my daily work items within the Dashboard.

#### Acceptance Criteria

1. WHEN the user submits a non-empty task description via the task input field, THE Task_List_Widget SHALL append the new Task to the task list and clear the input field.
2. IF the user submits an empty or whitespace-only task description, THEN THE Task_List_Widget SHALL reject the submission, retain the current input field content, and display an inline validation message indicating the description cannot be empty.
3. IF the task description exceeds 500 characters, THEN THE Task_List_Widget SHALL reject the submission and display an inline validation message indicating the maximum character limit.
4. WHEN the user activates the edit control for a Task, THE Task_List_Widget SHALL present the Task's description in an editable field pre-populated with the current text and dismiss any other concurrently open edit fields by discarding their unsaved changes.
5. WHEN the user confirms an edit with a non-empty description of 1 to 500 characters, THE Task_List_Widget SHALL update the Task's displayed text to the new description.
6. IF the user confirms an edit with an empty or whitespace-only description, THEN THE Task_List_Widget SHALL discard the edit and retain the original Task text.
7. WHEN the user activates the completion toggle for a Task in an incomplete state, THE Task_List_Widget SHALL change the Task's visual state to indicate it is complete using strikethrough text and a checked indicator.
8. WHEN the user activates the completion toggle for a Task in a complete state, THE Task_List_Widget SHALL revert the Task's visual state to incomplete by removing the strikethrough text and checked indicator.
9. WHEN the user activates the delete control for a Task, THE Task_List_Widget SHALL remove the Task from the task list within 200 milliseconds.
10. THE Task_List_Widget SHALL display all Tasks in insertion order, with the most recently added Task appearing last, and SHALL maintain this order after edits, completion toggles, and deletions.
11. THE Task_List_Widget SHALL support a task list containing up to 500 Tasks.

---

### Requirement 4: Task Persistence

**User Story:** As a user, I want my tasks to be saved automatically, so that my list survives page refreshes and browser restarts without any manual export step.

#### Acceptance Criteria

1. WHEN any Task is added, edited, marked complete or incomplete, or deleted, THE Task_List_Widget SHALL write the updated task collection to Local_Storage under a consistent key within 500 milliseconds.
2. WHEN the Dashboard is loaded, THE Task_List_Widget SHALL read the task collection from Local_Storage and render all previously saved Tasks before accepting new input.
3. IF Local_Storage contains no task data on load, THEN THE Task_List_Widget SHALL render an empty list with no error or warning indicator.
4. IF Local_Storage is unavailable or throws an error on write, THEN THE Task_List_Widget SHALL display a non-blocking warning message to the user and continue operating in-memory for the remainder of the session.
5. IF Local_Storage contains data under the task key that cannot be parsed as a valid task collection, THEN THE Task_List_Widget SHALL discard the corrupted data, render an empty list, and display a non-blocking warning message indicating that saved tasks could not be loaded.

---

### Requirement 5: Quick Links Management

**User Story:** As a user, I want to add, view, and delete shortcut buttons for my favourite websites, so that I can navigate to them with a single click from the Dashboard.

#### Acceptance Criteria

1. WHEN the user submits a Quick_Link entry with a non-empty label of at most 100 characters and a valid URL of at most 2048 characters, THE Quick_Links_Widget SHALL render a new shortcut button labelled with the provided text.
2. IF the user submits a Quick_Link entry with an empty label, a label exceeding 100 characters, an empty URL, or a URL exceeding 2048 characters, THEN THE Quick_Links_Widget SHALL reject the submission and display an inline validation message identifying which field failed validation.
3. IF the user submits a Quick_Link URL that does not begin with "http://" or "https://", THEN THE Quick_Links_Widget SHALL prepend "https://" to the URL before saving.
4. WHEN the user activates a Quick_Link button, THE Quick_Links_Widget SHALL open the associated URL in a new browser tab.
5. WHEN the user activates the delete control for a Quick_Link, THE Quick_Links_Widget SHALL remove that shortcut button from the display immediately without requiring additional confirmation.
6. THE Quick_Links_Widget SHALL render all saved Quick_Links in the order they were added.
7. THE Quick_Links_Widget SHALL persist saved Quick_Links across page reloads, restoring all Quick_Links in their original insertion order.
8. IF the number of saved Quick_Links reaches 50, THEN THE Quick_Links_Widget SHALL disable the add entry control and display a message indicating the maximum number of Quick_Links has been reached.

---

### Requirement 6: Quick Links Persistence

**User Story:** As a user, I want my quick links to be saved automatically, so that my shortcuts are available every time I open the Dashboard.

#### Acceptance Criteria

1. WHEN a Quick_Link is added or deleted, THE Quick_Links_Widget SHALL write the updated Quick_Link collection to Local_Storage under the same fixed key used to read the collection on load.
2. WHEN the Dashboard is loaded, THE Quick_Links_Widget SHALL read the Quick_Link collection from Local_Storage, render all previously saved Quick_Links in their stored order, and enable the add-link input only after rendering is complete.
3. IF Local_Storage contains no Quick_Link data on load, THEN THE Quick_Links_Widget SHALL render an empty shortcut area with no error indicator.
4. IF Local_Storage is unavailable or throws an error on write, THEN THE Quick_Links_Widget SHALL display a warning message indicating that changes will not be persisted, while continuing to render and accept input using the in-memory collection.
5. IF Local_Storage is unavailable or throws an error on read during Dashboard load, THEN THE Quick_Links_Widget SHALL render an empty shortcut area, display a warning message indicating that saved links could not be retrieved, and remain fully functional for adding new Quick_Links.

---

### Requirement 7: Cross-Browser Compatibility

**User Story:** As a user, I want the Dashboard to work correctly in any Modern_Browser I choose, so that I am not locked to a specific browser.

#### Acceptance Criteria

1. THE Dashboard SHALL render and operate correctly on the last 2 major stable releases of Chrome, Firefox, Edge, and Safari on desktop operating systems, without requiring any browser extension or plugin.
2. THE Dashboard SHALL use only Web APIs available in all supported browsers listed in criterion 1, excluding any API flagged as experimental or non-standard in the MDN Web Docs Browser Compatibility table.
3. THE Dashboard SHALL be implemented in a single HTML file, a single CSS file located in `css/`, and a single JavaScript file located in `js/`, with no build step or package manager required.
4. IF any Dashboard feature is unavailable or produces a JavaScript error in a supported browser, THEN the Dashboard SHALL display an error message indicating which feature is unsupported and remain otherwise functional.

---

### Requirement 8: Performance and Usability

**User Story:** As a user, I want the Dashboard to load instantly and respond to my interactions without perceptible delay, so that it does not interrupt my workflow.

#### Acceptance Criteria

1. THE Dashboard SHALL complete initial render in under 1 second on a connection with a minimum download speed of 10 Mbps and maximum latency of 50 ms, with all core widget data sourced locally or from bundled assets without external network requests.
2. WHEN the user interacts with any control (button, input, or toggle), THE Dashboard SHALL update the visual state of that control within 100 milliseconds of the interaction event.
3. THE Dashboard SHALL display all content within the viewport at widths from 320 px to 2560 px without requiring horizontal scrolling, with no content clipped or overflowing beyond the viewport edge.
4. THE Dashboard SHALL render body text at a minimum size of 14 px and maintain a contrast ratio of at least 4.5:1 between text and its background colour for normal text and 3:1 for large text (18 px or 14 px bold), in accordance with WCAG 2.1 AA guidelines.
5. IF the Dashboard fails to complete initial render within 3 seconds, THEN THE Dashboard SHALL display a loading indicator and an error message indicating that the Dashboard could not be loaded, without leaving the user on a blank or unresponsive screen.
