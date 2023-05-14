import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build, BuildResult, formatMessagesSync } from "esbuild";

export type DefineConfig<T> = T | (() => Promise<T>);

export const loadConfig = async <Config extends Record<string, unknown>>(
  name: string,
): Promise<{ config: Config; files: string[] } | undefined> => {
  const entryPoint = `${name}.config.ts`;
  const cacheDir = `node_modules/.${name}`;
  const output = join(cacheDir, "config.js");
  if (!existsSync(entryPoint)) return;
  const cache = jsonCache<{ files: [path: string, hash: string][] }>(
    join(cacheDir, "config-hashes.json"),
    3,
  );
  let files = cache.read()?.files;
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
      format: "esm",
      target: "node16",
      platform: "node",
      plugins: [
        {
          name: "externalize-deps",
          setup: ({ onResolve }) => {
            onResolve({ filter: /.*/u }, ({ path }) => {
              if (!path.startsWith(".")) return { external: true };
            });
          },
        },
      ],
    });
    logEsbuildErrors(result);
    files = Object.keys(result.metafile.inputs).map((path) => [
      path,
      getHash(readFileSync(path)),
    ]);
    cache.write({ files });
  }

  const path = join(process.cwd(), output);
  const module = (await import(`${path}?t=${Date.now()}`)) as {
    config?: DefineConfig<Config>;
  };
  if (!module.config) {
    throw new Error(`${entryPoint} doesn't have a "config" export`);
  }
  return {
    config:
      typeof module.config === "function"
        ? await module.config()
        : module.config,
    files: files.map((f) => f[0]),
  };
};

export const jsonCache = <T extends Record<string, any>>(
  path: string,
  version: number | string,
) => ({
  read: (): T | undefined => {
    const content = readMaybeFileSync(path);
    if (!content) return;
    const json = JSON.parse(content) as T & { version: number | string };
    if (json.version !== version) return;
    // @ts-expect-error
    delete json.version;
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
  typeof content === "string"
    ? createHash("sha1").update(content, "utf-8").digest("hex")
    : createHash("sha1").update(content).digest("hex");

export const readMaybeFileSync = (path: string) => {
  try {
    return readFileSync(path, "utf-8");
  } catch (err: any) {
    if (err.code === "ENOENT") return;
    throw err;
  }
};
