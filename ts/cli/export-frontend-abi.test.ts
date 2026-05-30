import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";
import { readArtifact } from "../lib/artifacts.js";
import { artifacts } from "../config/artifacts.js";
import { loadV4HookTemplateAbiExports } from "../config/v4-hook-plugin-manifest.js";

const bundleDirs = [
  join(process.cwd(), "backend", "abi"),
  join(process.cwd(), "backend", "frontend", "abi"),
] as const;

const expectedContracts = [
  { name: "EulrFactory", artifact: artifacts.factory },
  { name: "EulrHook", artifact: "EulrHook.sol/EulrHook.json" },
  { name: "EulrRouter", artifact: "EulrRouter.sol/EulrRouter.json" },
  { name: "EulrToken", artifact: "EulrToken.sol/EulrToken.json" },
  { name: "ProxyAdmin", artifact: artifacts.proxyAdmin },
  {
    name: "TransparentUpgradeableProxy",
    artifact: artifacts.transparentUpgradeableProxy,
  },
  {
    name: "UniswapV4MintPositionTarget",
    artifact: artifacts.uniswapV4MintPositionTarget,
  },
  {
    name: "EulrHookRegistry",
    artifact: artifacts.eulrHookRegistry,
  },
  {
    name: "EulrDirectV4LaunchFactory",
    artifact: artifacts.eulrDirectV4LaunchFactory,
  },
  ...loadV4HookTemplateAbiExports().map((entry) => ({
    name: entry.name,
    artifact: entry.artifact,
  })),
] as const;

const expectedCoreContracts = [
  { name: "EulrFactory", artifact: artifacts.factory },
  { name: "EulrHook", artifact: "EulrHook.sol/EulrHook.json" },
  { name: "EulrRouter", artifact: "EulrRouter.sol/EulrRouter.json" },
  { name: "EulrToken", artifact: "EulrToken.sol/EulrToken.json" },
  { name: "ProxyAdmin", artifact: artifacts.proxyAdmin },
  {
    name: "TransparentUpgradeableProxy",
    artifact: artifacts.transparentUpgradeableProxy,
  },
  {
    name: "UniswapV4MintPositionTarget",
    artifact: artifacts.uniswapV4MintPositionTarget,
  },
  {
    name: "EulrHookRegistry",
    artifact: artifacts.eulrHookRegistry,
  },
  {
    name: "EulrDirectV4LaunchFactory",
    artifact: artifacts.eulrDirectV4LaunchFactory,
  },
] as const;

const expectedPluginContracts = loadV4HookTemplateAbiExports().map((entry) => ({
  name: entry.name,
  artifact: entry.artifact,
}));

const legacyHardcodedV4HookContracts = [
  {
    name: "EulrV4DiamondHandsDecayTaxHook",
    artifact:
      "custom-hook/out/EulrV4DiamondHandsDecayTaxHook.sol/EulrV4DiamondHandsDecayTaxHook.json",
  },
  {
    name: "EulrV4LaunchShieldAntiSnipeHook",
    artifact:
      "custom-hook/out/EulrV4LaunchShieldAntiSnipeHook.sol/EulrV4LaunchShieldAntiSnipeHook.json",
  },
  {
    name: "EulrV4WhaleBossTaxHook",
    artifact: "custom-hook/out/EulrV4WhaleBossTaxHook.sol/EulrV4WhaleBossTaxHook.json",
  },
  {
    name: "EulrV4BuybackFlywheelHook",
    artifact: "custom-hook/out/EulrV4BuybackFlywheelHook.sol/EulrV4BuybackFlywheelHook.json",
  },
  {
    name: "EulrV4FirstBelieversNftHook",
    artifact:
      "custom-hook/out/EulrV4FirstBelieversNftHook.sol/EulrV4FirstBelieversNftHook.json",
  },
  {
    name: "EulrV4QuestReferralHook",
    artifact: "custom-hook/out/EulrV4QuestReferralHook.sol/EulrV4QuestReferralHook.json",
  },
  {
    name: "EulrV4LoyaltyTierRebateHook",
    artifact:
      "custom-hook/out/EulrV4LoyaltyTierRebateHook.sol/EulrV4LoyaltyTierRebateHook.json",
  },
  {
    name: "EulrV4MilestoneUnlockTreasuryHook",
    artifact:
      "custom-hook/out/EulrV4MilestoneUnlockTreasuryHook.sol/EulrV4MilestoneUnlockTreasuryHook.json",
  },
  {
    name: "EulrV4TeamBattleHook",
    artifact: "custom-hook/out/EulrV4TeamBattleHook.sol/EulrV4TeamBattleHook.json",
  },
  {
    name: "EulrV4CreatorFeeSplitHook",
    artifact:
      "custom-hook/out/EulrV4CreatorFeeSplitHook.sol/EulrV4CreatorFeeSplitHook.json",
  },
] as const;

test("hook ABI expectations come from plugin manifests instead of a hardcoded core list", () => {
  assert.deepEqual(expectedPluginContracts, legacyHardcodedV4HookContracts);
  assert.equal(
    expectedCoreContracts.some((entry) => entry.name.startsWith("EulrV4")),
    false,
  );
});

