import {
  hid_usage_get_metadata,
  hid_usage_page_and_id_from_usage,
} from "../hid-usages";

export interface HidUsageLabelProps {
  hid_usage: number;
}

function remove_prefix(s?: string) {
  return s?.replace(/^Keyboard /, "");
}

// Implicit modifiers (e.g. LS(A)) are stored in the top byte of the usage,
// left mods in the low nibble and right mods in the high nibble.
const implicit_mods = [
  { mask: 0x11, symbol: "⌃", name: "Ctrl" },
  { mask: 0x22, symbol: "⇧", name: "Shift" },
  { mask: 0x44, symbol: "⌥", name: "Alt" },
  { mask: 0x88, symbol: "⌘", name: "GUI" },
];

function implicit_mods_from_usage(hid_usage: number) {
  const flags = hid_usage >>> 24;
  return implicit_mods.filter((m) => m.mask & flags);
}

export const HidUsageLabel = ({ hid_usage }: HidUsageLabelProps) => {
  let [page, id] = hid_usage_page_and_id_from_usage(hid_usage);

  page &= 0xff;

  let labels = hid_usage_get_metadata(page, id);

  const mods = implicit_mods_from_usage(hid_usage);
  const short = remove_prefix(labels.short);

  // Keycap-style legends ("1 !") already show the shifted character,
  // so LS(N1) is labeled "!" rather than "⇧1 !".
  const legend = short?.match(/^(\S+) (\S+)$/);
  const shifted = legend && mods.some((m) => m.name === "Shift") ? legend[2] : undefined;
  const prefix = mods
    .filter((m) => !shifted || m.name !== "Shift")
    .map((m) => m.symbol)
    .join("");

  return (
    <span
      className="@[10em]:before:content-[attr(data-long-content)] @[6em]:before:content-[attr(data-med-content)] before:content-[attr(aria-label)]"
      aria-label={prefix + (shifted ?? short ?? "")}
      title={
        mods.length > 0
          ? [...mods.map((m) => m.name), short].join(" + ")
          : undefined
      }
      data-med-content={prefix + (shifted ?? remove_prefix(labels.med || labels.short) ?? "")}
      data-long-content={
        prefix +
        (shifted ?? remove_prefix(labels.long || labels.med || labels.short) ?? "")
      }
    />
  );
};
