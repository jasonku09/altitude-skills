// Locates the Altitude workshop CLI for the hook shims, so each one can spawn
// it with shell:false. Shared by the Codex, Cursor and Copilot adapters.
import { existsSync, readFileSync, statSync } from "node:fs";
import { delimiter, isAbsolute, join, relative, resolve, sep } from "node:path";

// npm's Windows entry point is a .cmd wrapper. Executing it with shell:true
// would interpret path/argument metacharacters. Resolve its installed package
// and launch the JavaScript bin with this Node process instead. Never eval .cmd.
export function resolveCli({ platform = process.platform, path = process.env.PATH ?? "", separator = delimiter, cliPath = process.env.ALTITUDE_CLI_PATH } = {}) {
  if (cliPath) {
    if (!isAbsolute(cliPath) || !existsSync(cliPath) || !statSync(cliPath).isFile()) throw new Error("ALTITUDE_CLI_PATH must name an existing absolute JavaScript entry point.");
    return { file: process.execPath, args: [cliPath] };
  }
  if (platform !== "win32") return { file: "altitude", args: [] };
  for (const directory of path.split(separator).filter(Boolean)) {
    const native = join(directory, "altitude.exe");
    if (existsSync(native)) return { file: native, args: [] };
    if (!existsSync(join(directory, "altitude.cmd"))) continue;
    const packageRoot = join(directory, "node_modules/@learnaltitude/cli");
    try {
      const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
      const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.altitude;
      if (pkg.name !== "@learnaltitude/cli" || typeof bin !== "string") continue;
      const entry = resolve(packageRoot, bin);
      if (relative(packageRoot, entry).startsWith(`..${sep}`) || !existsSync(entry)) continue;
      return { file: process.execPath, args: [entry] };
    } catch { /* A broken install is a fail-open diagnostic, never a shell fallback. */ }
  }
  throw new Error("Altitude CLI was not found; install it with npm install -g @learnaltitude/cli.");
}
