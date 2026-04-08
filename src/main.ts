import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FiCopy, FiSettings } from "react-icons/fi";

const STORAGE_KEY = "typething.hotkey";
const TEXT_STORAGE_KEY = "typething.text";
const TABS_STORAGE_KEY = "typething.tabs";
const SELECTED_TAB_ID_STORAGE_KEY = "typething.selected-tab-id";
const DEFAULT_HOTKEY = "CommandOrControl+Shift+Space";
const COMPOSE_VIEW = "compose";
const SETTINGS_VIEW = "settings";
const SURFACE_INTERACTIVE_SELECTOR = "textarea, button, input, label";

type NoteTab = {
  id: string;
  text: string;
};

let composerEl: HTMLTextAreaElement | null = null;
let composerPanelEl: HTMLElement | null = null;
let settingsPanelEl: HTMLElement | null = null;
let copyButtonEl: HTMLButtonElement | null = null;
let shortcutInputEl: HTMLInputElement | null = null;
let tabDotsEl: HTMLElement | null = null;
let settingsIconRoot: Root | null = null;
let copyIconRoot: Root | null = null;

let currentView = COMPOSE_VIEW;
let registeredHotkey = DEFAULT_HOTKEY;
let pendingHotkey = DEFAULT_HOTKEY;
let tabs: NoteTab[] = [];
let selectedTabId = "";

const appWindow = getCurrentWindow();

function createTab(text = ""): NoteTab {
  return {
    id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
  };
}

function readStoredTabs() {
  try {
    const rawTabs = localStorage.getItem(TABS_STORAGE_KEY);
    if (!rawTabs) {
      return [];
    }

    const parsed = JSON.parse(rawTabs);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((tab): tab is NoteTab => {
      return (
        !!tab &&
        typeof tab === "object" &&
        typeof tab.id === "string" &&
        typeof tab.text === "string"
      );
    });
  } catch {
    return [];
  }
}

function selectedTabIndex() {
  const index = tabs.findIndex((tab) => tab.id === selectedTabId);
  return index === -1 ? 0 : index;
}

function currentTab() {
  return tabs[selectedTabIndex()] ?? null;
}

function persistTabs() {
  localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabs));
  localStorage.setItem(SELECTED_TAB_ID_STORAGE_KEY, selectedTabId);
  localStorage.setItem(TEXT_STORAGE_KEY, currentTab()?.text ?? "");
}

function renderTabDots() {
  if (!tabDotsEl) {
    return;
  }

  const dotsRoot = tabDotsEl;
  dotsRoot.replaceChildren();

  tabs.forEach((tab, index) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "tab-dot";
    dot.setAttribute("aria-label", `Switch to note ${index + 1}`);
    dot.title = `Note ${index + 1}`;
    if (tab.id === selectedTabId) {
      dot.classList.add("is-active");
      dot.setAttribute("aria-current", "true");
    }

    dot.addEventListener("click", () => {
      switchToTab(tab.id);
    });

    dotsRoot.append(dot);
  });
}

function renderCurrentTab() {
  if (!composerEl) {
    return;
  }

  composerEl.value = currentTab()?.text ?? "";
  copyButtonEl?.setAttribute("data-state", "idle");
  renderTabDots();
  resizeComposer();
}

function mountButtonIcons() {
  const settingsButtonEl = document.querySelector<HTMLButtonElement>("#settings-button");

  if (settingsButtonEl) {
    settingsButtonEl.replaceChildren();
    settingsIconRoot?.unmount();
    settingsIconRoot = createRoot(settingsButtonEl);
    settingsIconRoot.render(createElement(FiSettings, { "aria-hidden": true }));
  }

  if (copyButtonEl) {
    copyButtonEl.replaceChildren();
    copyIconRoot?.unmount();
    copyIconRoot = createRoot(copyButtonEl);
    copyIconRoot.render(createElement(FiCopy, { "aria-hidden": true }));
  }
}

function removeEmptyCurrentTab(nextTabId?: string) {
  const current = currentTab();
  if (!current || tabs.length <= 1) {
    return;
  }

  if (current.text.trim() !== "") {
    return;
  }

  if (current.id === nextTabId) {
    return;
  }

  tabs = tabs.filter((tab) => tab.id !== current.id);
}

function switchToTab(nextTabId: string) {
  if (currentView !== COMPOSE_VIEW) {
    return;
  }

  if (!tabs.some((tab) => tab.id === nextTabId)) {
    return;
  }

  removeEmptyCurrentTab(nextTabId);
  selectedTabId = nextTabId;
  persistTabs();
  renderCurrentTab();
  composerEl?.focus();
}

