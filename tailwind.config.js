/** @type {import('tailwindcss').Config} */
import trac from "tailwindcss-react-aria-components";
import contQueries from "@tailwindcss/container-queries";

export default {
  content: ["./index.html", "./download.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui"],
        keycap: ["Inter", "system-ui"],
      },
      fontSize: {
        // Tiny text inside a keycap: the behavior header and secondary legends
        "keycap-xs": "0.4rem",
      },
      colors: {
        // Values live in src/index.css so themes can swap them via data-theme
        primary: "var(--color-primary)",
        "primary-content": "var(--color-primary-content)",
        secondary: "var(--color-secondary)",
        accent: "var(--color-accent)",
        "base-content": "var(--color-base-content)",
        "base-100": "var(--color-base-100)",
        "base-200": "var(--color-base-200)",
        "base-300": "var(--color-base-300)",
        // Follows the theme's text color so borders stay visible on every
        // background, light or dark
        "base-border":
          "color-mix(in oklch, var(--color-base-content) 35%, transparent)",
      },
      // Plain `border`/`divide` use it too
      borderColor: {
        DEFAULT: "color-mix(in oklch, var(--color-base-content) 35%, transparent)",
      },
    },
  },
  plugins: [contQueries, trac({ prefix: "rac" })],
};
