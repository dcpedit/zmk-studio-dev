import {
  Button,
  Checkbox,
  CheckboxGroup,
  ComboBox,
  Input,
  Key,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from "react-aria-components";
import { hid_usage_page_get_ids, hid_usage_get_metadata } from "../hid-usages";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Tooltip } from "../misc/Tooltip";
import { UsageIcon } from "../keyboard/UsageIcon";
import { hasUsageIcon } from "../keyboard/usageIcons";

export interface HidUsagePage {
  id: number;
  min?: number;
  max?: number;
}

export interface HidUsagePickerProps {
  label?: string;
  value?: number;
  usagePages: HidUsagePage[];
  onValueChanged: (value?: number) => void;
}

enum Mods {
  LeftControl = 0x01,
  LeftShift = 0x02,
  LeftAlt = 0x04,
  LeftGUI = 0x08,
  RightControl = 0x10,
  RightShift = 0x20,
  RightAlt = 0x40,
  RightGUI = 0x80,
}

const mod_labels: Record<Mods, string> = {
  [Mods.LeftControl]: "L Ctrl",
  [Mods.LeftShift]: "L Shift",
  [Mods.LeftAlt]: "L Alt",
  [Mods.LeftGUI]: "L GUI",
  [Mods.RightControl]: "R Ctrl",
  [Mods.RightShift]: "R Shift",
  [Mods.RightAlt]: "R Alt",
  [Mods.RightGUI]: "R GUI",
};

const all_mods = [
  Mods.LeftControl,
  Mods.LeftShift,
  Mods.LeftAlt,
  Mods.LeftGUI,
  Mods.RightControl,
  Mods.RightShift,
  Mods.RightAlt,
  Mods.RightGUI,
];

function mods_to_flags(mods: Mods[]): number {
  return mods.reduce((a, v) => a + v, 0);
}

function mask_mods(value: number) {
  return value & ~(mods_to_flags(all_mods) << 24);
}