test("ABI bundles exist for backend packages", () => {
  for (const bundleDir of bundleDirs) {
    assert.equal(
      existsSync(bundleDir),
      true,
      `${bundleDir} directory missing — run \`npm run export:abis\``,
    );
    for (const entry of expectedContracts) {
      const path = join(bundleDir, `${entry.name}.json`);
      assert.equal(
        existsSync(path),
        true,
        `${path} missing — run \`npm run export:abis\``,
      );
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
      const bundleAbi = JSON.parse(
        readFileSync(join(bundleDir, `${entry.name}.json`), "utf8"),
      );
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

test("export-frontend-abi writes the JavaScript entrypoint and removes stale v4 hook ABIs", () => {
  const outputDir = mkdtempSync(".tmp-eulr-abi-export-");
  const staleHookAbi = join(outputDir, "EulrV4PrototypeHook.json");
  writeFileSync(staleHookAbi, "[]\n");

  try {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "ts/cli/export-frontend-abi.ts", "--out", outputDir],
      {
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(outputDir, "index.js")), true);
    assert.equal(existsSync(staleHookAbi), false);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

test("export-frontend-abi can write a core-only bundle without plugin hook ABIs", () => {
  const outputDir = mkdtempSync(".tmp-eulr-core-abi-export-");

  try {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "ts/cli/export-frontend-abi.ts",
        "--out",
        outputDir,
        "--no-v4-hook-plugins",
      ],
      {
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 0, result.stderr);
    for (const entry of expectedCoreContracts) {
      assert.equal(existsSync(join(outputDir, `${entry.name}.json`)), true);
    }
    assert.equal(
      existsSync(join(outputDir, "EulrV4DiamondHandsDecayTaxHook.json")),
      false,
    );
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

test("export-frontend-abi can include a generated hook manifest", () => {
  const outputDir = mkdtempSync(".tmp-eulr-generated-abi-export-");
  const manifestPath = join(outputDir, "generated-hook.json");
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        id: "generated-diamond",
        version: "1.0.0",
        generationId: "gen_01HZY9X7K8N2V4HOOK",
        author: "0x1111111111111111111111111111111111111111",
        targetChainId: 31337,
        name: "Generated Diamond",
        shortDescription: "Generated hook backed by a reproducible artifact.",
        mechanismCategory: ["SELL_TAX"],
        supportedLaunchModes: ["DIRECT_V4"],
        supportedPoolShape: "NATIVE_OKB_LAUNCHED_TOKEN",
        requiredPermissionMask: 0x00c8,
        permissionFlags: {
          beforeSwap: true,
          afterSwap: true,
          beforeSwapReturnsDelta: true,
        },
        requiresHookData: false,
        exampleHookData: "0x",
        recommendedPoolFee: 3_000,
        recommendedTickSpacing: 60,
        riskLabels: ["CUSTOM_HOOK", "SELL_TAX"],
        worstCaseFeeOrTax: "Worst case is maxSellTaxBps.",
        contracts: {
          hook: {
            name: "EulrV4DiamondHandsDecayTaxHook",
            artifact:
              "custom-hook/out/EulrV4DiamondHandsDecayTaxHook.sol/EulrV4DiamondHandsDecayTaxHook.json",
          },
          deployer: {
            name: "EulrV4DiamondHandsDecayTaxHookDeployer",
            artifact:
              "custom-hook/out/EulrV4DiamondHandsDecayTaxHookDeployer.sol/EulrV4DiamondHandsDecayTaxHookDeployer.json",
          },
        },
        constructorArgs: [],
        disclosure: {
          story: "Generated Diamond mirrors the official diamond-hands mechanism.",
          mechanismSummary: "Generated sell tax hook.",
          exactOutputWarning: "Exact-output swaps are unsupported.",
          taxWarning: "Sells can pay maxSellTaxBps.",
          worstCaseNetOutputWarning: "Quotes must include maxSellTaxBps.",
          taxRecipientPolicyWarning: "Tax recipient must be registry-approved.",
          launchModeWarning: "Direct v4 only for this generated manifest.",
          simulationStatusCopy: "Simulation report required before approval.",
          riskLabelCopy: {
            CUSTOM_HOOK: "Generated custom hook.",
            SELL_TAX: "Sell tax applies.",
          },
        },
        policy: {
          profile: "EULR_GENERATED_HOOK_V1",
          immutableOnly: true,
          forbidsArbitraryExternalCalls: true,
          forbidsDelegatecall: true,
          forbidsUpgradeability: true,
          maxFeeOrTaxBps: 1_000,
        },
        hashes: {
          sourceMetadataHash: `0x${"11".repeat(32)}`,
          artifactMetadataHash: `0x${"22".repeat(32)}`,
          constructorArgsHash: `0x${"33".repeat(32)}`,
          exampleHookDataHash: `0x${"44".repeat(32)}`,
        },
        createdAt: "2026-05-28T00:00:00.000Z",
      },
      null,
      2,
    ),
  );

  try {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "ts/cli/export-frontend-abi.ts",
        "--out",
        outputDir,
        "--no-v4-hook-plugins",
        "--generated-v4-hook-manifest",
        manifestPath,
      ],
      { encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      existsSync(join(outputDir, "EulrV4DiamondHandsDecayTaxHook.json")),
      true,
    );
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
    const snapshot = JSON.parse(
      readFileSync(join(bundleDir, "addresses.json"), "utf8"),
    ) as {
      byNetwork: Record<string, Entry>;
      byChainId: Record<string, Entry[]>;
    };

    for (const [network, entry] of Object.entries(snapshot.byNetwork)) {
      assert.equal(entry.network, network);
      assert.match(
        entry.factory,
        /^0x[0-9a-fA-F]{40}$/,
        `byNetwork.${network}.factory must be a hex address`,
      );
      for (const field of [
        "proxyAdmin",
        "factoryImplementation",
        "routerImplementation",
      ] as const) {
        if (entry[field] !== undefined) {
          assert.match(
            entry[field],
            /^0x[0-9a-fA-F]{40}$/,
            `byNetwork.${network}.${field} must be a hex address`,
          );
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
