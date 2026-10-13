# Backup and recovery

## Store locations

The desktop uses Tauri's application-data directory for `com.radefy.pos`:

- macOS: `~/Library/Application Support/com.radefy.pos/`
- Windows: `%APPDATA%\com.radefy.pos\`

`store.sqlite` is the real store; `demo.sqlite` is the separate demonstration store. The development browser uses `.radefy-demo/demo.sqlite` under the repository. WAL/SHM and lock files may exist alongside the databases. Do not copy a database file while it is active; use the application's backup command.

## Routine backup

Settings → **Create backup** opens a save dialog in the desktop application. Choose a new `.sqlite` filename, preferably on a removable or separately backed-up drive. The operation uses SQLite's online backup API, includes product images and store branding, and does not depend on internet connectivity. The app refuses to overwrite an existing file. Browser demo backups stay inside `.radefy-demo/backups` and are for development only.

While the desktop is open, a timer checks once per minute and creates the first backup of each Kabul business day. The last 14 daily files per store mode are retained under `backups/`. Manual, pre-upgrade and pre-restore backups are not part of that rotation. Settings shows the last automatic/manual backup and any automatic backup failure after refreshing. A closed app does not create scheduled backups. A daily backup may precede later sales that day: make a manual end-of-day backup when those sales must be protected.

Test restoration periodically using a spare machine or a protected test installation. A backup is not a substitute for keeping the physical device healthy or securing removable media. Backup files contain business records and password hashes and are not encrypted by this application.

## Restore

1. Save any work and make a manual backup of the current store.
2. Open the intended store mode, sign in with settings permission, and choose Settings → **Restore backup**.
3. Select a Radefy `.sqlite` backup and review the replacement warning.
4. The backend validates SQLite integrity, schema version, foreign keys and the presence of an active owner before changing live data. It saves a `before-restore-<id>.sqlite` recovery copy, then restores with SQLite's backup API.
5. Sign in using credentials from the restored store. Verify recent sales, stock, customer/supplier balances and the cash register.

Corrupt or incompatible backups are rejected without replacing the current store. Only current-schema backups can be restored directly in this version. Open an older store with its compatible app and migrate it before making a new backup. Preserve the original file until the migrated copy is verified.

## When the app cannot open the store

Quit all Radefy instances before touching files. Preserve the entire app-data directory (including WAL/SHM files) for diagnosis. Do not delete lock files or WAL files while an instance is running. If a filesystem or disk-full error occurred, first provide sufficient free space. Never edit totals manually with an SQL tool to “fix” balances.

For recovery from a damaged live file: with the app closed, move the entire existing data directory to a dated recovery folder, recreate the original directory, and copy a known-good complete backup to `store.sqlite` (or `demo.sqlite` for demo mode). Keep the recovery folder untouched. Reopen, sign in, run Settings → Integrity check and reconcile recent activity against receipts. If no validated backup exists, obtain SQLite recovery assistance rather than overwriting the original files.
