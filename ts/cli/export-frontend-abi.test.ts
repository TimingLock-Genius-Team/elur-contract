import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";
import { readArtifact } from "../lib/artifacts.js";
import { artifacts } from "../config/artifacts.js";

const bundleDirs = [
  join(process.cwd(), "frontend", "abi"),
  join(process.cwd(), "backend", "abi"),
  join(process.cwd(), "backend", "frontend", "abi"),
] as const;

const expectedContracts = [
  { name: "EulrFactory", artifact: artifacts.factory },
  { name: "EulrHook", artifact: "EulrHook.sol/EulrHook.json" },
  { name: "EulrRouter", artifact: "EulrRouter.sol/EulrRouter.json" },
  { name: "EulrToken", artifact: "EulrToken.sol/EulrToken.json" },
  { name: "ProxyAdmin", artifact: artifacts.proxyAdmin },
  { name: "TransparentUpgradeableProxy", artifact: artifacts.transparentUpgradeableProxy },
  { name: "UniswapV4MintPositionTarget", artifact: artifacts.uniswapV4MintPositionTarget },
  { name: "EulrV4SellTaxHook", artifact: artifacts.v4SellTaxHook },
] as const;

test("ABI bundles exist for frontend and backend packages", () => {
  for (const bundleDir of bundleDirs) {
    assert.equal(existsSync(bundleDir), true, `${bundleDir} directory missing — run \`npm run export:abis\``);
    for (const entry of expectedContracts) {
      const path = join(bundleDir, `${entry.name}.json`);
      assert.equal(existsSync(path), true, `${path} missing — run \`npm run export:abis\``);
    }
    assert.equal(existsSync(join(bundleDir, "index.ts")), true);
    assert.equal(existsSync(join(bundleDir, "index.js")), true);
    assert.equal(existsSync(join(bundleDir, "addresses.json")), true);
    assert.equal(existsSync(join(bundleDir, "addresses.ts")), true);
  }
});

test("ABI bundle JSON files match Foundry artifacts", () => {
  for (const bundleDir of bundleDirs) {
    for (const entry of expectedContracts) {
      const bundleAbi = JSON.parse(readFileSync(join(bundleDir, `${entry.name}.json`), "utf8"));
      const artifactAbi = readArtifact(entry.artifact).abi;
      assert.deepEqual(
        bundleAbi,
        artifactAbi,
        `${join(bundleDir, `${entry.name}.json`)} is stale — run \`npm run export:abis\``,
      );
    }
  }
});

test("ABI bundle JavaScript entrypoints match transpiled TypeScript entrypoints", () => {
  for (const bundleDir of bundleDirs) {
    const indexTs = readFileSync(join(bundleDir, "index.ts"), "utf8");
    const expectedJs = ts.transpileModule(indexTs, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        removeComments: false,
      },
    }).outputText;

    assert.equal(
      readFileSync(join(bundleDir, "index.js"), "utf8"),
      expectedJs,
      `${join(bundleDir, "index.js")} is stale — run \`npm run export:abis\``,
    );
  }
});

test("export-frontend-abi writes the JavaScript entrypoint", () => {
  const outputDir = mkdtempSync(".tmp-eulr-abi-export-");

  try {
    const result = spawnSync(process.execPath, [
      "--import",
      "tsx",
      "ts/cli/export-frontend-abi.ts",
      "--out",
      outputDir,
    ], {
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(outputDir, "index.js")), true);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

test("ABI bundle addresses snapshots are internally consistent", () => {
  // We intentionally do NOT compare against `deployments/<network>/latest.json`:
  // those files are gitignored (anvil restarts mutate them) and the bundle is
  // a committed snapshot of the last `npm run export:abis` run. We only assert
  // the snapshot is self-consistent and well-formed.
  type Entry = {
    network: string;
    chainId: number;
    factory: string;
    proxyAdmin?: string;
    factoryImplementation?: string;
    routerImplementation?: string;
  };
  for (const bundleDir of bundleDirs) {
    const snapshot = JSON.parse(readFileSync(join(bundleDir, "addresses.json"), "utf8")) as {
      byNetwork: Record<string, Entry>;
      byChainId: Record<string, Entry[]>;
    };

    for (const [network, entry] of Object.entries(snapshot.byNetwork)) {
      assert.equal(entry.network, network);
      assert.match(entry.factory, /^0x[0-9a-fA-F]{40}$/, `byNetwork.${network}.factory must be a hex address`);
      for (const field of ["proxyAdmin", "factoryImplementation", "routerImplementation"] as const) {
        if (entry[field] !== undefined) {
          assert.match(entry[field], /^0x[0-9a-fA-F]{40}$/, `byNetwork.${network}.${field} must be a hex address`);
        }
      }
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
  }
});
