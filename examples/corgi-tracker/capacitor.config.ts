import type { CapacitorConfig } from "@capacitor/cli";

// Capacitor wraps the Vite build (`dist/`) in a native iOS/Android shell.
// `appId` is the bundle/package identifier — change it before publishing.
// `server.url` (commented) lets the native app load a dev server instead of
// the bundled `dist/` — useful for live-reload on a physical device.
const config: CapacitorConfig = {
  appId: "xyz.merkl.corgitracker",
  appName: "Corgi Tracker",
  webDir: "dist",
  // server: {
  //   url: "http://192.168.1.42:5175",
  //   cleartext: true,
  // },
};

export default config;
