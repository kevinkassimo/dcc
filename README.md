# `dcc`: a hack to create a Deno-based binary

A poor man's verison of `deno compile`: inject custom user functions into a Deno binary, and thus ship out a single binary with custom operations.

Write your code:
```ts
// example.ts
import { format } from "https://deno.land/std@0.79.0/datetime/mod.ts";

function printCwd(): void {
  console.log(`>> Current directory is ${Deno.cwd()}.`); // It is okay to call Deno.* inside a function invoked through window.dccMain
}
// @ts-ignore
window.hello = () => console.log("Hello");
// @ts-ignore
window.dccMain = () => {
  console.log("This function is snapshotted.");
  printCwd();
  console.log(`>> Current time is ${format(new Date(), "MM-dd-yyyy HH:mm:ss.SSS")}`);
};
```
Submit it to `dcc`:
```sh
$ deno run -A --unstable dcc.ts -o example example.ts
```
Get a runnable extended Deno binary, with full Deno feature, `window.dccMain()` automatically triggered on window `load` event, and other functions attached to `window` available for you.
```sh
./example eval "" # only triggers window.dccMain(). You have to do this, since the original binary is an extended Deno binary, thus having the original Deno cli flags
./example eval "hello()" # runs both window.dccMain() and window.hello();

# You can still use all the other Deno stuff.
./example run main.ts # in main.ts, you will be able to access everything you attached to `window`
```

Currently does not support Windows, but support could be added easily for those who want to.

### Use Case

There are 2 possible use cases:
1. When you want to ship a simple binary.
  + Currently there are also [other attempts](https://github.com/denoland/deno/pull/8381) to allow creating Deno-based binary. However this one is a currently usable hack and does not require you to write a single line of Rust code yourself.
2. When you want to extend Deno features easily. You will still get a Deno-like binary with all Deno features, while having extra functions defined by yourself snapshotted (lower runtime cost).

### How does it work

`dcc` secretly downloads and caches the Deno repository for you in `~/.dcc_cache`. When providing an input file defining all the user functions, `deno bundle` will be triggered. The bundled output would be injected to the Deno source code as `~/.dcc_cache/deno/cli/lib/AA_dcc.js`, which will be submitted during Deno build for snapshotting. Hooks are further introduced such that `window.dccMain`, if provided, will be always triggered on normal run attempts, such as `<output_bin> eval ""` or `<output_bin> run main.ts`, thus either serving as a main function to run, or a setup function triggered before each script run.

### Prerequisite

User are expected to have `deno`, `git`, and `cargo` (and thus automatically including `rustc`. You can install them from https://rustup.rs) installed.

Currently does not support Windows, but support could be added easily for those who want to.

### Limitations

Since we are not using the `deno` crate and thus not using the snapshot API as intended, currently there are a few main restrictions to this approach:

1. The file MUST NOT use any `Deno` or `window` namespace properties in the top level of the module.
```ts
function myFunc() {
  console.log(Deno.cwd(), window.setTimeout); // Okay, inside a function that is not immediately invoked.
}

console.log(Deno.cwd()) // No! This will cause a compile-time crash
```
2. The functions are not directly reference-able. For functions you want to expose, expose them through `globalThis` (or `window`, which is discouraged for use.)
```ts
function myFunc() { ... }
window.main = myFunc;
```
3.If you opt to run the code using `<output> eval ""`, you might find `Deno.args` not working as there is currently no easy way to pass args under `deno eval`. A [tracking issue](https://github.com/denoland/deno/issues/8538) is created for this.

### Usage example

```sh
# Running the example in this repo
$ deno run -A --unstable dcc.ts -o example example.ts
# You will see a bunch of output. The Rust building phase will take quite a while during first run, and will also take a few minutes on source content changes.

$ ./example eval ""
This function is snapshotted.
>> Current directory is /Users/kun/Projects/Deno/dcc.
>> Current time is 11-28-2020 16:28:58.014
```