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

# Version 0.3: Python plugin compatibility host

This is a working, independently implemented **Sublime Text 3 API subset**, not a claim that all Sublime plugins are compatible. No Sublime application source or Default package is included in the application. The optional regression test reads three files from an existing local Sublime installation only during testing, creates a temporary test archive, and removes it afterward. CI skips that test when Sublime is absent.

## Runtime and trust

The main process launches a real Python subprocess running `desktop/python_host/host.py`. Python **3.9+** is required; no Python interpreter is bundled or downloaded automatically. `EASY_TEXT_PYTHON=/absolute/path/to/python3` selects an interpreter at launch. Otherwise the manager probes the executable paths `/opt/homebrew/bin/python3`, `/usr/local/bin/python3`, and `/usr/bin/python3`, then uses `python3` from PATH. The plugin manager exposes its selected interpreter and reports startup errors. The primary agent additionally verified the plugin regressions with this Mac's `/usr/bin/python3` **3.9.6** and Homebrew Python **3.14**.

Selecting a Packages directory, `.sublime-package`, or `.py` file opens a native trust dialog explaining that Python plugins may read/write files, use the network and launch processes with the user's account permissions. This subprocess is **not a security sandbox**. The app never searches for or auto-loads the user's existing Sublime Packages directory. Installation and enabling are explicit actions. A fresh app launch lists the saved sources but does not execute them until the user starts/enables the host. Archive and single-file installs create managed copies; external directory sources remain in place. Removing a source deletes only its managed copy or registration, never the original chosen directory/file.

The packager places the Python host in `app.asar.unpacked/desktop/python_host`, because an external Python interpreter cannot read Electron's ASAR virtual filesystem. Only independent host sources are included; `__pycache__` is excluded from staging.

## Real execution and transaction protocol

The host loads user modules, registers `TextCommand`, `WindowCommand`, `ApplicationCommand`, `EventListener`, and basic `ViewEventListener` classes, and invokes their actual Python methods. ZIP packages support root Python modules, relative helper imports and mapped package resources. Single-file installs load only the selected entry script. `plugin_loaded`/`plugin_unloaded` hooks on loaded root modules run at startup/shutdown. Unsupported module imports and APIs produce visible tracebacks rather than pretending success.

The renderer submits a snapshot containing active view, text, opaque document version, selections, filename and settings. Bridge positions are JavaScript UTF-16 offsets; the Python API uses Unicode code points. Every edit updates Python selection objects immediately, including reverse regions and later selections shifted by a length-changing replacement. Edit tokens are view-bound and expire after each TextCommand.

A successful command returns final document text/selections and one minimal enclosing original-to-final change per document, with its expected version. The frontend validates the entire result and current versions before applying a single CodeMirror transaction per changed document. Thus a multi-edit command is one editor undo step. A TextCommand exception, or any event-listener exception after an earlier edit, rejects the document/effects result as a whole. This rollback concerns editor state only: arbitrary filesystem/network side effects performed directly by trusted Python code cannot be rolled back.

`on_new`, `on_load`, `on_activated`, `on_deactivated`, `on_modified`, `on_selection_modified`, `on_pre_save`, `on_post_save`, `on_close`, and `on_init` are admitted event names. The renderer controls delivery and suppresses recursive plugin-result event loops. Deferred zero-delay callbacks are drained with a bounded callback count; delayed and threaded callbacks explicitly raise an unsupported-API error.

## Implemented core and limits

- Region: bounds, direction, sorting, coverage/intersection, containment. Selection: add/merge/clear/subtract and mutation-aware iteration.
- View: text size/substrings, selection, insert/erase/replace, line/word/row/column conversions, UTF-16 conversion, read-only and dirty state, settings, document identity, basic visibility/status effects, nested implemented commands.
- Window: current/open snapshot views, folders, focus, settings, variables, registered window commands, and finding/focusing an already-open file.
- Application commands, clipboard/status effects, plugin settings persistence, mapped text/binary resources, basic variable expansion.
- Command enablement respects no-argument `is_enabled` methods, and TextCommand `event` arguments are removed unless `want_event()` opts in.

This is not the native `sublime_api` ABI. Unsupported APIs explicitly reject, including syntax scopes/selector engine, decorations/phantoms, arbitrary native panel callbacks, opening files outside the supplied editor snapshot, threaded callbacks, native extension compatibility and unimplemented built-in command names. Root package `__init__.py` is not currently treated as a plugin entry point. Settings/resource JSON currently uses strict JSON; Sublime-style comments and trailing commas are not accepted. `sublime.version()` returns the **emulated API baseline** `3211`, not an assertion that the program is Sublime Text.

