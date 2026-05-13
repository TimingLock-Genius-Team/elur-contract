import { strict as assert } from "node:assert";
import test from "node:test";
import { redactDiagnostics, redactKnownSecrets } from "./redaction.js";

test("redactKnownSecrets replaces configured secret values", () => {
  const message = "Request failed. URL: https://rpc.example/super-secret-key";

  assert.equal(
    redactKnownSecrets(message, ["https://rpc.example/super-secret-key"]),
    "Request failed. URL: $RPC_URL",
  );
});

test("redactDiagnostics redacts errors and warnings", () => {
  const result = redactDiagnostics({
    ok: false,
    errors: ["failed https://rpc.example/super-secret-key"],
    warnings: ["retry https://rpc.example/super-secret-key"],
  }, ["https://rpc.example/super-secret-key"]);

  assert.deepEqual(result, {
    ok: false,
    errors: ["failed $RPC_URL"],
    warnings: ["retry $RPC_URL"],
  });
});
