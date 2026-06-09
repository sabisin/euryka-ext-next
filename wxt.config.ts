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
      "tabs",
      "sidePanel",
      "webNavigation",
      "contextMenus",
    ],
    // <all_urls> is required: the content script runs on every site (floating
    // button, selection tracking, annotations), image analysis fetches images
    // from arbitrary origins, and API calls target WXT_BASE_URL.
    host_permissions: ["<all_urls>"],
    // Explicitly pin the MV3 secure default for extension pages. This does not
    // constrain connect-src, so fetches to the API / notify / Sentry still work.
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';",
    },
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
    commands: {
      "toggle-annotations": {
        suggested_key: {
          default: "Alt+Shift+A",
        },
        description: "Show or hide annotations on the page",
      },
    },
  },
});
