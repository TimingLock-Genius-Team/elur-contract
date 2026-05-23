import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Abi } from "viem";
import ts from "typescript";
import { readArtifact } from "../lib/artifacts.js";
import { artifacts } from "../config/artifacts.js";
import { readDeployment, type Deployment } from "../config/deployments.js";
import { getArg, hasArg } from "../lib/args.js";

type ExportContract = {
  name: string;
  artifact: string;
  description: string;
};

const CONTRACT_EXPORTS: ExportContract[] = [
  {
    name: "EulrFactory",
    artifact: artifacts.factory,
    description: "Singleton factory. Creates per-token (token, hook, router) trios and exposes the read registry.",
  },
  {
    name: "EulrHook",
    artifact: "EulrHook.sol/EulrHook.json",
    description: "Per-token bonding-curve engine. Owns curve state, fee accrual, self-deprecation, and one-shot migration.",
  },
  {
    name: "EulrRouter",
    artifact: "EulrRouter.sol/EulrRouter.json",
    description: "Per-token user entrypoint. Wraps buy/sell so frontends interact with a stable interface per token.",
  },
  {
    name: "EulrToken",
    artifact: "EulrToken.sol/EulrToken.json",
    description: "Per-token ERC-20. Mint and burn are gated to the bound hook; transfer/approve match the standard ABI.",
  },
  {
    name: "ProxyAdmin",
    artifact: artifacts.proxyAdmin,
    description: "OZ v5 transparent proxy admin ABI. Each proxy owns a distinct ProxyAdmin; deployment metadata records the Factory proxy admin.",
  },
  {
    name: "TransparentUpgradeableProxy",
    artifact: artifacts.transparentUpgradeableProxy,
    description: "Transparent proxy shell used for the singleton Factory and each per-token Router.",
  },
  {
    name: "UniswapV4MintPositionTarget",
    artifact: artifacts.uniswapV4MintPositionTarget,
    description: "Reference migration adapter. Encodes Uniswap v4 MINT_POSITION/SETTLE_PAIR and sends the LP position to the configured recipient.",
  },
  {
    name: "EulrV4SellTaxHook",
    artifact: artifacts.v4SellTaxHook,
    description: "Post-graduation Uniswap v4 hook. Taxes exact-input EULR sells and leaves buys untaxed.",
  },
];

type AbiOutput = {
  name: string;
  description: string;
  abi: Abi;
};

type AddressesShape = {
  generatedAt: string;
  generatedFrom: string;
  byNetwork: Record<string, NetworkDeployment>;
  // Multiple networks can share a chain id (e.g. local anvil + forge-local both
  // use 31337). Callers should disambiguate by `network` name; for the common
  // case of a single deployment per chain id, `byChainId[id][0]` is sufficient.
  byChainId: Record<string, NetworkDeployment[]>;
};

type NetworkDeployment = {
  network: string;
  chainId: number;
  commit: string;
  deployedAt: string;
  factory: `0x${string}`;
  proxyAdmin?: `0x${string}`;
  factoryImplementation?: `0x${string}`;
  hookImplementation?: `0x${string}`;
  routerImplementation?: `0x${string}`;
  feeRecipient: `0x${string}`;
  migrationTarget: `0x${string}`;
  uniswapV4PoolManager: `0x${string}`;
  uniswapV4PositionManager: `0x${string}`;
  curve: Deployment["curve"];
};

const outputDirs = [join(process.cwd(), getArg("out", "frontend/abi"))];
if (!hasArg("out") || hasArg("backend-out")) {
  outputDirs.push(join(process.cwd(), getArg("backend-out", "backend/abi")));
}
if (!hasArg("out") || hasArg("backend-package-out")) {
  outputDirs.push(join(process.cwd(), getArg("backend-package-out", "backend/frontend/abi")));
}

const abiOutputs: AbiOutput[] = CONTRACT_EXPORTS.map((entry) => {
  const artifact = readArtifact(entry.artifact);
  return { name: entry.name, description: entry.description, abi: artifact.abi };
});

const indexTs = renderIndexTs(abiOutputs);
const addresses = collectAddresses();
const readme = renderReadme(abiOutputs, addresses);

for (const outputDir of [...new Set(outputDirs)]) {
  mkdirSync(outputDir, { recursive: true });
  for (const entry of abiOutputs) {
    const path = join(outputDir, `${entry.name}.json`);
    writeFileSync(path, `${JSON.stringify(entry.abi, null, 2)}\n`);
  }
  writeFileSync(join(outputDir, "index.ts"), indexTs);
  writeFileSync(join(outputDir, "index.js"), renderIndexJs(indexTs));
  writeFileSync(join(outputDir, "addresses.json"), `${JSON.stringify(addresses, null, 2)}\n`);
  writeFileSync(join(outputDir, "addresses.ts"), renderAddressesTs(addresses));
  writeFileSync(join(outputDir, "README.md"), readme);
}

console.log(
  JSON.stringify(
    {
      outputDirs: [...new Set(outputDirs)],
      contracts: abiOutputs.map((entry) => ({
        name: entry.name,
        functions: entry.abi.filter((item) => item.type === "function").length,
        events: entry.abi.filter((item) => item.type === "event").length,
        errors: entry.abi.filter((item) => item.type === "error").length,
      })),
      networks: Object.keys(addresses.byNetwork),
    },
    null,
    2,
  ),
);

