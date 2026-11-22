/* =========================================================
   Kanban Lite – application logic (vanilla ES6+)

   Structure:
   1. Constants & state
   2. Storage helpers (localStorage)
   3. Task operations (add / move / delete)
   4. Rendering
   5. Drag and drop
   6. Theme toggle
   7. Event listeners & start-up
   ========================================================= */

"use strict";

/* ---------------------------------------------------------
   1. Constants & state
   --------------------------------------------------------- */
const TASKS_KEY = "kanbanLite.tasks";
const THEME_KEY = "kanbanLite.theme";

// Order of the columns – also defines what "next" and "back" mean.
const STATUSES = ["todo", "inprogress", "completed"];
const STATUS_LABELS = { todo: "To Do", inprogress: "In Progress", completed: "Completed" };
const PRIORITY_LABELS = { low: "Low", medium: "Medium", high: "High" };
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const DEFAULT_CATEGORIES = ["Development", "Design", "Marketing"];

let tasks = [];          // the single source of truth
let searchText = "";     // current value of the search box
let categoryFilter = "all";

/* DOM references */
const form = document.getElementById("taskForm");
const titleInput = document.getElementById("titleInput");
const titleError = document.getElementById("titleError");
const descInput = document.getElementById("descInput");
const categoryInput = document.getElementById("categoryInput");
const priorityInput = document.getElementById("priorityInput");
const categoryList = document.getElementById("categoryList");
const searchInput = document.getElementById("searchInput");
const categorySelect = document.getElementById("categoryFilter");
const activeCountEl = document.getElementById("activeCount");
const doneCountEl = document.getElementById("doneCount");
const themeToggle = document.getElementById("themeToggle");
const themeIcon = document.getElementById("themeIcon");
const themeLabel = document.getElementById("themeLabel");

/* ---------------------------------------------------------
   2. Storage helpers
   --------------------------------------------------------- */

/** Read tasks from localStorage. Returns null if nothing valid is stored. */
function loadTasks() {
  try {
    const raw = localStorage.getItem(TASKS_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    console.warn("Could not read saved tasks:", error);
    return null;
  }
}

/** Write the current tasks to localStorage. */
function saveTasks() {
  try {
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  } catch (error) {
    console.warn("Could not save tasks:", error);
  }
}

/* ---------------------------------------------------------
   3. Task operations
   --------------------------------------------------------- */

/** Create a reasonably unique id for a task. */
function createId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Add a new task to the "To Do" column. */
function addTask({ title, description, category, priority }) {
  tasks.push({
    id: createId(),
    title,
    description,
    category: category || "General",
    priority,
    status: "todo",
    createdAt: Date.now(),
  });
  saveTasks();
  render();
}

/** Move a task to a given column (used by buttons and drag & drop). */
function moveTask(id, newStatus) {
  const task = tasks.find((item) => item.id === id);
  if (!task || !STATUSES.includes(newStatus) || task.status === newStatus) return;
  task.status = newStatus;
  saveTasks();
  render();
}

/** Move a task one column forwards (+1) or backwards (-1). */
function shiftTask(id, direction) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;
  const newIndex = STATUSES.indexOf(task.status) + direction;
  if (newIndex >= 0 && newIndex < STATUSES.length) moveTask(id, STATUSES[newIndex]);
}

/** Delete a task after the user confirms. */
function deleteTask(id) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;
  if (!window.confirm(`Delete "${task.title}"?`)) return;
  tasks = tasks.filter((item) => item.id !== id);
  saveTasks();
  render();
}

/* ---------------------------------------------------------
   4. Rendering
   --------------------------------------------------------- */

/** Does a task pass the current search + category filters? */
function matchesFilters(task) {
  const matchesSearch = task.title.toLowerCase().includes(searchText);
  const matchesCategory = categoryFilter === "all" || task.category === categoryFilter;
  return matchesSearch && matchesCategory;
}

/** Collect every category in use plus the defaults, alphabetically. */
function getAllCategories() {
  const set = new Set(DEFAULT_CATEGORIES);
  tasks.forEach((task) => set.add(task.category));
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Keep the filter dropdown and the form suggestions up to date. */
function renderCategoryOptions() {
  const categories = getAllCategories();

  // Filter dropdown (keep the current selection if it still exists)
  categorySelect.innerHTML = "";
  categorySelect.append(new Option("All categories", "all"));
  categories.forEach((name) => categorySelect.append(new Option(name, name)));
  if (categoryFilter !== "all" && !categories.includes(categoryFilter)) categoryFilter = "all";
  categorySelect.value = categoryFilter;

  // Suggestions for the "Category" text input
  categoryList.innerHTML = "";
  categories.forEach((name) => categoryList.append(new Option(name)));
}

/** Small helper that builds an element with optional class and text. */
function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text; // textContent = safe from HTML injection
  return element;
}

