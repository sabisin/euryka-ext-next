# Repository Instructions

## Project

This is a WXT browser extension project using Bun, React, TypeScript, Tailwind CSS, and Supabase.

## UI Theme

- Every new or modified UI component must respect the shared light and dark theme defined in `tailwind.css`.
- Use semantic Tailwind tokens such as `bg-background`, `bg-card`, `bg-primary`, `text-foreground`, `text-muted-foreground`, `text-destructive`, `text-success`, `text-warning`, `border-border`, and their foreground counterparts. Do not hardcode neutral or status colors when a semantic token exists.
- Primary actions must use `primary` and `primary-foreground`; in dark mode this intentionally produces a light button with dark text.
- Theme behavior is controlled by `data-theme="light"` and `data-theme="dark"`. UI rendered in content-script shadow roots must also receive the resolved theme instead of assuming a permanently dark palette.
- Use the shared `ek-scroll` class where the component design calls for Euryka-themed scrollbars, including Sparks and Prospector result surfaces. Do not mechanically add it to every overflow container; preserve intentionally native or unobtrusive screen-level scrolling.
- Check every changed component in both light and dark modes, including hover, focus, disabled, error, warning, success, popover, tooltip, and loading states.
- Literal colors are acceptable only when the color carries external or data-defined meaning, such as product logos, provider branding, user/spark identity colors, page-overlay scrims, or controls that must remain visible over arbitrary third-party webpages. Keep these exceptions deliberate and localized.

## Update Policy

- Prefer Bun for dependency management because this repo uses `bun.lock`.
- Do not update dependencies casually with `@latest`.
- For WXT patch/minor updates within the same `0.X` line, update with the package manager and then run `wxt prepare`.
- Treat WXT `0.X` second-digit changes as major upgrades. Before moving from one `0.X` line to another, read the official WXT upgrade guide and apply the documented breaking changes.
- After WXT upgrades, check imports from older WXT paths such as `wxt/storage`, `wxt/client`, and `wxt/sandbox`; WXT `0.20` recommends using `#imports` for those APIs.
- Extension permission changes can disable an installed extension on update. Before release, compare the generated manifest permissions against the previous release.

## Dependency Supply-Chain Policy

- Prefer dependency versions that have been publicly released for at least 7 days.
- For Bun, use a minimum release age of `604800` seconds when adding or updating packages:

```bash
bun add <package> --minimum-release-age 604800
```

- If a package version newer than 7 days is required, document why it is necessary and treat it as a supply-chain risk decision.
- Prefer stable, widely adopted releases over freshly published packages unless there is a clear security, compatibility, or functionality reason.
- Before changing dependency versions, check package registry metadata when practical and mention the release age in the summary.
- Commit `bun.lock` with dependency changes.
- In CI, prefer `bun ci` or `bun install --frozen-lockfile` instead of unconstrained installs.

## Security Context

The npm ecosystem has seen self-propagating supply-chain attacks such as Shai-Hulud and Mini Shai-Hulud, where compromised maintainer credentials were used to publish malicious package versions. A 7-day release-age gate reduces the chance of installing freshly published malicious versions before the ecosystem detects and removes them.

## File Changes

- Default to creating new files unless the user clearly requests a modification to an existing file.
- If the user references an existing file and asks to update, change, fix, add to, or remove from it, that is permission to modify that file.
- If intent is ambiguous, ask for clarification before modifying existing files.
- When asked to create a script, create a Bash script for Git Bash unless another shell is explicitly requested.
