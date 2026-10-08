import { useEffect } from "react";
import { Button } from "react-aria-components";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import { GenericModal } from "../GenericModal";
import { useModalRef } from "../misc/useModalRef";
import type { Issue } from "./keymapFile";
import type { ImportPlan } from "./planImport";

export type KeymapIoState =
  | { step: "closed" }
  | { step: "working"; title: string; message: string }
  | { step: "error"; title: string; message: string }
  | { step: "review"; fileName: string; plan: ImportPlan }
  | { step: "applying"; done: number; total: number }
  | { step: "applied"; applied: number; failures: string[] }
  | { step: "exported"; location: string; warnings: string[] };

export interface KeymapIoModalProps {
  state: KeymapIoState;
  onApply: (plan: ImportPlan) => void;
  onClose: () => void;
}

const buttonClass = "rounded bg-base-200 hover:bg-base-300 px-3 py-2 disabled:opacity-50";
const primaryClass =
  "rounded bg-primary text-primary-content hover:opacity-90 px-3 py-2 disabled:opacity-50";

export const KeymapIoModal = ({ state, onApply, onClose }: KeymapIoModalProps) => {
  const busy = state.step === "working" || state.step === "applying";
  const ref = useModalRef(state.step !== "closed");

  // Escape must not close the dialog while we're talking to the keyboard.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !busy) return;
    const block = (e: Event) => e.preventDefault();
    dialog.addEventListener("cancel", block);
    return () => dialog.removeEventListener("cancel", block);
  }, [ref, busy]);

  return (
    <GenericModal ref={ref} onClose={onClose} className="w-[40rem] max-w-[90vw]">
      {state.step === "working" && (
        <>
          <h2 className="my-2 text-lg">{state.title}</h2>
          <p>{state.message}</p>
        </>
      )}

      {state.step === "error" && (
        <>
          <h2 className="my-2 text-lg">{state.title}</h2>
          <p className="flex gap-2 items-start">
            <AlertCircle className="w-5 shrink-0 text-red-500" />
            <span className="whitespace-pre-wrap">{state.message}</span>
          </p>
          <Footer>
            <Button className={buttonClass} onPress={onClose}>
              Close
            </Button>
          </Footer>
        </>
      )}

      {state.step === "review" && (
        <Review fileName={state.fileName} plan={state.plan} onApply={onApply} onClose={onClose} />
      )}

      {state.step === "applying" && (
        <>
          <h2 className="my-2 text-lg">Importing keymap</h2>
          <p className="mb-2">
            Writing to the keyboard: {state.done} of {state.total}
          </p>
          <progress className="w-full" value={state.done} max={state.total || 1} />
        </>
      )}

      {state.step === "applied" && (
        <>
          <h2 className="my-2 text-lg">Keymap imported</h2>
          <p>
            {state.applied} change{state.applied === 1 ? "" : "s"} written.{" "}
            They aren't saved yet: use <b>Save</b> to keep them, or <b>Undo</b> /{" "}
            <b>Discard</b> to back out.
          </p>
          {state.failures.length > 0 && (
            <IssueList
              issues={state.failures.map((message) => ({ severity: "error", message }))}
            />
          )}
          <Footer>
            <Button className={buttonClass} onPress={onClose}>
              Close
            </Button>
          </Footer>
        </>
      )}

      {state.step === "exported" && (
        <>
          <h2 className="my-2 text-lg">Keymap exported</h2>
          <p className="break-all">Saved to {state.location}</p>
          {state.warnings.length > 0 && (
            <>
              <p className="mt-3">
                A few things to check before building it (also noted at the top of the file):
              </p>
              <IssueList
                issues={state.warnings.map((message) => ({ severity: "warning", message }))}
              />
            </>
          )}
          <Footer>
            <Button className={buttonClass} onPress={onClose}>
              Close
            </Button>
          </Footer>
        </>
      )}
    </GenericModal>
  );
};

const Footer = ({ children }: { children: React.ReactNode }) => (
  <div className="flex justify-end mt-4 gap-3">{children}</div>
);

function Review({
  fileName,
  plan,
  onApply,
  onClose,
}: {
  fileName: string;
  plan: ImportPlan;
  onApply: (plan: ImportPlan) => void;
  onClose: () => void;
}) {
  const nothingToDo = !plan.changes.length && !plan.renames.length && !plan.layersToAdd;
  const changedLayers = new Set(plan.changes.map((c) => c.layerIndex)).size;

  return (
    <>
      <h2 className="my-2 text-lg">Import {fileName}</h2>
      <ul className="list-disc pl-5 mb-2">
        <li>
          <b>{plan.changes.length}</b> key binding{plan.changes.length === 1 ? "" : "s"} will
          change{changedLayers ? ` across ${changedLayers} layer${changedLayers === 1 ? "" : "s"}` : ""}
          {plan.unchanged ? `, ${plan.unchanged} already match` : ""}.
        </li>
        {plan.skipped > 0 && (
          <li>
            <b>{plan.skipped}</b> binding{plan.skipped === 1 ? "" : "s"} can't be imported (see
            below) and will be left as they are.
          </li>
        )}
        {plan.renames.length > 0 && (
          <li>
            Layer names:{" "}
            {plan.renames
              .map((r) => (r.from ? `"${r.from}" → "${r.to}"` : `new layer "${r.to}"`))
              .join(", ")}
          </li>
        )}
      </ul>
      {plan.issues.length > 0 && <IssueList issues={plan.issues} />}
      <p className="mt-3 text-sm opacity-80">
        Changes go to the keyboard as unsaved edits. You can undo them in one step, or discard
        them, until you save.
      </p>
      <Footer>
        <Button className={buttonClass} onPress={onClose}>
          Cancel
        </Button>
        <Button className={primaryClass} isDisabled={nothingToDo} onPress={() => onApply(plan)}>
          {nothingToDo ? "Nothing to change" : "Apply to keyboard"}
        </Button>
      </Footer>
    </>
  );
}

const SEVERITY_ORDER: Issue["severity"][] = ["error", "warning", "info"];

function IssueList({ issues }: { issues: Issue[] }) {
  const sorted = [...issues].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  );
  return (
    <ul className="max-h-64 overflow-y-auto border rounded p-2 flex flex-col gap-1 text-sm">
      {sorted.map((issue, i) => (
        <li key={i} className="flex gap-2 items-start">
          {issue.severity === "error" ? (
            <AlertCircle className="w-4 shrink-0 text-red-500" />
          ) : issue.severity === "warning" ? (
            <AlertTriangle className="w-4 shrink-0 text-amber-500" />
          ) : (
            <Info className="w-4 shrink-0 opacity-70" />
          )}
          <span>
            {issue.message}
            {issue.line !== undefined && <span className="opacity-60"> (line {issue.line})</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
