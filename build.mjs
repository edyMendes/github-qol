import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

// Popup and background import ./settings.js at build time, but at runtime they
// must load the sibling build artifact ./settings.min.js. Mark the import
// external and rewrite it to the built file name.
const externalSettingsPlugin = {
  name: "external-settings",
  setup(build) {
    build.onResolve({ filter: /^\.\/settings\.js$/ }, () => ({
      path: "./settings.min.js",
      external: true,
    }));
  },
};

const common = {
  bundle: true,
  format: "esm",
  minify: true,
  target: ["chrome120"],
  sourcemap: false,
  outdir: "src/js",
};

const entries = [
  {
    entryPoints: { "settings.min": "src/js/settings.js" },
    ...common,
  },
  {
    entryPoints: {
      "popup.min": "src/js/popup.js",
      "background.min": "src/js/background.js",
    },
    ...common,
    plugins: [externalSettingsPlugin],
  },
  {
    entryPoints: { "content-github-pr.bundle.min": "src/js/content-github-pr.js" },
    ...common,
    format: "iife",
  },
];

if (watch) {
  const contexts = await Promise.all(entries.map((entry) => context(entry)));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log("Watching for changes...");
} else {
  for (const entry of entries) {
    await build(entry);
  }
  console.log("Built src/js/*.min.js");
}
