import { useEffect, useState } from "react";
import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
} from "react-aria-components";
import { Check, Palette } from "lucide-react";
import { Tooltip } from "../misc/Tooltip";
import {
  THEMES,
  THEME_STORAGE_KEY,
  ThemeId,
  applyTheme,
  loadTheme,
} from "./themes";

// A mini keyboard in the theme's own colors; data-theme scopes the variables to it
const Swatch = ({ theme }: { theme: ThemeId }) => (
  <span
    data-theme={theme === "system" ? undefined : theme}
    className="flex gap-0.5 p-1 rounded bg-base-100 border border-base-300"
  >
    <span className="size-3 rounded-sm" style={{ background: "var(--key-alpha)" }} />
    <span className="size-3 rounded-sm" style={{ background: "var(--key-mod)" }} />
    <span className="size-3 rounded-sm" style={{ background: "var(--key-accent)" }} />
    <span className="size-3 rounded-sm bg-primary" />
  </span>
);

export const ThemePicker = () => {
  const [theme, setTheme] = useState<ThemeId>(loadTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Storage can be unavailable; the theme still applies for this session
    }
  }, [theme]);

  return (
    <MenuTrigger>
      <Tooltip label="Theme">
        <Button className="flex items-center justify-center p-1.5 rounded hover:bg-base-300">
          <Palette className="inline-block w-4 mx-1" aria-label="Theme" />
        </Button>
      </Tooltip>
      <Popover placement="bottom end">
        <Menu
          className="shadow-md rounded bg-base-100 text-base-content cursor-pointer overflow-hidden py-1 min-w-48"
          selectionMode="single"
          selectedKeys={[theme]}
          onAction={(key) => setTheme(key as ThemeId)}
        >
          {THEMES.map((t) => (
            <MenuItem
              key={t.id}
              id={t.id}
              textValue={t.label}
              className="flex items-center gap-2 px-2 py-1 hover:bg-base-200 rac-focus:bg-base-200 outline-none"
            >
              <Swatch theme={t.id} />
              <span className="flex-1">{t.label}</span>
              {theme === t.id && <Check className="w-4" />}
            </MenuItem>
          ))}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
};
