#!/usr/bin/env tnode
import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { buildSync } from "esbuild";

import {
  author,
  dependencies,
  description,
  license,
  name,
  version,
} from "../package.json";

buildSync({
  bundle: true,
  entryPoints: ["src/index.ts"],
  outdir: "dist",
  platform: "node",
  target: "node16",
  external: Object.keys(dependencies),
});

execSync("cp -r LICENSE README.md dist/");

writeFileSync(
  "dist/package.json",
  JSON.stringify(
    {
      name,
      description,
      version,
      author,
      license,
      repository: "ArnaudBarre/config-loader",
      dependencies,
    },
    null,
    2,
  ),
);
