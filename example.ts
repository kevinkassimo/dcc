import { format } from "https://deno.land/std@0.79.0/datetime/mod.ts";

// WARNING: do not put ANY Deno reference on the global scope!

function printCwd(): void {
  console.log(`>> Current directory is ${Deno.cwd()}.`); // It is okay to call Deno.* inside a function invoked through window.dccMain
}

// @ts-ignore
window.dccMain = () => {
  console.log("This function is snapshotted.");
  printCwd();
  console.log(`>> Current time is ${format(new Date(), "MM-dd-yyyy HH:mm:ss.SSS")}`);
};
