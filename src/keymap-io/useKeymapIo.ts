import { useCallback, useState } from "react";
import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import type { DoCallback } from "../undoRedo";
import { applyImport, readDeviceState } from "./applyImport";
import { exportKeymap } from "./exportKeymap";
import { openKeymapText, saveKeymapText } from "./files";
import { KeymapSyntaxError, parseKeymapFile } from "./keymapFile";
import type { KeymapIoState } from "./KeymapIoModal";
import { ImportPlan, planImport } from "./planImport";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useKeymapIo(
  conn: RpcConnection | null,
  deviceName: string | undefined,
  doIt: (dc: DoCallback) => Promise<void>,
  // Re-read the keymap from the keyboard so the UI shows what we wrote.
  refresh: () => void
) {
  const [state, setState] = useState<KeymapIoState>({ step: "closed" });
  const close = useCallback(() => setState({ step: "closed" }), []);

  const doExport = useCallback(async () => {
    if (!conn) return;
    setState({ step: "working", title: "Export keymap", message: "Reading the keymap from the keyboard…" });
    try {
      const device = await readDeviceState(conn);
      const { text, warnings } = exportKeymap({ ...device, deviceName });
      const fileName = `${(deviceName || "zmk").replace(/[^\w.-]+/g, "_").toLowerCase()}.keymap`;
      setState({ step: "closed" });
      const location = await saveKeymapText(fileName, text);
      if (location && warnings.length) {
        setState({ step: "exported", location, warnings });
      }
    } catch (e) {
      setState({ step: "error", title: "Export failed", message: message(e) });
    }
  }, [conn, deviceName]);

  const doImport = useCallback(async () => {
    if (!conn) return;
    let file;
    try {
      file = await openKeymapText();
    } catch (e) {
      setState({ step: "error", title: "Import failed", message: message(e) });
      return;
    }
    if (!file) return;

    let parsed;
    try {
      parsed = parseKeymapFile(file.contents);
    } catch (e) {
      const title = `Couldn't read ${file.name}`;
      setState({
        step: "error",
        title,
        message: e instanceof KeymapSyntaxError ? `${e.message}` : message(e),
      });
      return;
    }

    setState({ step: "working", title: `Import ${file.name}`, message: "Comparing with the keyboard…" });
    try {
      const device = await readDeviceState(conn);
      setState({ step: "review", fileName: file.name, plan: planImport(parsed, device.keymap, device.behaviors) });
    } catch (e) {
      setState({ step: "error", title: "Import failed", message: message(e) });
    }
  }, [conn]);

  const apply = useCallback(
    (plan: ImportPlan) => {
      if (!conn) return;
      setState({ step: "applying", done: 0, total: 0 });

      doIt(async () => {
        try {
          const result = await applyImport(conn, plan, (done, total) =>
            setState({ step: "applying", done, total })
          );
          setState({ step: "applied", applied: result.applied, failures: result.failures });
          refresh();
          return async () => {
            await result.undo();
            refresh();
          };
        } catch (e) {
          setState({ step: "error", title: "Import failed", message: message(e) });
          refresh();
          return async () => {};
        }
      });
    },
    [conn, doIt, refresh]
  );

  return { state, close, exportKeymap: doExport, importKeymap: doImport, apply };
}
