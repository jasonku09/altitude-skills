#!/usr/bin/env node

// Cursor CLI 2026.09.18 checks user/project hook presence before dispatching
// several native plugin events. These owned, inert entries open that dispatcher;
// the versioned plugin remains the ONLY actual adapter. /connect registers its
// exact source root because Cursor can mix plugin-root environment variables.
import { closeSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const events = ["beforeSubmitPrompt", "afterAgentResponse", "stop"];
function ownedEntry(event) {
  const output = event === "beforeSubmitPrompt" ? '{\\"continue\\":true}' : '{}';
  return {
    command: `node -e "/* altitude-cursor-compat-v1:${event} */ process.stdout.write('${output}\\n')"`,
    timeout: 5,
    failClosed: false,
    ...(event === "stop" ? { loop_limit: 1 } : {}),
  };
}
function readOptional(path) {
  try { return readFileSync(path, "utf8"); } catch (error) { if (error.code === "ENOENT") return undefined; throw error; }
}
function parseConfig(raw) {
  const value = raw === undefined ? { version: 1, hooks: {} } : JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1 || !value.hooks || typeof value.hooks !== "object" || Array.isArray(value.hooks) || !Object.values(value.hooks).every(Array.isArray)) {
    throw new Error("Cursor hooks.json has an unsupported format; it was left unchanged.");
  }
  return value;
}

export function configure(action, home = homedir(), pluginRoot = resolve(dirname(realpathSync(fileURLToPath(import.meta.url))), "..")) {
  if (!["install", "uninstall"].includes(action)) throw new Error("usage: node altitude-cursor-setup.mjs <install|uninstall>");
  if (!isAbsolute(pluginRoot)) throw new Error("Plugin source root must be absolute.");
  pluginRoot = resolve(pluginRoot);
  const directory = join(home, ".cursor");
  const path = join(directory, "hooks.json");
  const registrationDirectory = join(directory, "altitude");
  const registrationPath = join(registrationDirectory, "plugin.json");
  const pathStat = lstatSync(path, { throwIfNoEntry: false });
  if (action === "uninstall" && !pathStat && !lstatSync(registrationDirectory, { throwIfNoEntry: false })) return { changed: false, path };
  mkdirSync(directory, { recursive: true });
  // Never replace a symlink: its target may belong to a config manager.
  if (pathStat && !pathStat.isFile()) throw new Error("Cursor hooks.json is not a regular file; it was left unchanged.");
  const lock = join(directory, ".altitude-hooks.lock");
  const lockFd = openSync(lock, "wx", 0o600);
  let temporary;
  let registrationTemporary;
  try {
    const registrationDirectoryStat = lstatSync(registrationDirectory, { throwIfNoEntry: false });
    if (registrationDirectoryStat && !registrationDirectoryStat.isDirectory()) throw new Error("Altitude registration directory is not a regular directory; it was left unchanged.");
    const registrationStat = lstatSync(registrationPath, { throwIfNoEntry: false });
    if (registrationStat && !registrationStat.isFile()) throw new Error("Altitude registration is not a regular file; it was left unchanged.");
    const registrationOriginal = readOptional(registrationPath);
    let registered;
    if (registrationOriginal !== undefined) {
      registered = JSON.parse(registrationOriginal);
      if (registered?.version !== 1 || registered?.owner !== "altitude-cursor" || typeof registered.pluginRoot !== "string" || !isAbsolute(registered.pluginRoot)) throw new Error("Altitude registration has an unsupported format; it was left unchanged.");
    }
    // An old plugin cannot uninstall a newer active registration or its guards.
    if (action === "uninstall" && registered && registered.pluginRoot !== pluginRoot) return { changed: false, path };
    const original = readOptional(path);
    const config = parseConfig(original);
    let changed = false;
    for (const event of events) {
      const owned = ownedEntry(event);
      const existing = config.hooks[event] ?? [];
      const kept = existing.filter((entry) => entry?.command !== owned.command);
      if (action === "install") {
        if (existing.length - kept.length === 1) continue;
        config.hooks[event] = [...kept, owned];
        changed = true;
      } else if (kept.length !== existing.length) {
        if (kept.length) config.hooks[event] = kept;
        else delete config.hooks[event];
        changed = true;
      }
    }
    const registrationChanged = action === "install" ? registered?.pluginRoot !== pluginRoot : registered !== undefined;
    if (!changed && !registrationChanged) return { changed: false, path };
    if (changed) {
      temporary = join(directory, `.altitude-hooks-${randomUUID()}.tmp`);
      const mode = pathStat ? pathStat.mode & 0o777 : 0o600;
      writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx", mode });
    }
    if (registrationChanged && action === "install") {
      mkdirSync(registrationDirectory, { recursive: true });
      registrationTemporary = join(registrationDirectory, `.plugin-${randomUUID()}.tmp`);
      writeFileSync(registrationTemporary, `${JSON.stringify({ version: 1, owner: "altitude-cursor", pluginRoot }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    }
    if (readOptional(path) !== original || readOptional(registrationPath) !== registrationOriginal) throw new Error("Cursor configuration changed during setup; retry after the other edit finishes.");
    if (temporary) { renameSync(temporary, path); temporary = undefined; }
    if (registrationTemporary) { renameSync(registrationTemporary, registrationPath); registrationTemporary = undefined; }
    else if (registrationChanged && action === "uninstall") unlinkSync(registrationPath);
    return { changed: true, path };
  } finally {
    if (temporary) unlinkSync(temporary);
    if (registrationTemporary) unlinkSync(registrationTemporary);
    closeSync(lockFd);
    unlinkSync(lock);
  }
}

function isEntrypoint() {
  try { return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
}
if (isEntrypoint()) {
  try {
    const action = process.argv[2];
    const result = configure(action);
    process.stdout.write(result.changed ? `Altitude Cursor compatibility hooks ${action === "install" ? "installed" : "removed"}. Start a new Cursor session.\n` : "Altitude Cursor compatibility hooks are already up to date.\n");
  } catch (error) {
    process.stderr.write(`Altitude Cursor setup: ${error instanceof Error ? error.message : "unexpected failure"}\n`);
    process.exitCode = 1;
  }
}
