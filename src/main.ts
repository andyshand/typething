import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

const STORAGE_KEY = "typething.hotkey";
const TEXT_STORAGE_KEY = "typething.text";
const DEFAULT_HOTKEY = "CommandOrControl+Shift+Space";
const COMPOSE_VIEW = "compose";
const SETTINGS_VIEW = "settings";

let composerEl: HTMLTextAreaElement | null = null;
let composerPanelEl: HTMLElement | null = null;
let settingsPanelEl: HTMLElement | null = null;
let copyButtonEl: HTMLButtonElement | null = null;
let shortcutInputEl: HTMLInputElement | null = null;

let currentView = COMPOSE_VIEW;
let registeredHotkey = DEFAULT_HOTKEY;
let pendingHotkey = DEFAULT_HOTKEY;

const appWindow = getCurrentWindow();

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
  const value = composerEl?.value ?? "";

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
  localStorage.setItem(TEXT_STORAGE_KEY, composerEl?.value ?? "");
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

window.addEventListener("DOMContentLoaded", async () => {
  composerEl = document.querySelector("#composer");
  composerPanelEl = document.querySelector("#composer-panel");
  settingsPanelEl = document.querySelector("#settings-panel");
  copyButtonEl = document.querySelector("#copy-button");
  shortcutInputEl = document.querySelector("#shortcut-input");

  const surfaceEl = document.querySelector<HTMLElement>(".surface");
  const settingsButtonEl = document.querySelector<HTMLButtonElement>("#settings-button");
  const closeSettingsButtonEl = document.querySelector<HTMLButtonElement>("#close-settings-button");

  const savedHotkey = localStorage.getItem(STORAGE_KEY)?.trim();
  const initialHotkey = savedHotkey || DEFAULT_HOTKEY;
  const savedText = localStorage.getItem(TEXT_STORAGE_KEY) ?? "";

  registeredHotkey = initialHotkey;
  pendingHotkey = initialHotkey;
  syncShortcutInput();

  if (composerEl) {
    composerEl.value = savedText;
  }

  resizeComposer();
  window.addEventListener("resize", resizeComposer);

  composerEl?.addEventListener("input", () => {
    const text = composerEl?.value ?? "";
    localStorage.setItem(TEXT_STORAGE_KEY, text);
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

    if (event.key !== "Enter" || event.shiftKey) {
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

  surfaceEl?.addEventListener("mousedown", async (event) => {
    if (event.button !== 0) {
      return;
    }

    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.closest("textarea, button, input, label")
    ) {
      return;
    }

    event.preventDefault();

    try {
      await appWindow.startDragging();
    } catch (error) {
      console.error("Failed to start dragging", error);
    }
  });

  setView(COMPOSE_VIEW);
});
