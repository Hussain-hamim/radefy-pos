# Windows offline setup

## Get the installer

The source repository is private: [Hussain-hamim/radefy-pos](https://github.com/Hussain-hamim/radefy-pos). Sign into an account with access to download its build artifacts.

1. Open **Actions → Build offline desktop installers**.
2. Choose **Run workflow**, branch `main`, platform `windows`.
3. Wait for **Windows x64 offline setup** to finish successfully.
4. Download the **radefy-windows-x64-offline-setup** artifact and extract it. Actions retains this artifact for 30 days, so keep your own installer copy.
5. Check `build-manifest.json` for the source commit, filename and SHA-256 digest. `installer-contents.txt` records the embedded WebView2 payload. `windows-smoke.txt` records which native checks ran.

The artifact contains a Windows x64 `-setup.exe` with the **WebView2 offline runtime installer bundled inside**. It is not a small bootstrapper that must fetch WebView2 during installation. Building the package requires internet access on GitHub's runner; using the resulting installer does not require an application-server connection.

## Install in the store

Copy the setup EXE to the store computer, for example using a USB drive, and run it. Follow the installer and Windows permission dialogs. WebView2 is installed when required; an existing compatible runtime may be reused. Start **Radefy POS**, then choose **Open demo store** or **Set up my store**.

Demo credentials are `owner` / `demo12345`. Use a unique owner password for the real store. The real database starts empty and never copies demonstration transactions.

The generated build is **unsigned**. No trusted Windows signing certificate was provided. This guide does not ask you to bypass Windows security warnings; trusted signing should be configured before broad distribution.

## Verify a download

PowerShell:

```powershell
Get-FileHash '.\Radefy POS_0.1.0_x64-setup.exe' -Algorithm SHA256
```

Compare the complete hash with `SHA256SUMS` from the same artifact. The exact generated filename is recorded in the manifest.

## Offline acceptance and hardware

The workflow checks the offline-install configuration, examines the setup archive for WebView2, runs the SQLite/frontend tests, silently installs the app, and verifies a running native window. A hosted runner may already have WebView2. This does **not** replace a clean-machine test with networking disabled and no preinstalled runtime.

Before deploying in a real store, test the installer on that disconnected Windows machine, then verify product registration, scanning, checkout, receipt reprint and restart. Test the actual barcode scanner and 58/80 mm printer driver, including Dari output. Those devices cannot be certified by the package build alone.

Back up before upgrades and follow [backup and recovery](backup-recovery.md). Keep backups on another storage device as well as the local disk.
