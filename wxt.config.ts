import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  extensionApi: "chrome",
  modules: ["@wxt-dev/module-react"],
  webExt: {
    disabled: true,
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: "Euryka",
    description: "Your AI Swiss Army Knife",
    permissions: [
      "storage",
      "unlimitedStorage",
      "scripting",
      "tabs",
      "sidePanel",
      "webNavigation",
      "contextMenus",
    ],
    host_permissions: ["<all_urls>"],
    icons: {
      16: "ek-icon16.png",
      32: "ek-icon32.png",
      48: "ek-icon48.png",
      128: "ek-icon128.png",
    },
    action: {
      default_icon: {
        16: "ek-icon16.png",
        32: "ek-icon32.png",
        48: "ek-icon48.png",
        128: "ek-icon128.png",
      },
    },
    side_panel: {
      default_path: "sidepanel.html",
    },
  },
});
