import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { readArtifact } from "../lib/artifacts.js";
import { artifacts } from "../config/artifacts.js";

const bundleDir = join(process.cwd(), "frontend", "abi");

const expectedContracts = [
  { name: "EulrFactory", artifact: artifacts.factory },
  { name: "EulrHook", artifact: "EulrHook.sol/EulrHook.json" },
  { name: "EulrRouter", artifact: "EulrRouter.sol/EulrRouter.json" },
  { name: "EulrToken", artifact: "EulrToken.sol/EulrToken.json" },
  { name: "UniswapV4MintPositionTarget", artifact: artifacts.uniswapV4MintPositionTarget },
] as const;

test("frontend/abi bundle exists", () => {
  assert.equal(existsSync(bundleDir), true, "frontend/abi directory missing — run `npm run export:abis`");
  for (const entry of expectedContracts) {
    const path = join(bundleDir, `${entry.name}.json`);
    assert.equal(existsSync(path), true, `${path} missing — run \`npm run export:abis\``);
  }
  assert.equal(existsSync(join(bundleDir, "index.ts")), true);
  assert.equal(existsSync(join(bundleDir, "addresses.json")), true);
  assert.equal(existsSync(join(bundleDir, "addresses.ts")), true);
});

test("frontend/abi JSON ABIs match Foundry artifacts", () => {
  for (const entry of expectedContracts) {
    const bundleAbi = JSON.parse(readFileSync(join(bundleDir, `${entry.name}.json`), "utf8"));
    const artifactAbi = readArtifact(entry.artifact).abi;
    assert.deepEqual(
      bundleAbi,
      artifactAbi,
      `${entry.name}.json is stale — run \`npm run export:abis\``,
    );
  }
});

test("frontend/abi addresses snapshot is internally consistent", () => {
  // We intentionally do NOT compare against `deployments/<network>/latest.json`:
  // those files are gitignored (anvil restarts mutate them) and the bundle is
  // a committed snapshot of the last `npm run export:abis` run. We only assert
  // the snapshot is self-consistent and well-formed.
  type Entry = { network: string; chainId: number; factory: string };
  const snapshot = JSON.parse(readFileSync(join(bundleDir, "addresses.json"), "utf8")) as {
    byNetwork: Record<string, Entry>;
    byChainId: Record<string, Entry[]>;
  };

  for (const [network, entry] of Object.entries(snapshot.byNetwork)) {
    assert.equal(entry.network, network);
    assert.match(entry.factory, /^0x[0-9a-fA-F]{40}$/, `byNetwork.${network}.factory must be a hex address`);
    const peers = snapshot.byChainId[String(entry.chainId)] ?? [];
    assert.ok(
      peers.some((peer) => peer.network === network),
      `byNetwork.${network} (chainId ${entry.chainId}) must appear in byChainId[${entry.chainId}]`,
    );
  }

  for (const [chainId, entries] of Object.entries(snapshot.byChainId)) {
    for (const entry of entries) {
      assert.equal(String(entry.chainId), chainId);
      assert.equal(snapshot.byNetwork[entry.network]?.chainId, entry.chainId);
    }
  }
});
