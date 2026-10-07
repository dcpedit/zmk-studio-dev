import {
  PhysicalLayout,
  Keymap as KeymapMsg,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";

import {
  LayoutZoom,
  PhysicalLayout as PhysicalLayoutComp,
} from "./PhysicalLayout";
import { getBindingChildren, showsNameInBody } from "./KeymapBindingChildren";
import { KeyKind } from "./Key";
import { hid_usage_page_and_id_from_usage } from "../hid-usages";

type BehaviorMap = Record<number, GetBehaviorDetailsResponse>;

const KEYBOARD_PAGE = 0x07;
const ENTER = 0x28;
const ESCAPE = 0x29;

/**
 * Picks the keycap colorway for a binding: plain letters, numbers and
 * punctuation are alphas, Escape and Enter are accents, everything else
 * (modifiers, nav, layer and hold-tap behaviors...) is a mod.
 */
const keyKind = (
  behavior: GetBehaviorDetailsResponse | undefined,
  param1: number,
): KeyKind => {
  if (behavior?.displayName !== "Key Press") {
    return "mod";
  }

  const [page, id] = hid_usage_page_and_id_from_usage(param1);

  if ((page & 0xff) !== KEYBOARD_PAGE) {
    return "mod";
  }
  if (id === ENTER || id === ESCAPE) {
    return "accent";
  }
  // A-Z, 1-0, then Space through Slash (minus the non-US hash at 0x32)
  if ((id >= 0x04 && id <= 0x27) || (id >= 0x2c && id <= 0x38 && id !== 0x32)) {
    return "alpha";
  }
  return "mod";
};

export interface KeymapProps {
  layout: PhysicalLayout;
  keymap: KeymapMsg;
  behaviors: BehaviorMap;
  scale: LayoutZoom;
  selectedLayerIndex: number;
  selectedKeyPosition: number | undefined;
  onKeyPositionClicked: (keyPosition: number) => void;
}

export const Keymap = ({
  layout,
  keymap,
  behaviors,
  scale,
  selectedLayerIndex,
  selectedKeyPosition,
  onKeyPositionClicked,
}: KeymapProps) => {
  if (!keymap.layers[selectedLayerIndex]) {
    return <></>;
  }

  const positions = layout.keys.map((k, i) => {
    if (i >= keymap.layers[selectedLayerIndex].bindings.length) {
      return {
        id: `${keymap.layers[selectedLayerIndex].id}-${i}`,
        header: "Unknown",
        x: k.x / 100.0,
        y: k.y / 100.0,
        width: k.width / 100,
        height: k.height / 100.0,
        children: <span></span>,
      };
    }

    const binding = keymap.layers[selectedLayerIndex].bindings[i];
    const behavior = behaviors[binding.behaviorId];

    // Get layers for metadata-driven rendering
    const layers = keymap.layers.map(layer => ({ id: layer.id, name: layer.name }));

    const children = getBindingChildren(behavior, binding, layers);

    return {
      id: `${keymap.layers[selectedLayerIndex].id}-${i}`,
      header: showsNameInBody(behavior) ? "" : behavior?.displayName || "Unknown",
      kind: keyKind(behavior, binding.param1),
      x: k.x / 100.0,
      y: k.y / 100.0,
      width: k.width / 100,
      height: k.height / 100.0,
      r: (k.r || 0) / 100.0,
      rx: (k.rx || 0) / 100.0,
      ry: (k.ry || 0) / 100.0,
      children,
    };
  });

  return (
    <PhysicalLayoutComp
      positions={positions}
      oneU={48}
      hoverZoom={true}
      zoom={scale}
      selectedPosition={selectedKeyPosition}
      onPositionClicked={onKeyPositionClicked}
    />
  );
};
