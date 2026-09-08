# Contributing

Contributions are welcome.

1. Create a focused branch.
2. Run `npm install`.
3. Make the smallest necessary change.
4. Run `npm test` and `npm run check`.
5. Describe the behavior change and validation in the pull request.

Do not commit screenshots or fixtures containing real account names, private messages, personalized timelines, or other user data. Use synthetic content for tests and documentation.

## Runtime Structure

The extension has no build step or runtime dependencies. `manifest.json` loads classic scripts in dependency order within Chrome's isolated content-script world. The popup loads the same settings definition before its own entry point.

- `src/settings.js`: setting keys, labels, defaults, normalization, and legacy migration. Initializes the internal `ZenView` namespace.
- `src/content/navigation.js`: native X navigation lookup and reversible compact alignment.
- `src/content/page-control.js`: in-page settings markup, rendering, positioning, and dismissal. Receives current state and a save callback from the entry point.
- `src/content/filters.js`: engagement counts, promoted-post and sidebar classification, and visibility classes. Takes settings explicitly and does not own storage or observers.
- `src/content.js`: content lifecycle, Chrome storage synchronization, save recovery, and bounded DOM refresh scheduling.
- `src/popup.js`: popup rendering and its storage adapter, using the shared setting definitions.

Stored setting values retain the original convention: `true` means hidden, while a checked UI switch means visible. Keep storage keys, defaults, migration behavior, and switch order backward compatible. The content and popup storage adapters intentionally remain separate: content handles legacy live events and page refreshes, while the popup has its own status and loading UI.

When changing module dependencies, update manifest and popup script order. The sidebar smoke test loads scripts from the manifest, and `npm run check` checks every JavaScript file under `src`, `tests`, and `scripts`.

## Refactor Verification

`npm test` includes a native-extension smoke test in a disposable Chromium profile. It verifies isolated-world script loading, reload persistence, and real Chrome storage synchronization between the popup and a synthetic X page.

For behavior-preserving changes, compare the working tree against a locally available baseline commit:

```sh
npm run test:parity -- --baseline-ref=<commit>
```

This compares synthetic page and popup states and screenshots without duplicating old source in the repository. Diagnostic artifacts stay under ignored `dist/qa`.