/** Build the DOM for one task card. */
function buildTaskCard(task) {
  const card = makeElement("article", `task priority-${task.priority}`);
  card.draggable = true;
  card.dataset.id = task.id;
  if (task.status === "completed") card.classList.add("is-done");

  const top = makeElement("div", "task-top");
  top.append(makeElement("h3", "task-title", task.title));
  card.append(top);

  if (task.description) card.append(makeElement("p", "task-desc", task.description));

  const meta = makeElement("div", "task-meta");
  meta.append(makeElement("span", `chip p-${task.priority}`, `${PRIORITY_LABELS[task.priority]} priority`));
  meta.append(makeElement("span", "chip", task.category));
  card.append(meta);

  // Action buttons: back, forward, delete
  const actions = makeElement("div", "task-actions");
  const index = STATUSES.indexOf(task.status);

  if (index > 0) {
    const back = makeElement("button", "icon-btn", "← " + STATUS_LABELS[STATUSES[index - 1]]);
    back.type = "button";
    back.dataset.action = "back";
    actions.append(back);
  }
  if (index < STATUSES.length - 1) {
    const next = makeElement("button", "icon-btn", STATUS_LABELS[STATUSES[index + 1]] + " →");
    next.type = "button";
    next.dataset.action = "next";
    actions.append(next);
  }
  const remove = makeElement("button", "icon-btn danger", "Delete");
  remove.type = "button";
  remove.dataset.action = "delete";
  remove.setAttribute("aria-label", `Delete task ${task.title}`);
  actions.append(remove);

  card.append(actions);
  return card;
}

/** Redraw the whole board from the `tasks` array. */
function render() {
  renderCategoryOptions();

  STATUSES.forEach((status) => {
    const list = document.getElementById(`list-${status}`);
    list.innerHTML = "";

    const visible = tasks
      .filter((task) => task.status === status && matchesFilters(task))
      // High priority first, then newest first
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.createdAt - a.createdAt);

    visible.forEach((task) => list.append(buildTaskCard(task)));

    if (visible.length === 0) {
      const filtering = searchText !== "" || categoryFilter !== "all";
      list.append(makeElement("p", "empty", filtering ? "No matching tasks" : "Nothing here yet"));
    }
    document.getElementById(`count-${status}`).textContent = visible.length;
  });

  // Counter in the header (always based on ALL tasks, not the filtered ones)
  const completed = tasks.filter((task) => task.status === "completed").length;
  activeCountEl.textContent = tasks.length - completed;
  doneCountEl.textContent = completed;
}

/* ---------------------------------------------------------
   5. Drag and drop (native HTML5 API)
   --------------------------------------------------------- */
const board = document.getElementById("board");
let draggedId = null;

board.addEventListener("dragstart", (event) => {
  const card = event.target.closest(".task");
  if (!card) return;
  draggedId = card.dataset.id;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedId); // required by Firefox
  card.classList.add("dragging");
});

board.addEventListener("dragend", (event) => {
  const card = event.target.closest(".task");
  if (card) card.classList.remove("dragging");
  document.querySelectorAll(".column.drag-over").forEach((col) => col.classList.remove("drag-over"));
  draggedId = null;
});

board.addEventListener("dragover", (event) => {
  const column = event.target.closest(".column");
  if (!column || !draggedId) return;
  event.preventDefault(); // allows dropping
  column.classList.add("drag-over");
});

board.addEventListener("dragleave", (event) => {
  const column = event.target.closest(".column");
  // Only remove the highlight when the pointer really leaves the column
  if (column && !column.contains(event.relatedTarget)) column.classList.remove("drag-over");
});

board.addEventListener("drop", (event) => {
  const column = event.target.closest(".column");
  if (!column || !draggedId) return;
  event.preventDefault();
  column.classList.remove("drag-over");
  moveTask(draggedId, column.dataset.status);
});

/* ---------------------------------------------------------
   6. Theme toggle (light / dark)
   --------------------------------------------------------- */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const isDark = theme === "dark";
  themeIcon.textContent = isDark ? "☀️" : "🌙";
  themeLabel.textContent = isDark ? "Light" : "Dark";
}

function loadTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (error) { /* ignore */ }
  // First visit: follow the operating-system preference
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved || (prefersDark ? "dark" : "light"));
}

themeToggle.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch (error) { /* ignore */ }
});

/* ---------------------------------------------------------
   7. Event listeners & start-up
   --------------------------------------------------------- */

// Add-task form
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();

  // Validation: the title is the only mandatory field
  if (!title) {
    titleInput.classList.add("invalid");
    titleError.hidden = false;
    titleInput.focus();
    return;
  }
  titleInput.classList.remove("invalid");
  titleError.hidden = true;

  addTask({
    title,
    description: descInput.value.trim(),
    category: categoryInput.value.trim(),
    priority: priorityInput.value,
  });

  form.reset();
  priorityInput.value = "medium";
  titleInput.focus();
});

titleInput.addEventListener("input", () => {
  titleInput.classList.remove("invalid");
  titleError.hidden = true;
});

// Search + category filter
searchInput.addEventListener("input", () => {
  searchText = searchInput.value.trim().toLowerCase();
  render();
});
categorySelect.addEventListener("change", () => {
  categoryFilter = categorySelect.value;
  render();
});

// One click listener for all card buttons (event delegation)
board.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = button.closest(".task").dataset.id;
  const action = button.dataset.action;

  if (action === "next") shiftTask(id, +1);
  if (action === "back") shiftTask(id, -1);
  if (action === "delete") deleteTask(id);
});

/** Start the app. */
function init() {
  loadTheme();

  const saved = loadTasks();
  if (saved) {
    tasks = saved;
  } else {
    // First visit: a few example tasks so the board is not empty
    const now = Date.now();
    tasks = [
      { id: createId(), title: "Plan the week", description: "List the three most important goals.", category: "Marketing", priority: "medium", status: "todo", createdAt: now - 2000 },
      { id: createId(), title: "Design the landing page", description: "Sketch a mobile-first layout.", category: "Design", priority: "high", status: "inprogress", createdAt: now - 1000 },
      { id: createId(), title: "Set up the repository", description: "Create the repo and push the first commit.", category: "Development", priority: "low", status: "completed", createdAt: now },
    ];
    saveTasks();
  }
  render();
}

init();
