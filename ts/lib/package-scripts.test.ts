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
