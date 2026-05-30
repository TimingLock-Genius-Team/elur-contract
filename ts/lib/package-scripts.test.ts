import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

type PackageJson = {
  scripts?: Record<string, string>;
};

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as PackageJson;

test("hashkeytest account smoke script builds fresh artifacts before reading ABIs", () => {
  assert.match(
    packageJson.scripts?.["smoke:hashkeytest:accounts"] ?? "",
    /^npm run build && /,
  );
});

test("root backend aliases target the backend indexer package", () => {
  assert.equal(packageJson.scripts?.["backend:dev"], "npm --prefix backend/backend run dev");
  assert.equal(packageJson.scripts?.["backend:indexer"], "npm --prefix backend/backend run start:indexer");
  assert.equal(packageJson.scripts?.["backend:migrate"], "npm --prefix backend/backend run db:migrate");
  assert.equal(packageJson.scripts?.["backend:test"], "npm --prefix backend/backend run test:node");
  assert.equal(packageJson.scripts?.["backend:test:bun"], "npm --prefix backend/backend test");
  assert.equal(packageJson.scripts?.["backend:typecheck"], "npm --prefix backend/backend run typecheck");
});

test("root scripts expose hook architecture upgrade and smoke flow", () => {
  assert.match(packageJson.scripts?.["upgrade:hook-architecture"] ?? "", /upgrade-hook-architecture\.ts/);
  assert.match(packageJson.scripts?.["smoke:anvil:hook-upgrade"] ?? "", /smoke-hook-upgrade-anvil\.ts/);
});

test("root scripts expose core-only ABI export for plugin decoupling", () => {
  assert.equal(
    packageJson.scripts?.["export:abis:core"],
    "npm run build && tsx ts/cli/export-frontend-abi.ts --no-v4-hook-plugins",
  );
  assert.match(packageJson.scripts?.["export:abis"] ?? "", /npm --prefix custom-hook run build/);
});

test("root scripts expose anvil full flow for decoupled v4 hook plugins", () => {
  const script = packageJson.scripts?.["smoke:anvil:v4-plugin-flow"] ?? "";

  assert.match(script, /export-frontend-abi\.ts --no-v4-hook-plugins --out \.tmp-eulr-core-abi-smoke/);
  assert.match(script, /npm run export:abis/);
  assert.match(script, /npm run smoke:anvil:v4-registry-direct/);
  assert.match(script, /npm --prefix custom-hook run validate/);
  assert.match(packageJson.scripts?.["smoke:anvil:v4-hooks"] ?? "", /npm --prefix custom-hook run smoke:anvil:v4-hooks/);
  assert.match(script, /npm run smoke:anvil:v4-profile/);
});
