import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const source = resolve(
  process.env.MAP_STUDIO_SOURCE || "/home/davtian/Documents/map",
);
const output = resolve("data/map-studio");
const { build } = await import(
  pathToFileURL(resolve(source, "node_modules/vite/dist/node/index.js")).href
);
await build({
  root: source,
  configFile: false,
  base: "/map-studio/",
  publicDir: false,
  plugins: [
    {
      name: "shorts-map-preview",
      transformIndexHtml: {
        order: "pre",
        handler: (html) => html.replace("/src/entry.js", "/src/main.js"),
      },
      transform(code, id) {
        if (id.endsWith("/style.css"))
          return code.replaceAll("url('/fonts/", "url('/map-studio/fonts/");
      },
    },
  ],
  build: { outDir: output, emptyOutDir: true },
});
