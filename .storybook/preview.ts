import "../src/index.css";
import type { Preview } from "@storybook/react";
import { THEMES, ThemeId, applyTheme } from "../src/theme/themes";

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "App theme",
      toolbar: {
        title: "Theme",
        icon: "paintbrush",
        items: THEMES.map((t) => ({ value: t.id, title: t.label })),
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: "system" },
  decorators: [
    (Story, context) => {
      applyTheme((context.globals.theme ?? "system") as ThemeId);
      return Story();
    },
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