Lifecycle changes (install/start/stop/enable/remove) share a serial management queue. Every process callback checks child identity; stale stdout/errors cannot kill a newer host. A request timeout stops the owning process group. Response/snapshot/output limits prevent unlimited protocol buffering; they do not constitute a Python memory or filesystem sandbox. On app quit, the main process waits for plugin-host termination along with build cleanup.

## Validation at this revision

`npm run test:desktop`: **24 passed** on this Mac (15 editor/backend regressions plus 9 plugin tests). Plugin tests execute actual Python processes and cover Unicode/emoji/reverse multi-selections, failing/unsupported commands, fresh snapshots, Window/Application commands, events, persisted settings across restart, single-file isolation, enable/disable/remove, ZIP relative imports/resources, timeout termination, concurrent lifecycle requests, stale-child callbacks, event transaction rejection, and unchanged local Default `transform.py`, `goto_line.py`, and `copy_path.py` behavior. Missing local Sublime causes only the last optional test to skip; missing Python 3.9+ skips plugin tests with the corresponding test conditions.

The independent reviewer's broader unchanged-Default checks are recorded outside the application in the parent repository's research evidence. They establish those tested flows, not compatibility with every third-party package. API behavior was cross-checked against local Build 3211 wrappers and the [official API reference](https://www.sublimetext.com/docs/api_reference.html), while keeping newer-version documentation features outside the claimed subset.

Settings scope is explicit: `load_settings(name)`/`save_settings(name)` persist arbitrary JSON-compatible plugin configuration inside the host's own settings directory, without sending an editor-formatting effect. `View.settings()`/`Window.settings()` effects are restricted by the renderer to its implemented visual settings (`tab_size`, `word_wrap`, `font_size`, `translate_tabs_to_spaces`) and supported values; other editor-setting effects fail visibly. Saving plugin-owned configuration therefore does not accidentally attempt to configure the editor.

Final installed macOS ARM64 0.3.0 acceptance: the native Tools menu opened plugin management; an unchanged local Default transform.py was installed and registered. Running upper_case changed `😀 straße groß` to `😀 STRASSE GROSS`; one Undo restored the original text and clean file state. Restart preserved plugin registration but required explicit host start. This GUI check was repeated against the final packaged sources using isolated QA application data.

# Version 0.3.1: built-in Simplified Chinese locale

The only released, complete UI locale is `zh-CN`. Its default applies to existing sessions that have no language setting. `system` is a preference, not a second language pack: unsupported system languages resolve to `zh-CN`. The shared `src/locales/zh-CN.json` catalog supplies renderer strings, CodeMirror phrases, every native menu label/role, application-owned native dialog text, and localized error explanations. `en.json` is an internal source/fallback catalog, not an advertised English UI option.

`getLocaleInfo()` returns the effective locale, preference, preferred system language and actual supported-locale list. `setLocale({locale:'zh-CN'|'system'})` serializes and atomically replaces app-data `locale.json`, rebuilds the native menu, and sends `locale-changed` to the renderer. Other requested values are rejected. System language uses Electron's preferred-system-languages API, rather than confusing regional date/number formatting with UI language.

Native menus explicitly label all roles, including About/Hide/Quit, Cut/Copy/Paste/Select All, Full Screen, and Window/Minimize/Zoom/Bring All to Front. Preferences contains the shared language command. Open/save/plugin selectors receive translated titles, explanatory text, confirmation labels and filter names. The close-session warning and replacement/undo/Git/build/plugin-trust confirmations are localized, preserving literal command arguments and filesystem paths. Build/plugin compiler output and tracebacks are not translated. Common backend errors retain their technical codes and original diagnostics beneath a Chinese explanation.

The package staging script copies `src/locales` into the application alongside desktop sources. Bundle development/localization metadata declares Simplified Chinese, and Chromium starts with `zh-CN`. macOS-owned filesystem chooser controls remain native OS components; app-provided labels are explicitly set.

Validation: six locale regressions plus the existing 24 backend/plugin tests passed (**30 desktop tests**). Tests cover defaults/obsolete preferences, persistence/write ordering, every menu-key/role translation, unchanged command IDs and shortcuts, error-code/raw-trace preservation, actual replacement/build confirmation arguments, and declined plugin trust without Python execution. An isolated, real development Electron launch reported `engineLocale: zh-CN`, `locale: zh-CN`, all translated top-level native menu groups and explicit translated roles; the compact development evidence is retained outside the source repository. The final installed ARM64 0.3.1 application was also checked through its native UI: Chinese sidebar/status/native menus, translated Find/Replace controls with a real search, Chinese file-open dialog, and saving the system-language preference followed by quit/restart and confirmation that the selection persisted.
