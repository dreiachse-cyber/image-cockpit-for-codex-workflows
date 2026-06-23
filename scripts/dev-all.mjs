import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [
  spawn(npmCommand, ["run", "dev:server"], { stdio: "inherit", shell: false }),
  spawn(npmCommand, ["run", "dev"], { stdio: "inherit", shell: false })
];

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    shutdown(signal ?? "SIGTERM");
    process.exitCode = code ?? 1;
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