const HidUsageGrid = ({
  value,
  onValueChanged,
  usagePages,
}: HidUsagePickerProps) => {
  type Usage = {
    Name: string;
    Id: number;
    pageName: string;
    pageId: number;
  };
  const allUsages = useMemo(() => {
    return usagePages.flatMap((page) => {
      const pageInfo = hid_usage_page_get_ids(page.id);
      if (!pageInfo) {
        return [];
      }

      let usages = pageInfo.UsageIds || [];
      if (page.max || page.min) {
        usages = usages.filter(
          (i) =>
            (i.Id <= (page.max || Number.MAX_SAFE_INTEGER) &&
              i.Id >= (page.min || 0)) ||
            (page.id === 7 && i.Id >= 0xe0 && i.Id <= 0xe7),
        );
      }

      return usages.map((usage) => ({
        ...usage,
        pageId: page.id,
        pageName: pageInfo.Name,
      }));
    });
  }, [usagePages]);

  const selectedKey = value !== undefined ? mask_mods(value) : null;

  // The full name, since grid buttons only fit a short label
  const getFullName = (usage: Usage) =>
    (hid_usage_get_metadata(usage.pageId, usage.Id)?.long || usage.Name).replace(
      /^Keyboard /,
      "",
    );

  const getButtonLabel = (usage: Usage) => {
    const metadata = hid_usage_get_metadata(usage.pageId, usage.Id);
    if (metadata?.med) {
      return metadata.med;
    }
    if (metadata?.short) {
      return metadata.short;
    }

    if (usage.pageName === "Keyboard/Keypad") {
      const match = usage.Name.match(/^(Keyboard|Keypad) (\S+)/);
      if (match && match[2]) {
        return match[2];
      }
    }
    return usage.Name;
  };

  const categorizedUsages = useMemo(() => {
    const categories: Record<string, Usage[]> = {};

    for (const usage of allUsages) {
      const metadata = hid_usage_get_metadata(usage.pageId, usage.Id);
      const category = metadata?.category || "Other";

      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(usage);
    }

    return categories;
  }, [allUsages]);

  const categoryOrder = [
    "Letters",
    "Numbers/Punctuation",
    "Function/Navigation/Mods",
    "Numpad",
    "Apps/Media/Special",
    "International",
    "Other",
  ];
  const selectedCategory = useMemo(() => {
    if (selectedKey === null) {
      return undefined;
    }

    return Object.keys(categorizedUsages).find((category) =>
      categorizedUsages[category].some(
        (usage) => ((usage.pageId << 16) | usage.Id) === selectedKey,
      ),
    );
  }, [categorizedUsages, selectedKey]);

  // Follow the selected key to its tab whenever a different key is selected,
  // while still letting the user browse other tabs in the meantime.
  const [activeTab, setActiveTab] = useState<Key | undefined>(selectedCategory);
  useEffect(() => {
    if (selectedCategory) {
      setActiveTab(selectedCategory);
    }
    // Only follow on selection changes, not when the user switches tabs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  const sortedCategories = Object.keys(categorizedUsages).sort((a, b) => {
    const indexA = categoryOrder.indexOf(a);
    const indexB = categoryOrder.indexOf(b);
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return a.localeCompare(b);
  });

  return (
    <Tabs
      className="flex flex-col"
      selectedKey={activeTab}
      onSelectionChange={setActiveTab}
    >
      {/* Folder tabs: the selected one alone shares the panel's background and
          covers the list's bottom border (-mb-px) so it joins the panel */}
      <TabList className="flex gap-1 px-1 border-b">
        {sortedCategories.map((category) => (
          <Tab
            key={category}
            id={category}
            className="rac-selected:-mb-px px-4 py-2 flex items-center whitespace-nowrap cursor-pointer outline-none rounded-t-md border border-transparent bg-base-300 opacity-70 transition-colors hover:opacity-100 hover:bg-base-100 rac-selected:opacity-100 rac-selected:bg-base-100 rac-selected:border-base-border rac-selected:border-b-base-100 rac-selected:shadow-[inset_0_2px_0_var(--color-primary)] rac-focus-visible:ring-2 rac-focus-visible:ring-primary"
          >
            {category}
            {category === selectedCategory && (
              <span
                className="inline-block size-1.5 ml-1.5 rounded-full bg-primary"
                aria-label="(contains selected key)"
              />
            )}
          </Tab>
        ))}
      </TabList>
      {sortedCategories.map((category) => (
        <TabPanel
          key={category}
          id={category}
          className="min-h-56 max-h-56 overflow-y-auto flex flex-wrap justify-start content-start gap-1 p-1 border border-t-0 rounded-b bg-base-100 rac-focus-visible:ring-2 rac-focus-visible:ring-primary"
        >
          {category === "Other" ? (
            <ComboBox
              className="w-full p-2"
              defaultItems={categorizedUsages[category]}
              selectedKey={selectedKey}
              onSelectionChange={(key) =>
                key !== null && onValueChanged(key as number)
              }
            >
              <Label className="text-sm">Search for another key</Label>
              <div className="relative flex items-center">
                <Input className="p-1 rounded-l border bg-base-100" />
                <Button className="rounded-r bg-primary text-primary-content w-8 h-8 flex justify-center items-center">
                  <ChevronDown className="size-4" />
                </Button>
              </div>
              <Popover className="w-[var(--trigger-width)] max-h-4 shadow-md text-base-content rounded border-base-content bg-base-100">
                <ListBox className="block max-h-[30vh] min-h-[unset] overflow-auto p-2">
                  {(item: Usage) => {
                    const usageValue = (item.pageId << 16) | item.Id;
                    return (
                      <ListBoxItem
                        id={usageValue}
                        textValue={item.Name}
                        className="rac-hover:bg-base-300 pl-3 relative rac-focus:bg-base-300 cursor-default select-none rac-selected:before:content-['✔'] before:absolute before:left-[0] before:top-[0]"
                      >
                        {item.Name}
                      </ListBoxItem>
                    );
                  }}
                </ListBox>
              </Popover>
            </ComboBox>
          ) : (
            categorizedUsages[category].map((usage) => {
              const usageValue = (usage.pageId << 16) | usage.Id;
              const icon = hid_usage_get_metadata(usage.pageId, usage.Id)?.icon;
              return (
                <Tooltip key={usageValue} label={getFullName(usage)} delay={400} placement="bottom">
                  <Button
                    aria-label={getFullName(usage)}
                    onPress={() => onValueChanged(usageValue)}
                    className={`w-16 h-16 p-1 rounded border text-center flex items-center justify-center ${selectedKey === usageValue ? "bg-primary text-primary-content" : "bg-base-200 hover:bg-base-300"}`}
                  >
                    {hasUsageIcon(icon) ? (
                      <UsageIcon icon={icon} label={getFullName(usage)} className="size-6" />
                    ) : (
                      getButtonLabel(usage)
                    )}
                  </Button>
                </Tooltip>
              );
            })
          )}
        </TabPanel>
      ))}
    </Tabs>
  );
};

