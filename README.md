# `dcc`: a hack to create a Deno-based binary

Essentially an ugly version of `deno compile` (currently not supporting Windows. Help needed).

A simple tool that exploits repo structure of Deno to bake extra functions into the Deno binary, by downloading the Deno repo and injecting a bundled file (currently called `cli/rt/AA_dcc.js`) to the bootstrapping phase. Since we are not using the `deno` crate and thus not using the snapshot API as intended, currently there are a few main restrictions to this approach:

1. The file MUST NOT use any `Deno` or `window` namespace properties in the top level of the module.
```ts
function myFunc() {
  console.log(Deno.cwd(), window.setTimeout); // Okay!
}

console.log(Deno.cwd()) // No! This will cause a compile-time crash
```
2. The functions are not directly reference-able. For functions you want to expose, expose them through `globalThis` (or `window`, which is discouraged for use.)
```ts
function myFunc() { ... }
window.main = myFunc;
```
3. To run the code, since we did not modify any of the other Deno structure, we have to follow the Deno commands and flags to run. A simple way to trigger our function, in our case above, is to run the command as `./example eval "main()"`.
  + If you opt to run the code this way, you might find `Deno.args` not working as there is currently no easy way to pass args under `deno eval`.

### Usage

```
$ deno run -A --unstable dcc.ts -o example example.ts
# You will see a bunch of output. The Rust building phase will take quite a while during first run, and will also take a few minutes
$ ./example eval "main()"
```