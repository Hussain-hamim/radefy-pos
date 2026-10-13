# Building and signing

Install Node.js 22+, Rust stable and the target platform's Tauri prerequisites. `npm ci` and Cargo use the committed lockfiles. Allow several GB of free disk space for Rust and platform build artifacts. Development debug information and incremental compilation are disabled here to reduce disk usage; change the Cargo profile locally when source-level debugging is needed.

Run frontend and Rust tests before packaging. Native desktop and demo browser share the business service, but only native builds can open a real store. The `preview` Cargo feature gates the demonstration HTTP binary so it is excluded from production bundles.

macOS:

```sh
npm ci
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm test
npm run test:rust
npx tauri build --target universal-apple-darwin --bundles app,dmg
```

The universal binary includes both CPU architectures. Apple Silicon smoke tests do not verify Intel hardware. Minimum configured macOS version is 12.0. If DMG automation is unavailable, the `.app` bundle remains a runnable local artifact.

Windows (native x64 build host):

```powershell
npm ci
npm test
npm run test:rust
npx tauri build --target x86_64-pc-windows-msvc --bundles nsis
```

`bundle.windows.webviewInstallMode.type = "offlineInstaller"` embeds WebView2 for disconnected installation. The package build downloads the redistributable; the target machine should not need that download. Validate the actual installer on a clean, disconnected Windows VM. See [Tauri Windows packaging](https://v2.tauri.app/distribute/windows-installer/).

The repository includes `.github/workflows/build.yml` with native Windows and macOS runners, manual/tag triggers and artifact uploads. The workflow can be dispatched with platform `windows`, `macos` or `all`. Windows uploads a setup EXE, SHA-256 checksum, build manifest, payload listing and native installation/launch evidence. Actions artifacts are retained for 30 days; save the downloaded installer for longer retention. Actual run evidence is recorded in `verification.md`.

## Signing and notarization

Current artifacts are unsigned/not notarized. Do not advertise them as signed releases. macOS linker ad-hoc signatures, if present, are not a Developer ID distribution signature.

For macOS distribution, the release owner must provide an Apple Developer ID Application certificate and notarization credentials through a secure environment or CI secrets. Configure `APPLE_SIGNING_IDENTITY`; for CI certificate import use `APPLE_CERTIFICATE` and `APPLE_CERTIFICATE_PASSWORD`. Use the Apple API-key credentials supported by the installed Tauri version or Apple ID/app-specific-password/team credentials for notarization. Never commit keys, certificates, passwords or provisioning files. Verify with `codesign --verify --deep --strict` and `spctl --assess`, and confirm a stapled notarization ticket before labeling a release notarized. Follow [Tauri macOS signing](https://v2.tauri.app/distribute/sign/macos/).

For Windows, obtain a trusted code-signing certificate/provider, configure Tauri's supported signing command or certificate settings, and sign/timestamp the executable and installer. Verify the Authenticode signature on Windows before publishing. Follow [Tauri Windows signing](https://v2.tauri.app/distribute/sign/windows/).

No auto-updater is configured. Before replacing an installed version, create a manual backup. Migration code makes an additional recovery backup when updating an existing schema.

## Reproducible local macOS DMG

The local Tauri DMG step underestimated image capacity. `scripts/package-macos.sh` builds the universal app, stages it with an Applications shortcut, creates an explicit 128 MiB compressed disk image, verifies the image, and writes a SHA-256 manifest under `artifacts/`. Run it with Rust on PATH. `--skip-build` packages an already-built bundle; only use that option immediately after a successful build of the intended source.

Compilation requires several GiB of free space for caches and temporary objects. The build here needed removal of this project's obsolete generated caches; source and databases were preserved.
