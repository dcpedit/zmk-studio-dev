# ZMK Studio DcpEdit

An **unofficial fork** of [ZMK Studio](https://github.com/zmkfirmware/zmk-studio), the
graphical keymap editor for [ZMK Firmware](https://zmk.dev). It tracks upstream and adds
features that have not landed there.

This project is not affiliated with or endorsed by the ZMK Firmware maintainers. Please
report issues with these additions here, not to the upstream project.

## What's different from upstream

- **Keymap import and export.** Export your current keymap as a `.keymap` file, or import
  one from disk. Imports show a review dialog of what will change, apply with progress,
  and can be undone in one step. The desktop app uses native open/save dialogs. Built on
  [zmk-studio#171](https://github.com/zmkfirmware/zmk-studio/pull/171) by
  [@max-hill-4](https://github.com/max-hill-4).
- **Grid-based key picker.** Choose HID usages from a grid of buttons instead of a text
  input, with the Basic category split into Letters, Numbers + Punctuation, and
  Function + Navigation, plus an International category. From
  [zmk-studio#159](https://github.com/zmkfirmware/zmk-studio/pull/159) by
  [@awkannan](https://github.com/awkannan).
- **Richer key legends.** Every binding is labelled from its behavior metadata, including
  layer-tap, mod-tap and transparent keys, and shifted keycaps show their shifted legend.
  Builds on [zmk-studio#135](https://github.com/zmkfirmware/zmk-studio/pull/135) by
  [@BafS](https://github.com/BafS).
- **Themes.** Selectable UI themes, keycap colorways and media-key icons.
- **Better desktop window.** A larger default window that remembers its size and position.

### Screenshots

The Laser and Olivia themes, each with matching keycap colorways:

| Laser | Olivia |
| --- | --- |
| ![Laser theme](docs/screenshots/theme-laser.png) | ![Olivia theme](docs/screenshots/theme-olivia.png) |

## Use it

### In the browser (no download)

Open **<https://dcpedit.github.io/zmk-studio-dev/>** in Chrome or Edge. The web version
connects to your keyboard over Web Serial, or Web Bluetooth on Linux. Firefox and Safari
do not support these APIs.

### Desktop app

Download the latest build for your platform from the
[Releases page](https://github.com/dcpedit/zmk-studio-dev/releases).

The binaries are **not code-signed**, so each OS will warn you once:

- **macOS:** open the DMG and drag the app to Applications. The first launch shows
  "Apple could not verify…". Go to *System Settings → Privacy & Security*, scroll down and
  click **Open Anyway**. Alternatively run this once in Terminal:

  ```bash
  xattr -cr "/Applications/ZMK Studio DcpEdit.app"
  ```

- **Windows:** SmartScreen will say the publisher is unknown. Click **More info**, then
  **Run anyway**.
- **Linux:** `chmod +x` the AppImage and run it, or install the `.deb`.

The app installs as "ZMK Studio DcpEdit" with its own bundle identifier, so it can live
alongside the official ZMK Studio without overwriting it.

Your keyboard needs firmware built with
[ZMK Studio support](https://zmk.dev/docs/features/studio) enabled, exactly as for the
official app.

## Build from source

Requirements: Node.js (LTS), and for the desktop app a
[Tauri 2 toolchain](https://v2.tauri.app/start/prerequisites/) (Rust stable plus the
platform dependencies).

```bash
npm ci
npm run dev          # web app at http://localhost:5173
npm run tauri dev    # desktop app
npm run tauri build  # desktop bundles in src-tauri/target/
```

## Releasing

1. Bump `version` in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`,
   run `cargo check` in `src-tauri` to refresh `Cargo.lock`, and commit.
2. Tag and push: `git tag vX.Y.Z && git push origin dev vX.Y.Z`.
3. The `tauri-build` workflow creates a **draft** release from
   [.github/release-notes.md](.github/release-notes.md), builds macOS (universal), Windows,
   Linux x64 and Linux arm64, and attaches the bundles. Review the draft, then publish it.
4. Re-run the `github-pages` workflow (Actions → github-pages → Run workflow) so the
   download page picks up the new release links.

If the workflow fails at "ensure draft release exists" with a permissions error, create the
draft yourself and re-run the failed jobs:

```bash
gh release create vX.Y.Z --draft --title "ZMK Studio DcpEdit vX.Y.Z" --notes-file .github/release-notes.md
```

Pushes to `dev` deploy the web app to GitHub Pages automatically.

Keep the version numeric (`X.Y.Z`); the Windows installer does not accept
pre-release suffixes.

## Credits

Several features started as open pull requests against upstream ZMK Studio that had not
been reviewed. They are included here with their original commits and authorship intact:

| Feature | Upstream PR | Author |
| --- | --- | --- |
| Keymap import and export | [zmk-studio#171](https://github.com/zmkfirmware/zmk-studio/pull/171) | [@max-hill-4](https://github.com/max-hill-4) |
| Grid key picker and category split | [zmk-studio#159](https://github.com/zmkfirmware/zmk-studio/pull/159) | [@awkannan](https://github.com/awkannan) |
| Layer-tap and mod-tap indicators on keys | [zmk-studio#135](https://github.com/zmkfirmware/zmk-studio/pull/135) | [@BafS](https://github.com/BafS) |

The `.keymap` parser, exporter and import review flow, the behavior-metadata key labels,
themes and the remaining changes were written for this fork. Thanks to the ZMK
contributors for ZMK Studio itself.

## License

Apache 2.0, the same as upstream. See [LICENSE](LICENSE) and [NOTICE](NOTICE). ZMK is a
trademark of the ZMK Firmware project; this fork uses the name only to describe what it is
a fork of.
