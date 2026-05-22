# Euryka Chrome Extension v2

AI-powered browser extension that lets you run Sparks, analyse images, and review past sessions — all from a side panel on any webpage.

## Stack

| | |
|---|---|
| Framework | [WXT](https://wxt.dev) |
| UI | React 19 |
| Styling | Tailwind CSS v4 |
| Components | shadcn/ui |
| Server state | TanStack Query |
| UI state | Zustand |
| Messaging | @webext-core/messaging (typed) |
| Linting | Biome |
| Package manager | Bun |

## Project structure

```
entrypoints/
  background.ts       # Service worker — tab tracking, context menus, message routing
  content.ts          # Content script — text extraction, selection, drag detection
  content-ui/         # Floating action button (Shadow DOM)
  sidepanel/          # Main React app

lib/
  messaging.ts        # All typed message definitions
  storage.ts          # Persistent storage items (WXT)
  api.ts              # All API functions
  auth.ts             # JWT decode, token lifecycle
  content-extraction.ts
  image-utils.ts

components/
  layout/             # AppShell, AppSidebar, Header, LoggedOut
  sparks/             # SparksGallery, SparkCard, SparksResult, ContextSelector
  history/            # HistoryList, SessionCard, SessionView
  image/              # DropzoneOverlay, ImageResult
  shared/             # AnimatedMarkdown, StickyActionBar, MediaPreview

hooks/
  use-storage-item.ts # Reactive WXT storage hook for React
  use-sparks.ts       # TanStack Query — sparks list + execution
  use-sessions.ts     # TanStack Query — infinite scroll sessions
  use-workspace.ts    # TanStack Query — workspaces, brands, projects

store/
  ui.ts               # Zustand — ephemeral UI state
```

## Setup

```bash
bun install
```

Copy `.env.example` to `.env` and set:

```
WXT_BASE_URL=https://app.euryka.ai
```

## Development

```bash
bun run dev
```

Then load the extension in Chrome:

1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `.output/chrome-mv3`

WXT will watch for changes and rebuild automatically. Reload the extension in Chrome after each rebuild.

## Upgrading WXT

Upgrade WXT when the project needs a documented bug fix, browser compatibility change, security fix, or WXT feature. Avoid routine `@latest` upgrades without a reason.

WXT is still on `0.X`, so treat changes to the second version number as major upgrades. For example, `0.20.x` to `0.21.x` should be handled as a migration, not a casual patch.

Recommended process:

1. Read the official [WXT upgrade guide](https://wxt.dev/guide/resources/upgrading) for the target version.
2. Check registry metadata and prefer a WXT version that has been publicly released for at least 7 days.
3. Update WXT and related WXT packages with Bun's release-age gate:

```bash
bun add -d wxt@<version> @wxt-dev/module-react@<version> --minimum-release-age 604800
```

4. Regenerate WXT types:

```bash
bunx wxt prepare
```

5. Run the project checks:

```bash
bun run check
bun run build
```

Before release, compare the generated extension manifest against the previous release. New or changed permissions can disable the installed extension until the user manually re-enables it.

## Production build

```bash
bun run build
```

Output: `.output/chrome-mv3/`

## Zip for submission

```bash
bun run zip
```

## Lint & format

```bash
bun run lint
bun run format
```

## Environment variables

| Variable | Description |
|---|---|
| `WXT_BASE_URL` | Backend API base URL |

WXT exposes env vars prefixed with `WXT_` to all entrypoints via `import.meta.env`.
