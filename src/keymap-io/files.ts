// Saving and opening keymap files: native dialogs in the desktop app, browser
// file pickers (or a plain download) on the web.

import { invoke } from "@tauri-apps/api/core";

const isTauri = () => !!window.__TAURI_INTERNALS__;

interface SaveFilePickerWindow {
  showSaveFilePicker?: (opts: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{ name: string; createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }> }>;
}

// Returns where the file went, or undefined if the user cancelled.
export async function saveKeymapText(defaultName: string, text: string): Promise<string | undefined> {
  if (isTauri()) {
    const path = await invoke<string | null>("save_keymap_file", { defaultName, contents: text });
    return path ?? undefined;
  }

  const w = window as unknown as SaveFilePickerWindow;
  if (w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: defaultName,
        types: [{ description: "ZMK keymap", accept: { "text/plain": [".keymap"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return handle.name;
    } catch (e) {
      if ((e as Error).name === "AbortError") return undefined;
      throw e;
    }
  }

  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = defaultName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return defaultName;
}

export interface OpenedKeymap {
  name: string;
  contents: string;
}

export async function openKeymapText(): Promise<OpenedKeymap | undefined> {
  if (isTauri()) {
    const file = await invoke<OpenedKeymap | null>("open_keymap_file");
    return file ?? undefined;
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".keymap,.dtsi,.overlay,text/plain";
    input.addEventListener("cancel", () => resolve(undefined));
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return resolve(undefined);
      file.text().then((contents) => resolve({ name: file.name, contents }), reject);
    });
    input.click();
  });
}
