import { strict as assert } from "node:assert";
import test from "node:test";
import { getArg, optionalArg, optionalUint16Arg } from "./args.js";

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

test("optionalUint16Arg parses an optional bounded integer", () => {
  withArgv(["node", "script", "--curve-s", "25"], () => {
    assert.equal(optionalUint16Arg("curve-s", { min: 1, max: 1000 }), 25);
  });
});

test("optionalUint16Arg rejects non-integer or out-of-range values", () => {
  withArgv(["node", "script", "--curve-s", "1.5"], () => {
    assert.throws(() => optionalUint16Arg("curve-s", { min: 1, max: 1000 }), /integer/);
  });
  withArgv(["node", "script", "--curve-s", "0"], () => {
    assert.throws(() => optionalUint16Arg("curve-s", { min: 1, max: 1000 }), /between 1 and 1000/);
  });
  withArgv(["node", "script", "--curve-s", "1001"], () => {
    assert.throws(() => optionalUint16Arg("curve-s", { min: 1, max: 1000 }), /between 1 and 1000/);
  });
});
