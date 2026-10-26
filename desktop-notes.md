# easy text desktop backend

Implemented by the `evidence_review` subagent, independently reviewed by `sublime_inventory`. Renderer ownership remains with `editor_implementation`.

## Run and package

- `npm run desktop`: build and launch the installed Electron runtime.
- `npm run package:mac`: build a macOS ARM64 application under `dist-desktop/easy text-darwin-arm64/easy text.app`.
- This Mac reports `uname -m = arm64`, while the terminal Node runtime reports `process.arch = x64`. The packaging target is explicitly ARM64; the npm-installed development Electron follows the Node host architecture. The packaged app must be tested independently.
- The application is unsigned and not notarized; no distribution identity or signing credential is claimed. No installer or remote publishing is performed.

## Native boundary

`desktop/preload.cjs` exposes only named `window.easyText` methods. The renderer has no Node integration or generic IPC, filesystem or shell entry point. Main requires the window's own top-level frame and exact packaged page URL. Context isolation and renderer sandbox are enabled. Permission requests, external navigation, popups and remote network requests are denied. A restrictive CSP permits bundled scripts and the editor's generated styles.

File capabilities originate in native open/save dialogs, or the app's own previously saved session. Paths are resolved with realpath and checked against authorized roots/single files. Directory inventories do not follow symlinks and omit `.git` and `node_modules`; inventory maximum is 12,000 entries, editable files maximum 10 MiB. A list response reports truncation. Git operates only when the opened directory contains its own `.git` marker, preventing discovery of a parent repository outside the selected root.

## File safety and formats

Read results contain `revision:{sha256,mtimeMs,size}`, `encoding`, `bom`, and `lineEnding`. Editor content is normalized to LF. UTF-8 and BOM-marked UTF-16LE/BE are decoded strictly; binary NUL or malformed input is refused. UTF-16 writes include a BOM. LF, CRLF and CR are restored on write. Mixed line endings require an explicit normalization choice. Legacy encodings and BOM-less UTF-16 are not guessed.

Save checks the supplied revision, stores original bytes and metadata in the app data `backups/` directory, writes and fsyncs a unique sibling temporary file, checks the revision again and renames atomically. Same-path saves are serialized. Failed/conflicting saves preserve the original and report an error. Exclusive creation and hard-link-then-unlink renaming avoid overwriting another file. Native Save As is a separate explicit overwrite flow.

These checks detect observed external edits; filesystem rename is not an operating-system compare-and-swap primitive. An uncooperative external writer can still race the final check and rename. Original bytes observed before each accepted save are retained in app backups. No claim of protection against every cross-process write race is made. Backups currently have no automatic retention cleanup or recovery browser; they remain under the application data directory.

File watchers emit change events; they are notifications, not proof that every filesystem event was delivered. The renderer must compare revisions and avoid replacing dirty buffers silently.

## Project operations

- Search operates within the granted tree, returning at most 1,000 matches and skipped/truncated indicators. Literal and JavaScript Unicode regular expressions are supported.
- Pattern matching and replacement run in a worker thread with a 1-second per-file timeout and a 128 MiB V8 heap limit. Zero-width regex matches advance by Unicode code point. Regex replacement uses JavaScript `$1`, `$&`, named-group etc. semantics; literal replacement treats `$` literally.
- Replacement creates a bounded, revision-bearing preview (200 files / 20 MiB maximum), requires an explicit apply plus native confirmation, then prechecks all revisions before writing. Per-file saves retain backups. A later filesystem error can cause a partial batch, which is reported; this is not a cross-file filesystem transaction.
- A successful apply returns `undoId`; `undoReplace` checks the current applied revisions before restoring prior content, encoding and line endings. Undo is available within the current app process; old-byte backups persist across restarts. Undo refuses when another edit has changed a file.
- Symbol indexing uses textual declaration patterns, returns `semantic:false`, and does not claim LSP/semantic analysis.

## Git and build

Git uses fixed `git` subcommands (status, diff, log, stage and commit) with argument arrays. Diff disables external diff/textconv, hooks and fsmonitor are disabled for these operations, output/time limits apply. Stage and commit require native user confirmation. No fetch, push or background commit is implemented or run by the agent. Git author configuration must be supplied by the user's repository/global Git setup.

Build launches only after the user configures an executable/argument array and confirms the exact command and working directory in a native dialog. No build runs on opening a project. `shell:false` prevents implicit shell parsing; explicitly choosing a shell executable still executes user-authorized code. Build output is asynchronous and capped at 5 MiB. Cancellation sends SIGTERM to the process group, then SIGKILL. App shutdown waits for escalation, including SIGTERM-resistant processes. Child code runs with the user's OS permissions; this is not a code-execution sandbox.

## Session lifecycle

`saveSession({data})` serializes writes to a private app-data session file, fsyncs then renames atomically. Data is capped at 25 MiB. The main process adds its own capabilities; the renderer cannot manufacture grant records through session data. `loadSession()` restores previously approved roots whose canonical paths still match.

On close, main sends `app-close-request`; the renderer must await `saveSession` and call `closeReady()`. If the renderer does not acknowledge, main asks whether to keep editing or quit without session confirmation. Quit then waits for build cleanup. Abrupt power loss/crash can still lose changes not yet submitted to the backend.

## Validation

`npm run test:desktop` covers real temporary files and processes: authorization/symlink escape, UTF-8/UTF-16 BOM and CRLF round trips, backup fidelity, stale and absent revision rejection, exclusive creation/rename, Unicode search offsets, preview precheck conflicts, regex captures/zero-width progress/timeout, replacement undo conflict, session restoration and concurrent-write ordering, build approval/output/cancel, and SIGTERM-resistant shutdown. Native window/dialog validation is a separate integration step.

Design references: [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security), [context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation), [sandboxed preload behavior](https://www.electronjs.org/docs/latest/tutorial/sandbox), and [Electron Packager](https://electron.github.io/packager/main/).

For isolated visible QA, launch with `EASY_TEXT_USER_DATA=/absolute/temporary/path`; it preserves normal window behavior while redirecting application session/backups. `ET_SMOKE_DATA=/absolute/temporary/path` additionally hides the window, writes `smoke-result.json` after loading, and quits automatically. Neither mode grants access to any project automatically. These variables are launch-time test/development controls, not renderer capabilities.

Verified on this host: the packaged executable is Mach-O ARM64, and an actual packaged Electron launch produced `desktop-tests/smoke-data/smoke-result.json` with `arch:"arm64"`, `electron:"45.0.0"`, `bridge:"function"`, renderer `node:"undefined"`, and the desktop editor DOM. The packaged `electron.icns` SHA-256 matches `desktop/assets/easy-text.icns`; its generic resource filename does not mean the Electron logo was retained. The optional `.icon` format warning from Packager does not prevent the supplied `.icns` from being installed.

The primary agent subsequently reported passing native UI checks in an isolated QA session: folder-open dialog; three-cursor editing with undo/redo and original-path save; byte-for-byte UTF-16LE BOM/CRLF save; external-change rejection followed by Save As and a later save; project replacement preview/apply/undo; actual build stdout and exit code 0; Cmd-Q session flush retaining an unsaved Chinese draft, with no hanging process. These checks were performed by the primary agent rather than inferred from the backend unit tests. Final packaging follows the last renderer fixes.

The primary agent's second native UI pass also confirmed restored session/pane state, format-only dirty tracking and persistence, suppression of self-generated external-change warnings, and clicking a build diagnostic to navigate to its source location. The application was quit before the final package refresh. Installation into the user's Applications directory is handled separately by the primary agent; this subagent does not replace an installed application.
