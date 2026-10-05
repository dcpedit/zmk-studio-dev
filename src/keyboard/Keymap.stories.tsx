import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import type {
  BehaviorBinding,
  PhysicalLayout,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type {
  BehaviorParameterValueDescription,
  GetBehaviorDetailsResponse,
} from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import { Keymap } from "./Keymap";
import { hid_usage_from_page_and_id } from "../hid-usages";

const meta = {
  title: "Keyboard/Keymap",
  component: Keymap,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="p-8">
        <Story />
      </div>
    ),
  ],
  args: {
    onKeyPositionClicked: fn(),
  },
} satisfies Meta<typeof Keymap>;

export default meta;
type Story = StoryObj<typeof meta>;

// Behavior metadata mirroring what ZMK firmware reports for its built-in behaviors.
const hid: BehaviorParameterValueDescription = {
  name: "Key",
  hidUsage: { keyboardMax: 0xff, consumerMax: 0xfff },
};
const layer: BehaviorParameterValueDescription = { name: "Layer", layerId: {} };
const constant = (name: string, value: number) => ({ name, constant: value });

const behaviorList: Omit<GetBehaviorDetailsResponse, "id">[] = [
  { displayName: "Key Press", metadata: [{ param1: [hid], param2: [] }] },
  {
    displayName: "Bluetooth",
    metadata: [
      {
        param1: [
          constant("Next Profile", 1),
          constant("Previous Profile", 2),
          constant("Clear All Profiles", 4),
          constant("Clear Selected Profile", 0),
        ],
        param2: [],
      },
      {
        param1: [constant("Select Profile", 3), constant("Disconnect Profile", 5)],
        param2: [{ name: "Profile", range: { min: 0, max: 5 } }],
      },
    ],
  },
  {
    displayName: "Output Selection",
    metadata: [
      {
        param1: [
          constant("Toggle Outputs", 0),
          constant("USB Output", 1),
          constant("BLE Output", 2),
        ],
        param2: [],
      },
    ],
  },
  { displayName: "Mod-Tap", metadata: [{ param1: [hid], param2: [hid] }] },
  { displayName: "Layer-Tap", metadata: [{ param1: [layer], param2: [hid] }] },
  { displayName: "Momentary Layer", metadata: [{ param1: [layer], param2: [] }] },
  { displayName: "Toggle Layer", metadata: [{ param1: [layer], param2: [] }] },
  { displayName: "Bootloader", metadata: [] },
  { displayName: "Reset", metadata: [] },
  { displayName: "Transparent", metadata: [] },
  { displayName: "None", metadata: [] },
  { displayName: "Studio Unlock", metadata: [] },
  { displayName: "Caps Word", metadata: [] },
  {
    displayName: "Backlight",
    metadata: [
      {
        param1: [constant("Toggle On/Off", 0), constant("Increase Brightness", 3)],
        param2: [],
      },
      {
        param1: [constant("Set Brightness", 6)],
        param2: [{ name: "Brightness", range: { min: 0, max: 100 } }],
      },
    ],
  },
  {
    displayName: "Underglow",
    metadata: [
      {
        param1: [constant("Toggle On/Off", 0), constant("Next Effect", 11)],
        param2: [],
      },
    ],
  },
  {
    displayName: "Mouse Key Press",
    metadata: [
      {
        param1: [constant("MB1", 1), constant("MB2", 2), constant("MB3", 4)],
        param2: [],
      },
    ],
  },
];

const behaviors = Object.fromEntries(
  behaviorList.map((b, i) => [i + 1, { ...b, id: i + 1 }])
);
const id = (displayName: string) =>
  behaviorList.findIndex((b) => b.displayName === displayName) + 1;

const kb = (usage: number) => hid_usage_from_page_and_id(7, usage);
const LSHIFT = 0x02 << 24;
const LCTRL = 0x01 << 24;
const LGUI = 0x08 << 24;

const bind = (name: string, param1 = 0, param2 = 0): BehaviorBinding => ({
  behaviorId: id(name),
  param1,
  param2,
});

const bindings: BehaviorBinding[] = [
  // Row 1: plain keys, implicit mods, consumer
  bind("Key Press", kb(0x04)),
  bind("Key Press", kb(0x29)),
  bind("Key Press", LSHIFT | kb(0x1e)),
  bind("Key Press", LCTRL | kb(0x06)),
  bind("Key Press", LGUI | LSHIFT | kb(0x20)),
  bind("Key Press", hid_usage_from_page_and_id(0x0c, 0xe9)),
  bind("Caps Word"),
  bind("Key Press", kb(0x2a)),
  // Row 2: hold-taps and layers
  bind("Mod-Tap", kb(0xe1), kb(0x04)),
  bind("Mod-Tap", kb(0xe3), kb(0x16)),
  bind("Layer-Tap", 1, kb(0x2c)),
  bind("Momentary Layer", 2),
  bind("Toggle Layer", 1),
  bind("Transparent"),
  bind("None"),
  bind("Studio Unlock"),
  // Row 3: system, wireless, lighting, mouse
  bind("Bluetooth", 3, 0),
  bind("Bluetooth", 3, 1),
  bind("Bluetooth", 0),
  bind("Output Selection", 1),
  bind("Bootloader"),
  bind("Reset"),
  bind("Backlight", 6, 50),
  bind("Mouse Key Press", 1),
];

const COLS = 8;
const layout: PhysicalLayout = {
  name: "Grid",
  keys: bindings.map((_, i) => ({
    width: 100,
    height: 100,
    x: (i % COLS) * 100,
    y: Math.floor(i / COLS) * 100,
    r: 0,
    rx: 0,
    ry: 0,
  })),
};

export const BehaviorLabels: Story = {
  args: {
    layout,
    behaviors,
    keymap: {
      availableLayers: 0,
      maxLayerNameLength: 20,
      layers: [
        { id: 0, name: "QWERTY", bindings },
        { id: 1, name: "NUMBER", bindings: [] },
        { id: 2, name: "SYMBOL", bindings: [] },
      ],
    },
    scale: 1,
    selectedLayerIndex: 0,
    selectedKeyPosition: undefined,
  },
};
