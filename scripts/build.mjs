// Bundles each Lambda entry point into a single self-contained file (all
// dependencies inlined), so the Terraform module in microservice-app-ops can
// zip dist/<handler>/index.mjs directly with no node_modules to package.
import { build } from "esbuild";

const HANDLERS = ["github-webhook-handler", "slack-interaction-handler"];

for (const handlerName of HANDLERS) {
  await build({
    entryPoints: [`src/${handlerName}/index.mjs`],
    bundle: true,
    platform: "node",
    // Deliberately conservative: bundle for whatever AWS Lambda's current
    // managed Node.js runtime actually is (verify the exact nodejsNN.x string
    // against AWS's Lambda runtime support page before `terraform apply` --
    // this repo's dev tooling targets Node >=24, but that is not the same
    // claim as "AWS Lambda offers a nodejs24.x runtime today").
    target: "node20",
    format: "esm",
    outfile: `dist/${handlerName}/index.mjs`,
    banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  });
}

console.log(`Built: ${HANDLERS.map((name) => `dist/${name}/index.mjs`).join(", ")}`);
