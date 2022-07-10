import { createHash } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { build, BuildResult, formatMessagesSync } from "esbuild";

export type DefineConfig<T> = T | (() => Promise<T>);

export const loadConfig = async <Config extends Record<string, unknown>>(
  name: string,
): Promise<Config | undefined> => {
  const entryPoint = `${name}.config.ts`;
  const cacheDir = `node_modules/.${name}`;
  const output = join(cacheDir, "config.js");
  if (!existsSync(entryPoint)) return;
  const cache = jsonCache<{ files: [path: string, hash: string][] }>(
    join(cacheDir, "config-hashes.json"),
    1,
  );
  const files = cache.read()?.files;
  if (
    !files ||
    files.some(([path, hash]) => {
      const content = readMaybeFileSync(path);
      return !content || getHash(content) !== hash;
    })
  ) {
    const result = await build({
      entryPoints: [entryPoint],
      outfile: output,
      metafile: true,
      bundle: true,
      platform: "node",
    });
    logEsbuildErrors(result);
    cache.write({
      files: Object.keys(result.metafile.inputs).map((path) => [
        path,
        getHash(readFileSync(path)),
      ]),
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const module = require(join(process.cwd(), output)) as {
    config?: DefineConfig<Config>;
  };
  if (!module.config) {
    throw new Error(`${entryPoint} doesn't have a "config" export`);
  }
  return typeof module.config === "function" ? module.config() : module.config;
};

export const jsonCache = <T extends Record<string, any>>(
  path: string,
  version: number,
) => ({
  read: (): T | undefined => {
    const content = readMaybeFileSync(path);
    if (!content) return;
    const json = JSON.parse(content) as T & { version: number };
    if (json.version !== version) return;
    return json;
  },
  write: (data: T) => writeFileSync(path, JSON.stringify({ version, ...data })),
});

export const useColors = !(
  "NO_COLOR" in process.env || process.argv.includes("--no-color")
);

export const logEsbuildErrors = ({ errors, warnings }: BuildResult) => {
  if (errors.length) {
    console.log(
      formatMessagesSync(errors, {
        kind: "error",
        color: useColors,
      }).join("\n"),
    );
  } else if (warnings.length) {
    console.log(
      formatMessagesSync(warnings, {
        kind: "warning",
        color: useColors,
      }).join("\n"),
    );
  }
};

export const getHash = (content: string | Buffer) =>
  createHash("sha1")
    .update(
      // @ts-ignore
      content,
      typeof content === "string" ? "utf-8" : undefined,
    )
    .digest("hex")
    .slice(0, 8);

export const readMaybeFileSync = (path: string) => {
  try {
    return readFileSync(path, "utf-8");
  } catch (err: any) {
    if (err.code === "ENOENT") return;
    throw err;
  }
};
