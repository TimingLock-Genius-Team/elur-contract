import "dotenv/config";
import { spawnSync } from "node:child_process";
import { createPublicClient, http, parseEther, toHex } from "viem";
import { ANVIL_CHAIN_ID, DEFAULT_ANVIL_RPC_URL, chainConfigFor, rpcUrlFromEnv } from "../config/chains.js";
import { deriveAnvilSmokeAccounts } from "../lib/anvil-smoke-accounts.js";
import { printJson } from "../lib/json.js";

const rpcUrl = rpcUrlFromEnv("anvil") ?? DEFAULT_ANVIL_RPC_URL;
const network = process.env.DEPLOYMENT_NETWORK ?? "anvil";
const minBalance = BigInt(process.env.ANVIL_MIN_BALANCE_WEI ?? parseEther("1000").toString());
const fundBalance = BigInt(process.env.ANVIL_FUND_BALANCE_WEI ?? parseEther("10000").toString());

const client = createPublicClient({
  chain: chainConfigFor("anvil", rpcUrl),
  transport: http(rpcUrl),
});

async function setAnvilBalance(address: `0x${string}`, balance: bigint): Promise<void> {
  await client.request({
    method: "anvil_setBalance" as never,
    params: [address, toHex(balance)] as never,
  });
}

async function main(): Promise<number> {
  if (network !== "anvil") {
    printJson({ ok: false, error: "smoke-anvil-accounts only runs with DEPLOYMENT_NETWORK=anvil" });
    return 1;
  }

  const chainId = await client.getChainId();
  if (chainId !== ANVIL_CHAIN_ID) {
    printJson({ ok: false, error: `Expected Anvil chain ${ANVIL_CHAIN_ID}, got ${chainId}` });
    return 1;
  }

  const accounts = deriveAnvilSmokeAccounts(process.env.ANVIL_PRIVATE_KEYS, process.env.ANVIL_EXPECTED_ACCOUNTS);
  const results: Array<{ index: number; address: `0x${string}`; funded: boolean; exitCode: number }> = [];

  for (const account of accounts) {
    const balance = await client.getBalance({ address: account.address });
    const funded = balance < minBalance;
    if (funded) {
      await setAnvilBalance(account.address, fundBalance);
    }

    console.log(`=== smoke:anvil account ${account.index} ${account.address} ===`);
    const result = spawnSync("npm", ["run", "smoke:anvil"], {
      stdio: "inherit",
      env: {
        ...process.env,
        ANVIL_RPC_URL: rpcUrl,
        DEPLOYMENT_NETWORK: "anvil",
        PRIVATE_KEY: account.privateKey,
        TEAM_MULTISIG: account.address,
      },
    });

    const exitCode = result.status ?? 1;
    results.push({ index: account.index, address: account.address, funded, exitCode });
    if (exitCode !== 0) {
      printJson({ ok: false, chainId, rpcUrl, failedAccount: account.address, results });
      return exitCode;
    }
  }

  printJson({ ok: true, chainId, rpcUrl, minBalance: minBalance.toString(), fundBalance: fundBalance.toString(), results });
  return 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  printJson({ ok: false, error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
}