export const HidUsagePicker = ({
  label,
  value,
  usagePages,
  onValueChanged,
}: HidUsagePickerProps) => {
  const mods = useMemo(() => {
    let flags = value ? value >> 24 : 0;

    return all_mods.filter((m) => m & flags).map((m) => m.toLocaleString());
  }, [value]);

  const selectionChanged = useCallback(
    (e: number | undefined) => {
      let value = typeof e == "number" ? e : undefined;
      if (value !== undefined) {
        let mod_flags = mods_to_flags(mods.map((m) => parseInt(m)));
        value = value | (mod_flags << 24);
      }

      onValueChanged(value);
    },
    [onValueChanged, mods],
  );

  const modifiersChanged = useCallback(
    (m: string[]) => {
      if (!value) {
        return;
      }

      let mod_flags = mods_to_flags(m.map((m) => parseInt(m)));
      let new_value = mask_mods(value) | (mod_flags << 24);
      onValueChanged(new_value);
    },
    [value],
  );

  return (
    <div className="flex flex-col gap-2 relative">
      {label && (
        <Label
          id="hid-usage-picker"
          className="text-xs font-semibold uppercase tracking-wider opacity-70 border-b pb-1"
        >
          {label}
        </Label>
      )}
      <CheckboxGroup
        className="flex flex-wrap gap-x-2 gap-y-1 items-center"
        value={mods}
        onChange={modifiersChanged}
      >
        <div className="flex items-center gap-1">
          <Label>Implicit Modifiers:</Label>
          <Tooltip
            label={'Held down together with the key, e.g. L Shift + 1 types "!".'}
            delay={200}
          >
            <Button
              aria-label="About implicit modifiers"
              className="size-4 rounded-full border text-[0.7rem] leading-none font-semibold flex items-center justify-center opacity-70 hover:opacity-100 cursor-help"
            >
              ?
            </Button>
          </Tooltip>
        </div>
        <div className="grid grid-flow-col gap-x-px auto-cols-[minmax(min-content,1fr)] content-stretch divide-x rounded-md">
          {all_mods.map((m) => (
            <Checkbox
              key={m}
              value={m.toLocaleString()}
              className="text-nowrap cursor-pointer grid px-2 content-center justify-center rac-selected:bg-primary border-base-100 bg-base-300 hover:bg-base-100 first:rounded-s-md last:rounded-e-md rac-selected:text-primary-content"
            >
              {mod_labels[m]}
            </Checkbox>
          ))}
        </div>
      </CheckboxGroup>
      <HidUsageGrid
        value={value}
        onValueChanged={selectionChanged}
        usagePages={usagePages}
      />
    </div>
  );
};
