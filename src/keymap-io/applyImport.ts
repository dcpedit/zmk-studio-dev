// Carries out an ImportPlan on the connected keyboard. Changes land as unsaved
// edits, like any other edit in Studio, and come with an undo.

import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import {
  BehaviorBinding,
  Keymap,
  SetLayerBindingResponse,
  SetLayerPropsResponse,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { call_rpc } from "../rpc/logging";
import type { DeviceBehaviors } from "./deviceBehaviors";
import { ImportPlan, resolvePlannedBinding } from "./planImport";

export interface ApplyResult {
  applied: number;
  failures: string[];
  undo: () => Promise<void>;
}

async function getKeymap(conn: RpcConnection): Promise<Keymap> {
  const resp = await call_rpc(conn, { keymap: { getKeymap: true } });
  const keymap = resp?.keymap?.getKeymap;
  if (!keymap) throw new Error("Couldn't read the keymap from the keyboard");
  return keymap;
}

async function setBinding(
  conn: RpcConnection,
  layerId: number,
  keyPosition: number,
  binding: BehaviorBinding
): Promise<boolean> {
  const resp = await call_rpc(conn, {
    keymap: { setLayerBinding: { layerId, keyPosition, binding } },
  });
  return resp?.keymap?.setLayerBinding === SetLayerBindingResponse.SET_LAYER_BINDING_RESP_OK;
}

async function setName(conn: RpcConnection, layerId: number, name: string): Promise<boolean> {
  const resp = await call_rpc(conn, { keymap: { setLayerProps: { layerId, name } } });
  return resp?.keymap?.setLayerProps === SetLayerPropsResponse.SET_LAYER_PROPS_RESP_OK;
}

export async function applyImport(
  conn: RpcConnection,
  plan: ImportPlan,
  onProgress?: (done: number, total: number) => void
): Promise<ApplyResult> {
  const total = plan.layersToAdd + plan.renames.length + plan.changes.length;
  let done = 0;
  const tick = () => onProgress?.(++done, total);

  const failures: string[] = [];
  const addedLayerIds: number[] = [];
  const oldNames: { layerId: number; name: string }[] = [];
  const oldBindings: { layerId: number; keyPosition: number; binding: BehaviorBinding }[] = [];
  let applied = 0;

  for (let i = 0; i < plan.layersToAdd; i++) {
    const resp = await call_rpc(conn, { keymap: { addLayer: {} } });
    const layer = resp?.keymap?.addLayer?.ok?.layer;
    tick();
    if (!layer) {
      failures.push(`Couldn't add a layer (error ${resp?.keymap?.addLayer?.err ?? "unknown"}).`);
      break;
    }
    addedLayerIds.push(layer.id);
    applied++;
  }

  // Re-read so new layers have their ids and we know what we're replacing.
  const keymap = await getKeymap(conn);

  for (const rename of plan.renames) {
    const layer = keymap.layers[rename.layerIndex];
    tick();
    if (!layer) continue;
    if (await setName(conn, layer.id, rename.to)) {
      if (!addedLayerIds.includes(layer.id)) oldNames.push({ layerId: layer.id, name: layer.name });
      applied++;
    } else {
      failures.push(`Couldn't rename layer ${rename.layerIndex} to "${rename.to}".`);
    }
  }

  for (const change of plan.changes) {
    tick();
    const layer = keymap.layers[change.layerIndex];
    let binding: BehaviorBinding;
    try {
      if (!layer) throw new Error(`layer ${change.layerIndex} doesn't exist`);
      binding = resolvePlannedBinding(change.binding, keymap.layers);
    } catch (e) {
      failures.push(`Layer ${change.layerIndex}, key ${change.keyPosition}: ${(e as Error).message}`);
      continue;
    }
    const previous = layer.bindings[change.keyPosition];
    if (await setBinding(conn, layer.id, change.keyPosition, binding)) {
      if (previous && !addedLayerIds.includes(layer.id)) {
        oldBindings.push({ layerId: layer.id, keyPosition: change.keyPosition, binding: previous });
      }
      applied++;
    } else {
      failures.push(
        `Layer ${change.layerIndex}, key ${change.keyPosition}: the keyboard rejected '${change.text}'.`
      );
    }
  }

  const undo = async () => {
    for (const b of oldBindings) await setBinding(conn, b.layerId, b.keyPosition, b.binding);
    for (const n of oldNames) await setName(conn, n.layerId, n.name);
    if (addedLayerIds.length) {
      // Remove from the end so indexes stay valid.
      const current = await getKeymap(conn);
      const indexes = addedLayerIds
        .map((id) => current.layers.findIndex((l) => l.id === id))
        .filter((i) => i >= 0)
        .sort((a, b) => b - a);
      for (const layerIndex of indexes) {
        await call_rpc(conn, { keymap: { removeLayer: { layerIndex } } });
      }
    }
  };

  return { applied, failures, undo };
}

export async function readDeviceState(conn: RpcConnection) {
  const keymap = await getKeymap(conn);

  const list = await call_rpc(conn, { behaviors: { listAllBehaviors: true } });
  const behaviors: DeviceBehaviors = {};
  for (const behaviorId of list?.behaviors?.listAllBehaviors?.behaviors || []) {
    const details = await call_rpc(conn, { behaviors: { getBehaviorDetails: { behaviorId } } });
    const d = details?.behaviors?.getBehaviorDetails;
    if (d) behaviors[d.id] = d;
  }

  const layoutsResp = await call_rpc(conn, { keymap: { getPhysicalLayouts: true } });
  const layouts = layoutsResp?.keymap?.getPhysicalLayouts;
  const layout = layouts?.layouts[layouts.activeLayoutIndex];

  return { keymap, behaviors, layout };
}
