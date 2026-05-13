import { strict as assert } from "node:assert";
import test from "node:test";
import { getArg, optionalArg } from "./args.js";

function withArgv(argv: string[], fn: () => void): void {
  const originalArgv = process.argv;
  process.argv = argv;
  try {
    fn();
  } finally {
    process.argv = originalArgv;
  }
}

test("getArg rejects missing values followed by another flag", () => {
  withArgv(["node", "script", "--network", "--chain-id", "196"], () => {
    assert.throws(() => getArg("network"), /Missing value for --network/);
  });
});

test("optionalArg rejects missing values followed by another flag", () => {
  withArgv(["node", "script", "--rpc-url", "--chain-id", "196"], () => {
    assert.throws(() => optionalArg("rpc-url"), /Missing value for --rpc-url/);
  });
});

test("optionalArg returns undefined for absent flags", () => {
  withArgv(["node", "script"], () => {
    assert.equal(optionalArg("rpc-url"), undefined);
  });
});