function renderIndexTs(entries: AbiOutput[]): string {
  const header = [
    "// Auto-generated by `npm run export:abis`. Do not edit by hand.",
    "// Each ABI is inlined as a `const` array so viem / wagmi infer argument and",
    "// return types directly from the literal shape.",
    "",
    'import type { Abi } from "viem";',
    "",
  ].join("\n");

  const constNames: string[] = [];
  const bodies = entries.map((entry) => {
    const constName = `${camelCase(entry.name)}Abi`;
    constNames.push(constName);
    const inlined = JSON.stringify(entry.abi, null, 2);
    return [
      `// ${entry.description}`,
      `export const ${constName} = ${inlined} as const satisfies Abi;`,
      "",
    ].join("\n");
  });

  const exportsBlock = [
    "export const eulrAbis = {",
    ...entries.map((entry) => `  ${entry.name}: ${camelCase(entry.name)}Abi,`),
    "} as const;",
    "",
    `export type EulrContractName = keyof typeof eulrAbis;`,
    "",
  ].join("\n");

  return [header, ...bodies, exportsBlock].join("\n");
}

function renderAddressesTs(addresses: AddressesShape): string {
  return [
    "// Auto-generated by `npm run export:abis`. Do not edit by hand.",
    "// Snapshot of every recorded deployment JSON under `deployments/<network>/latest.json`.",
    "",
    `export const eulrDeployments = ${JSON.stringify(addresses, null, 2)} as const;`,
    "",
    "export type EulrDeploymentNetwork = keyof typeof eulrDeployments.byNetwork;",
    "export type EulrDeploymentChainId = keyof typeof eulrDeployments.byChainId;",
    "",
  ].join("\n");
}

function renderIndexJs(indexTs: string): string {
  return ts.transpileModule(indexTs, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      removeComments: false,
    },
  }).outputText;
}

function renderReadme(entries: AbiOutput[], addresses: AddressesShape): string {
  const networkLines = Object.values(addresses.byNetwork)
    .map((deployment) =>
      `| ${deployment.network} | ${deployment.chainId} | ${deployment.factory} | ${deployment.proxyAdmin ?? ""} | ${deployment.migrationTarget} |`,
    )
    .join("\n");

  const contractLines = entries
    .map((entry) => `- \`${entry.name}.json\` — ${entry.description}`)
    .join("\n");

  return [
    "# Eulr ABI Bundle",
    "",
    "Generated from `out/` Foundry artifacts and `deployments/<network>/latest.json` via",
    "`npm run export:abis`. Re-run after every contract or deployment change.",
    "",
    "## Files",
    "",
    contractLines,
    "- `index.ts` — typed `as const` ABIs for viem / wagmi.",
    "- `addresses.json` / `addresses.ts` — deployment addresses, chain ids, proxy metadata, curve params.",
    "",
    "OZ v5 transparent proxies create a distinct `ProxyAdmin` per proxy. The `proxyAdmin` column below is the recorded Factory proxy admin when available; Router proxy admins are read from each Router proxy's ERC-1967 admin slot by upgrade tooling.",
    "",
    "## Networks",
    "",
    "| Network | Chain ID | Factory Proxy | Proxy Admin | Migration Target |",
    "| --- | --- | --- | --- | --- |",
    networkLines || "| _(no deployments recorded yet)_ | | | | |",
    "",
    "See `FRONTEND_INTEGRATION.md` at the repository root for the full integration guide.",
    "",
  ].join("\n");
}

function collectAddresses(): AddressesShape {
  const root = join(process.cwd(), "deployments");
  const byNetwork: Record<string, NetworkDeployment> = {};
  const byChainId: Record<string, NetworkDeployment[]> = {};

  let networks: string[];
  try {
    networks = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    networks = [];
  }

  for (const network of networks) {
    let deployment: Deployment;
    try {
      deployment = readDeployment(network);
    } catch {
      continue;
    }

    const entry: NetworkDeployment = {
      network,
      chainId: deployment.chainId,
      commit: deployment.commit,
      deployedAt: deployment.deployedAt,
      factory: deployment.factory,
      proxyAdmin: deployment.proxyAdmin,
      factoryImplementation: deployment.factoryImplementation,
      hookImplementation: deployment.hookImplementation,
      routerImplementation: deployment.routerImplementation,
      feeRecipient: deployment.feeRecipient,
      migrationTarget: deployment.migrationTarget,
      uniswapV4PoolManager: deployment.uniswapV4PoolManager,
      uniswapV4PositionManager: deployment.uniswapV4PositionManager,
      curve: deployment.curve,
    };
    byNetwork[network] = entry;
    const chainKey = String(deployment.chainId);
    const list = byChainId[chainKey] ?? [];
    list.push(entry);
    byChainId[chainKey] = list;
  }

  if (Object.keys(byNetwork).length === 0) {
    const existing = readExistingAddressesSnapshot();
    if (existing && Object.keys(existing.byNetwork).length > 0) {
      return existing;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    generatedFrom: "deployments/<network>/latest.json + out/<Contract>.sol/<Contract>.json",
    byNetwork,
    byChainId,
  };
}

function readExistingAddressesSnapshot(): AddressesShape | undefined {
  const path = join(outputDirs[0], "addresses.json");
  if (!existsSync(path)) {
    return undefined;
  }

  try {
    const snapshot = JSON.parse(readFileSync(path, "utf8")) as AddressesShape;
    if (
      typeof snapshot.generatedAt === "string" &&
      typeof snapshot.generatedFrom === "string" &&
      typeof snapshot.byNetwork === "object" &&
      snapshot.byNetwork !== null &&
      typeof snapshot.byChainId === "object" &&
      snapshot.byChainId !== null
    ) {
      return snapshot;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function camelCase(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}
