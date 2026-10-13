import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
const env = {
  ...process.env,
  PATH:
    path.join(os.homedir(), ".cargo", "bin") +
    path.delimiter +
    process.env.PATH,
};
const backend = spawn(
  "cargo",
  [
    "run",
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--no-default-features",
    "--features",
    "preview",
    "--bin",
    "radefy-preview",
  ],
  { stdio: "inherit", env },
);
const vite = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", ...process.argv.slice(2)],
  { stdio: "inherit", env },
);
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  backend.kill();
  vite.kill();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
backend.on("exit", stop);
vite.on("exit", stop);
