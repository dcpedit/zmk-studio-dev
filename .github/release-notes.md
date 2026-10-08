Unofficial build of ZMK Studio from https://github.com/dcpedit/zmk-studio-dev.

These binaries are **not code-signed**. First launch:

- **macOS**: the DMG mounts normally, but opening the app shows "Apple could not verify…". Open *System Settings → Privacy & Security*, scroll down and click **Open Anyway**. Or run `xattr -cr "/Applications/ZMK Studio DcpEdit.app"` once in Terminal.
- **Windows**: SmartScreen will warn. Click **More info → Run anyway**.
- **Linux**: `chmod +x` the AppImage, or install the `.deb`.

See the README for details and for the browser version, which needs no download.