function switchTabByOffset(offset: -1 | 1) {
  if (currentView !== COMPOSE_VIEW) {
    return;
  }

  const currentIndex = selectedTabIndex();

  if (offset === 1 && currentIndex === tabs.length - 1) {
    const nextTab = createTab();
    tabs.push(nextTab);
    removeEmptyCurrentTab(nextTab.id);
    selectedTabId = nextTab.id;
    persistTabs();
    renderCurrentTab();
    composerEl?.focus();
    return;
  }

  const nextIndex = currentIndex + offset;
  if (nextIndex < 0 || nextIndex >= tabs.length) {
    return;
  }

  switchToTab(tabs[nextIndex].id);
}

function initializeTabs() {
  const savedTabs = readStoredTabs();
  const fallbackText = localStorage.getItem(TEXT_STORAGE_KEY) ?? "";

  tabs = savedTabs.length > 0 ? savedTabs : [createTab(fallbackText)];
  selectedTabId = localStorage.getItem(SELECTED_TAB_ID_STORAGE_KEY) ?? tabs[0].id;

  if (!tabs.some((tab) => tab.id === selectedTabId)) {
    selectedTabId = tabs[0].id;
  }

  persistTabs();
}

function resizeComposer() {
  if (!composerEl || currentView !== COMPOSE_VIEW) {
    return;
  }

  composerEl.style.height = "0px";
  const nextHeight = Math.min(Math.max(composerEl.scrollHeight, 120), window.innerHeight - 120);
  composerEl.style.height = `${nextHeight}px`;
}

function displayHotkey(shortcut: string) {
  return shortcut
    .split("+")
    .map((part) => {
      if (part === "CommandOrControl") {
        return "Cmd/Ctrl";
      }
      if (part === "Alt") {
        return "Option";
      }
      return part;
    })
    .join(" + ");
}

function isModifierKey(key: string) {
  return key === "Meta" || key === "Control" || key === "Alt" || key === "Shift";
}

function keyFromEvent(event: KeyboardEvent) {
  const codeMap: Record<string, string> = {
    Backquote: "`",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Space: "Space",
  };

  if (event.code in codeMap) {
    return codeMap[event.code];
  }

  if (event.code.startsWith("Key")) {
    return event.code.slice(3).toUpperCase();
  }

  if (event.code.startsWith("Digit")) {
    return event.code.slice(5);
  }

  if (/^F\d+$/.test(event.code)) {
    return event.code;
  }

  if (event.key.startsWith("Arrow")) {
    return event.key;
  }

  if (event.key.length === 1) {
    return /[a-z]/i.test(event.key) ? event.key.toUpperCase() : event.key;
  }

  return null;
}

function hotkeyFromEvent(event: KeyboardEvent) {
  if (isModifierKey(event.key)) {
    return null;
  }

  const key = keyFromEvent(event);
  if (!key) {
    return null;
  }

  const modifiers: string[] = [];
  if (event.metaKey || event.ctrlKey) {
    modifiers.push("CommandOrControl");
  }
  if (event.altKey) {
    modifiers.push("Alt");
  }
  if (event.shiftKey) {
    modifiers.push("Shift");
  }

  if (modifiers.length === 0) {
    return null;
  }

  return [...modifiers, key].join("+");
}

function syncShortcutInput() {
  if (shortcutInputEl) {
    shortcutInputEl.value = displayHotkey(pendingHotkey);
  }
}

function setView(nextView: typeof COMPOSE_VIEW | typeof SETTINGS_VIEW) {
  currentView = nextView;

  if (composerPanelEl) {
    const showComposer = nextView === COMPOSE_VIEW;
    composerPanelEl.hidden = !showComposer;
    composerPanelEl.classList.toggle("is-active", showComposer);
  }

  if (settingsPanelEl) {
    const showSettings = nextView === SETTINGS_VIEW;
    settingsPanelEl.hidden = !showSettings;
    settingsPanelEl.classList.toggle("is-active", showSettings);
  }

  if (nextView === COMPOSE_VIEW) {
    requestAnimationFrame(() => {
      resizeComposer();
      composerEl?.focus();
    });
    return;
  }

  syncShortcutInput();
  requestAnimationFrame(() => shortcutInputEl?.focus());
}

async function registerHotkey(nextHotkey: string) {
  await invoke("set_global_shortcut", {
    shortcut: nextHotkey,
  });
  localStorage.setItem(STORAGE_KEY, nextHotkey);
}

async function saveShortcut() {
  if (pendingHotkey === registeredHotkey) {
    return;
  }

  try {
    await registerHotkey(pendingHotkey);
    registeredHotkey = pendingHotkey;
    syncShortcutInput();
  } catch (error) {
    console.error("Failed to save shortcut", error);
    pendingHotkey = registeredHotkey;
    syncShortcutInput();
  }
}

async function copyComposerText() {
  const value = currentTab()?.text ?? "";

  if (!value.trim()) {
    copyButtonEl?.setAttribute("data-state", "idle");
    return;
  }

  await writeText(value, { label: "Typething" });
  localStorage.setItem(TEXT_STORAGE_KEY, value);
  copyButtonEl?.setAttribute("data-state", "copied");
  await hideMainWindow();
}

