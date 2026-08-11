# Annotation synchronization and image drag regression plan

## Purpose

Verify that annotation updates are delivered only to tabs showing the annotation target, that concurrent saves never replace newer typing, and that image drag overlays reliably open and close across page, side-panel, and filesystem drag sources.

## Prerequisites

1. Build the extension with `bun run build`.
2. Reload the unpacked extension from `.output/chrome-mv3` in `chrome://extensions`.
3. Open the extension service-worker console and keep it visible for unexpected errors.
4. Open the side panel for two normal HTTPS tabs.
5. Use an account with permission to create, edit, and delete annotations.
6. Prepare one local PNG or JPG smaller than 16 MB and one non-image file.

Record the browser version, extension commit, tested URL, result, and any console error for each case.

## A. Baseline annotation flow

### A1. Create and edit from the page

1. Create an annotation on page A.
2. Enter `page version 1` in the page composer and save.
3. Open Annotations in the side panel.

Expected: the new annotation appears once, its title/content is `page version 1`, and no duplicate marker is created.

### A2. Edit from the side panel with the page composer closed

1. Change the note to `side panel version 2` and save.
2. Open the corresponding marker on page A.

Expected: the page composer opens with `side panel version 2`. Clicking in and out without editing must not restore or save the old value.

### A3. Edit from the side panel with a pristine page composer open

1. Leave the page composer open without typing.
2. Change the note in the side panel to `side panel version 3` and save.

Expected: the open page composer updates to `side panel version 3`; its Save control shows the saved state and no stale PATCH follows on blur.

## B. Tab-delivery scope

### B1. Different URL on the same domain

1. Keep page A open with its annotation.
2. Open page B on the same domain but a different path.
3. Edit page A's annotation from the side panel.

Expected: page A updates. Page B receives no marker/content change and logs no annotation rendering activity for page A.

### B2. Query-string isolation

1. Open `https://host/path?case=one` and `https://host/path?case=two` in separate tabs.
2. Create an annotation on `case=one` and edit it from the side panel.

Expected: only `case=one` updates. `case=two` remains unchanged.

### B3. Hash-route isolation

1. On an SPA, open the same path with `#section-one` and `#section-two` in separate tabs.
2. Create and edit an annotation on `#section-one`.

Expected: only the exact hash target updates. If the product intends annotations to span hash routes, mark this case for a product decision rather than changing URL matching ad hoc.

### B4. Duplicate exact URL

1. Duplicate page A so two tabs have the exact same URL.
2. Edit the annotation from either side panel.

Expected: both exact-target tabs update. This confirms URL scoping does not incorrectly limit delivery to only the active tab.

### B5. SPA navigation

1. Open an annotated SPA route.
2. Navigate with an in-page link that uses `pushState`.
3. Edit the original annotation from another exact-target tab.

Expected: the navigated tab does not display the original route's update; navigating back reloads the correct annotation state.

### B6. Deletion scope

1. Keep exact-target and different-target tabs open.
2. Delete the annotation from the side panel, then repeat with a newly created annotation deleted from the page composer.

Expected: markers disappear from every exact-target tab only. The side-panel list/view returns cleanly without “annotation not found” loops.

### B7. Service-worker restart

1. Stop the extension service worker from `chrome://extensions`.
2. Trigger an annotation edit from the side panel so Chrome restarts it.

Expected: the save succeeds and the exact-target page updates. No notification is lost during worker startup.

### B8. Restricted and unrelated tabs

1. Keep `chrome://extensions`, a new-tab page, and several unrelated HTTPS tabs open.
2. Edit and delete an annotation.

Expected: no uncaught `Could not establish connection` errors and no visible changes in unrelated tabs.

## C. Concurrent-save and data-loss tests

Use DevTools network throttling or a temporary slow API response so a save remains in flight long enough to continue typing.

### C1. Page composer: type during save

1. Enter `first submission` and click Save.
2. Before the request completes, change it to `newest page draft`.

Expected: the response for `first submission` never replaces `newest page draft`. The editor remains unsaved until the newest draft is saved.

### C2. Page composer: queued blur save

1. Save `first submission` under throttling.
2. Type `queued page submission` and click outside the composer while the first request is active.
3. Wait for both operations to settle and reopen the annotation.

Expected: requests execute serially and the persisted value is `queued page submission`.

### C3. Side panel: rapid saves

1. Save `side first`.
2. Immediately change the text to `side newest` and save or blur again.

Expected: no overlapping PATCH can make `side first` win after `side newest`; the final server and page-overlay value is `side newest`.

### C4. Cross-context unsaved edit

1. Type `unsaved page work` in the page composer without saving.
2. Save `remote side-panel work` from the side panel.

Expected: the page's unsaved typing is not silently replaced. Save it only if intentionally choosing the page version, then confirm both contexts converge on that final value.

### C5. Save failure and retry

1. Go offline after editing, then save.
2. Confirm the draft remains visible and unsaved.
3. Restore connectivity and save again.

Expected: no draft loss, no false saved indicator, and the retry persists successfully.

## D. Image drag lifecycle

### D1. Drag a webpage image and drop

Expected: overlay appears promptly, remains stable while crossing its icon/text/card children, accepts the drop, and starts image analysis once.

### D2. Drag a webpage image into the side panel, then back out without dropping

Expected: overlay closes when the drag leaves the side-panel document and reappears if the image re-enters.

### D3. Drag a local image and drop

Expected: the same behavior as D1, including files originating outside Chrome.

### D4. Drag a local image in, then leave without dropping

Expected: overlay closes automatically. It must not remain as a full-screen blocker requiring a click.

### D5. Cancel with Escape

Expected: browser drag cancellation clears the overlay and normal side-panel interaction resumes.

### D6. Invalid content

1. Drag a non-image file.
2. Drag a normal hyperlink or selected text.

Expected: no analysis starts. Any error closes predictably, and the overlay never remains stuck.

### D7. Repeated drags

Perform ten enter/leave cycles followed by a valid drop.

Expected: drag-depth tracking does not drift; the overlay closes on every leave and the final drop is processed once.

## E. Regression checks

1. Confirm annotations still synchronize when light and dark themes differ between the website and side panel.
2. Confirm annotation markers survive scrolling and SPA navigation.
3. Confirm image analysis and Spark result headers retain their aligned Back/centered-Sparks layout.
4. Confirm the Sparks top blur is absent at scroll position zero and appears after scrolling.
5. Run `bun run check`, `bun test`, and `bun run build` after manual testing.

### E1. Cancel outside the side panel

1. Start dragging an image into the side panel until the drop overlay appears.
2. Move the pointer back outside the side panel and release without dropping in it.
3. Repeat and cancel the drag with Escape while the pointer is over the panel.

Expected: the overlay closes immediately in both cases and does not reappear until a new drag starts.

### E2. Replace an image from Image Analysis

1. Complete one image analysis and remain on its result screen.
2. Drag a different image into the side panel.
3. Drop it on the overlay.

Expected: the overlay appears above the existing result, the new image begins analysis, and the result view updates to the newly dropped image.

## Exit criteria

- Every expected result above passes in two consecutive runs.
- No stale annotation value overwrites newer text.
- No annotation notification visibly affects a different target URL.
- Exact duplicate URLs remain synchronized.
- No drag overlay remains after leaving or cancelling a drag.
- Service-worker, page, and side-panel consoles contain no new uncaught errors.
