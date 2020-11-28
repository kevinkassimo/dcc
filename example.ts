import { format } from "https://deno.land/std@0.79.0/datetime/mod.ts";

function main() {
  console.log("This function is snapshotted.");
  console.log(`>> Current directory is ${Deno.cwd()}.`);
  console.log(`>> Current time is ${format(new Date(), "MM-dd-yyyy HH:mm:ss.SSS")}`);
}

// @ts-ignore
window.main = main;
