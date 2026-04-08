import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

const STORAGE_KEY = "typething.hotkey";
const TEXT_STORAGE_KEY = "typething.text";
const DEFAULT_HOTKEY = "CommandOrControl+Shift+Space";

let composerEl: HTMLTextAreaElement | null = null;
const appWindow = getCurrentWindow();

function resizeComposer() {
  if (!composerEl) {
    return;
  }

  composerEl.style.height = "0px";
  const nextHeight = Math.min(Math.max(composerEl.scrollHeight, 96), window.innerHeight - 60);
  composerEl.style.height = `${nextHeight}px`;
}

async function registerHotkey(nextHotkey: string) {
  await invoke("set_global_shortcut", {
    shortcut: nextHotkey,
  });
  localStorage.setItem(STORAGE_KEY, nextHotkey);
}

async function copyComposerText() {
  const value = composerEl?.value ?? "";
  const button = document.querySelector<HTMLButtonElement>("#copy-button");

  if (!value.trim()) {
    button?.setAttribute("data-state", "idle");
    return;
  }

  await writeText(value, { label: "Typething" });
  localStorage.setItem(TEXT_STORAGE_KEY, value);
  button?.setAttribute("data-state", "copied");
  await hideMainWindow();
}

async function hideMainWindow() {
  localStorage.setItem(TEXT_STORAGE_KEY, composerEl?.value ?? "");
  await invoke("hide_main_window");
}

window.addEventListener("DOMContentLoaded", async () => {
  composerEl = document.querySelector("#composer");
  const surfaceEl = document.querySelector<HTMLElement>(".surface");

  const savedHotkey = localStorage.getItem(STORAGE_KEY)?.trim();
  const initialHotkey = savedHotkey || DEFAULT_HOTKEY;
  const savedText = localStorage.getItem(TEXT_STORAGE_KEY) ?? "";

  if (composerEl) {
    composerEl.value = savedText;
  }

  resizeComposer();
  window.addEventListener("resize", resizeComposer);
  composerEl?.addEventListener("input", () => {
    const text = composerEl?.value ?? "";
    localStorage.setItem(TEXT_STORAGE_KEY, text);
    resizeComposer();
  });

  try {
    await registerHotkey(initialHotkey);
  } catch {}

  window.addEventListener("keydown", async (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      try {
        await hideMainWindow();
      } catch {}
      return;
    }
  }, true);

  composerEl?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();

    try {
      await copyComposerText();
    } catch {}
  });

  document.querySelector("#copy-button")?.addEventListener("click", async () => {
    try {
      await copyComposerText();
    } catch {}
  });

  surfaceEl?.addEventListener("mousedown", async (event) => {
    if (event.button !== 0) {
      return;
    }

    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.closest(".composer, .copy-button")
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
});