async function hideMainWindow() {
  persistTabs();
  await invoke("hide_main_window");
}

function openSettings() {
  pendingHotkey = registeredHotkey;
  setView(SETTINGS_VIEW);
}

function closeSettings() {
  pendingHotkey = registeredHotkey;
  setView(COMPOSE_VIEW);
}

function isSettingsShortcut(event: KeyboardEvent) {
  return (event.metaKey || event.ctrlKey) && event.key === ",";
}

function tabDirectionFromEvent(event: KeyboardEvent) {
  const wantsTabNavigation =
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey;

  if (!wantsTabNavigation) {
    return null;
  }

  if (event.key === "ArrowLeft") {
    return -1 as const;
  }

  if (event.key === "ArrowRight") {
    return 1 as const;
  }

  return null;
}

function isSurfaceInteractiveTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    !!target.closest(SURFACE_INTERACTIVE_SELECTOR)
  );
}

window.addEventListener("DOMContentLoaded", async () => {
  composerEl = document.querySelector("#composer");
  composerPanelEl = document.querySelector("#composer-panel");
  settingsPanelEl = document.querySelector("#settings-panel");
  copyButtonEl = document.querySelector("#copy-button");
  shortcutInputEl = document.querySelector("#shortcut-input");
  tabDotsEl = document.querySelector("#tab-dots");

  const surfaceEl = document.querySelector<HTMLElement>(".surface");
  const settingsButtonEl = document.querySelector<HTMLButtonElement>("#settings-button");
  const closeSettingsButtonEl = document.querySelector<HTMLButtonElement>("#close-settings-button");

  const savedHotkey = localStorage.getItem(STORAGE_KEY)?.trim();
  const initialHotkey = savedHotkey || DEFAULT_HOTKEY;

  registeredHotkey = initialHotkey;
  pendingHotkey = initialHotkey;
  syncShortcutInput();
  mountButtonIcons();
  initializeTabs();
  renderCurrentTab();

  resizeComposer();
  window.addEventListener("resize", resizeComposer);

  composerEl?.addEventListener("input", () => {
    const text = composerEl?.value ?? "";
    const tab = currentTab();
    if (tab) {
      tab.text = text;
      persistTabs();
    }
    copyButtonEl?.setAttribute("data-state", "idle");
    resizeComposer();
  });

  try {
    await registerHotkey(initialHotkey);
  } catch (error) {
    console.error("Failed to register initial hotkey", error);
  }

  window.addEventListener(
    "keydown",
    async (event) => {
      if (isSettingsShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        openSettings();
        return;
      }

      const tabDirection = tabDirectionFromEvent(event);
      if (currentView === COMPOSE_VIEW && tabDirection) {
        event.preventDefault();
        event.stopPropagation();
        switchTabByOffset(tabDirection);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();

        if (currentView === SETTINGS_VIEW) {
          closeSettings();
          return;
        }

        try {
          await hideMainWindow();
        } catch {}
      }
    },
    true,
  );

  composerEl?.addEventListener("keydown", async (event) => {
    if (currentView !== COMPOSE_VIEW) {
      return;
    }

    const tabDirection = tabDirectionFromEvent(event);
    if (tabDirection) {
      event.preventDefault();
      event.stopPropagation();
      switchTabByOffset(tabDirection);
      return;
    }

    if (event.key !== "Enter" || !event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    event.preventDefault();

    try {
      await copyComposerText();
    } catch {}
  });

  copyButtonEl?.addEventListener("click", async () => {
    try {
      await copyComposerText();
    } catch {}
  });

  settingsButtonEl?.addEventListener("click", () => {
    openSettings();
  });

  closeSettingsButtonEl?.addEventListener("click", () => {
    closeSettings();
  });

  shortcutInputEl?.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      closeSettings();
      return;
    }

    const nextHotkey = hotkeyFromEvent(event);
    if (!nextHotkey) {
      return;
    }

    pendingHotkey = nextHotkey;
    syncShortcutInput();
    void saveShortcut();
  });

  surfaceEl?.addEventListener("mousemove", (event) => {
    surfaceEl.classList.toggle(
      "is-draggable-hover",
      !isSurfaceInteractiveTarget(event.target),
    );
  });

  surfaceEl?.addEventListener("mouseleave", () => {
    surfaceEl.classList.remove("is-draggable-hover", "is-draggable-active");
  });

  surfaceEl?.addEventListener("mousedown", async (event) => {
    if (event.button !== 0) {
      return;
    }

    if (isSurfaceInteractiveTarget(event.target)) {
      return;
    }

    event.preventDefault();
    surfaceEl.classList.add("is-draggable-active");

    try {
      await appWindow.startDragging();
    } catch (error) {
      console.error("Failed to start dragging", error);
    }
  });

  window.addEventListener("mouseup", () => {
    surfaceEl?.classList.remove("is-draggable-active");
  });

  setView(COMPOSE_VIEW);
});
