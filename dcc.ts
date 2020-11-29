import { assert, path, fs, log, flags } from "./deps.ts";

/*
General design idea (hacking strategy):

Clone the whole deno repo, insert the bundled file into cli/rt/AA_dcc.js.

window.dccMain is automatically triggered on window `load` event through hacks around `bootstrapMainRuntime`.
For example:

window.dccMain = () => {
  console.log("Hello world!");
};

You can also inject other functions to `window`, but be aware: only functions attached to the global object will be accessible later.

function myHelloFunc() {
  console.log(">>> Hello");
}
window.myHelloFunc;

We will also inject `let window = globalThis;` at the beginning of the output bundle to avoid missing window reference.

To run the output build, use the command

dcc_output eval ""

Limitations:
1. Input file MUST NOT INCLUDE global Deno namespace/window usages: they are not defined yet.
2. Deno.args is not well supported in `deno eval` mode.
 */

const BUNDLE_PREAMBLE = `const __origBootstrapMainRuntime = globalThis.bootstrap.mainRuntime;
function __wrappedBootstrapMainRuntime() {
  __origBootstrapMainRuntime();
  globalThis.addEventListener("load", () => {
    if (typeof window.dccMain === "function") {
      window.dccMain();
    }
  });
}
globalThis.bootstrap.mainRuntime = __wrappedBootstrapMainRuntime;
const window = globalThis;
`;

async function checkCommandExists(cmd: string): Promise<boolean> {
  if (Deno.build.os === "windows") {
    throw new Error("Windows is not yet supported");
  }
  const p = Deno.run({
    cmd: ["which", cmd],
    stdout: "null",
    stderr: "null",
  });
  const status = await p.status();
  return status.code === 0;
}

async function assertCommandExists(cmd: string): Promise<void> {
  assert(await checkCommandExists(cmd), `Command '${cmd}' is not available. Have you installed it?`);
}

function getCacheDirPath(): string {
  const homeDir = Deno.env.get("HOME");
  assert(!!homeDir, "$HOME is not defined, cannot create cache directory for dcc");
  return path.join(homeDir, ".dcc_cache");
}

function getCompileOutputPath(denoRepoDir: string): string {
  return path.join(denoRepoDir, "target", "release", "deno");
}

async function enterDir(newDir: string, cb: () => any): Promise<void> {
  const oldDir = Deno.cwd();
  Deno.chdir(newDir);
  await cb();
  Deno.chdir(oldDir);
}

async function runAndCheckStatus(cmd: string[], msg: string, piped = false): Promise<void> {
  const p = Deno.run({
    cmd,
    stdout: piped ? "piped" : "inherit",
    stderr: piped ? "piped" : "inherit"
  });
  const status = await p.status();
  assert(status.code === 0, msg);
}

async function prepareSourceBundle(filename: string): Promise<string> {
  log.info("[dcc] Preparing input file as a bundle");
  const bundlePath = path.join(Deno.cwd(), "$$input.js");
  // TODO: use Deno.bundle. I'm too lazy for now...
  await runAndCheckStatus([
    "deno", "bundle", filename, bundlePath
  ], "Failed to create input bundle file");

  // Fix the problem where window is not yet globally defined. Also hook to window load event.
  let bundleContent = await Deno.readTextFile(bundlePath);
  bundleContent = BUNDLE_PREAMBLE + bundleContent;
  await Deno.writeTextFile(bundlePath, bundleContent);

  return bundlePath;
}

async function main(): Promise<void> {
  if (Deno.build.os === "windows") {
    throw new Error("Windows is not yet supported. If you are familiar with Windows, please consider contributing.");
  }

  await assertCommandExists("deno");
  await assertCommandExists("git");
  await assertCommandExists("cargo");

  const f = flags.parse(Deno.args);
  assert(f._.length > 0, "Please provide an input filename");
  const sourceFile = f._[0].toString();
  assert(fs.existsSync(sourceFile), "Provided input file does not exist");
  const bundlePath = await prepareSourceBundle(sourceFile);
  const shouldUpdateRepo = !!f["r"];
  const outputBinaryFilename = f["o"] || "dcc_out";
  const outputBinaryPath = path.join(Deno.cwd(), outputBinaryFilename);
  let isFirstClone = false;

  const cacheDir = getCacheDirPath();
  await fs.ensureDir(cacheDir);
  const cachedDenoRepo = path.join(cacheDir, "deno");

  await enterDir(cacheDir, async () => {
    log.debug(`Entered ${cacheDir}`);
    if (!(await fs.exists(cachedDenoRepo))) {
      log.warning(`[dcc] Cloning and caching denoland/deno to ${cachedDenoRepo}...`);
      await runAndCheckStatus(["git", "clone", "--recurse-submodules", "https://github.com/denoland/deno.git"], "Failed to clone denoland/deno for building");
      isFirstClone = true;
    }
    await enterDir(cachedDenoRepo, async () => {
      log.debug(`Entered ${cachedDenoRepo}`);
      if (!isFirstClone && shouldUpdateRepo) {
        log.info("[dcc] Updating repository");
        await runAndCheckStatus(["git", "pull", "origin", "master"], "Cannot fetch updated repo contents");
        await runAndCheckStatus(["git", "submodule", "update"], "Cannot update submodules");
      }

      log.info("[dcc] Injecting bundle to runtime code for snapshot");
      const injectedFilePath = path.join(cachedDenoRepo, "cli", "rt", "AA_dcc.js");
      try {
        await Deno.remove(injectedFilePath);
      } catch {}
      await Deno.rename(bundlePath, injectedFilePath);
  
      log.info("[dcc] Building the binary");
      await runAndCheckStatus(["cargo", "build", "--release"], "Cannot build deno binary. Check error message above");
    });
  });

  log.info("[dcc] Copying binary to target output path");
  const compileOutputPath = getCompileOutputPath(cachedDenoRepo);
  await Deno.copyFile(compileOutputPath, outputBinaryPath);

  log.info("[dcc] Build complete!");
}

main();

export {}