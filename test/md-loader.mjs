import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function load(url, context, nextLoad) {
  if (!url.endsWith(".md")) {
    return nextLoad(url, context);
  }

  const content = await readFile(fileURLToPath(url), "utf8");
  return {
    format: "module",
    shortCircuit: true,
    source: `export default ${JSON.stringify(content)};`
  };
}
