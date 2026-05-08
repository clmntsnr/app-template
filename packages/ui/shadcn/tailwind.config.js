import preset from "@package-config/tailwind/tailwind.preset.js";

/** @type {import('tailwindcss').Config} */
export default {
  presets: [preset],
  content: ["./src/**/*.{ts,tsx}"],
};
