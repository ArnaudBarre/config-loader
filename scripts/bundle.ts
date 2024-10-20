#!/usr/bin/env tnode
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
import packageJSON from "../package.json";

buildSync({
  bundle: true,
  entryPoints: ["src/index.ts"],
  outdir: "dist",
  format: "esm",
  platform: "node",
  target: "node18",
  external: Object.keys(packageJSON.dependencies),
});

execSync("cp -r LICENSE README.md dist/");

writeFileSync(
  "dist/package.json",
  JSON.stringify(
    {
      name: packageJSON.name,
      description: packageJSON.description,
      type: "module",
      version: packageJSON.version,
      author: packageJSON.author,
      license: packageJSON.license,
      main: "index.js",
      repository: "ArnaudBarre/config-loader",
      dependencies: packageJSON.dependencies,
    },
    null,
    2,
  ),
);
