import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build, formatMessagesSync, type Message } from "esbuild";

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
    4,
  );
  let files = cache.read()?.files;
  if (
    !files
    || files.some(([path, hash]) => {
      const content = readMaybeFileSync(path);
      return !content || getHash(content) !== hash;
    })
  ) {
    /* eslint-disable require-unicode-regexp */
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
            onResolve({ filter: /.*/ }, ({ path }) => {
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
    writeFileSync(join(cacheDir, "package.json"), '{ "type": "module" }');
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
  write: (data: T): void => {
    writeFileSync(path, JSON.stringify({ version, ...data }));
  },
});

// eslint-disable-next-line @typescript-eslint/no-inferrable-types
export const useColors: boolean = !(
  "NO_COLOR" in process.env || process.argv.includes("--no-color")
);

export const logEsbuildErrors = (result: {
  errors: Message[];
  warnings: Message[];
}): void => {
  if (result.errors.length) {
    console.log(
      formatMessagesSync(result.errors, {
        kind: "error",
        color: useColors,
      }).join("\n"),
    );
  } else if (result.warnings.length) {
    console.log(
      formatMessagesSync(result.warnings, {
        kind: "warning",
        color: useColors,
      }).join("\n"),
    );
  }
};

export const getHash = (content: string | Buffer): string =>
  typeof content === "string"
    ? createHash("sha1").update(content, "utf-8").digest("hex")
    : createHash("sha1").update(content).digest("hex");

export const readMaybeFileSync = (path: string): string | undefined => {
  try {
    return readFileSync(path, "utf-8");
  } catch (err: any) {
    if (err.code === "ENOENT") return;
    throw err;
  }
};
