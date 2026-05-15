import "dotenv/config";
import { readFileSync } from "node:fs";
import { createWalletClient, http, publicActions, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { HASHKEYTEST_CHAIN_ID } from "../config/chains.js";
import { deploymentNetwork } from "../config/deployments.js";
import { optionalArg, hasArg } from "../lib/args.js";
import { chainConfig, publicClient, rpcUrl, walletClient } from "../lib/clients.js";
import { resolveTokenInfo, routerAbi, tokenAbi } from "../lib/contracts.js";
import {
  chunkAccounts,
  parseHashKeyTestWallets,
  selectHashKeyTestSmokeTargets,
  type HashKeyTestSmokeAccount,
} from "../lib/hashkeytest-smoke-accounts.js";
import { printJson } from "../lib/json.js";
import { waitForSuccessfulTransactionReceipt } from "../lib/transactions.js";
import { parseOkb, parseToken } from "../lib/units.js";

type AccountSmokeResult = {
  address: `0x${string}`;
  label: string;
  funded: boolean;
  initialBalance: string;
  finalBalance?: string;
  buyHash?: Hash;
  approvalHash?: Hash;
  sellHash?: Hash;
  error?: string;
};

function positiveIntegerArg(name: string, fallback: number): number {
  const value = optionalArg(name);
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(parsed)) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return parsed;
}

async function waitForNextBlock(blockNumber: bigint): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const current = await client.getBlockNumber();
    if (current > blockNumber) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Timed out waiting for a block after ${blockNumber}`);
}

const network = deploymentNetwork();
if (network !== "hashkeytest") {
  throw new Error("smoke-hashkeytest-accounts only runs with DEPLOYMENT_NETWORK=hashkeytest");
}

const client = publicClient();
const chainId = await client.getChainId();
if (chainId !== HASHKEYTEST_CHAIN_ID) {
  throw new Error(`Expected HashKey testnet chainId ${HASHKEYTEST_CHAIN_ID}, got ${chainId}`);
}

const ownerWallet = walletClient();
const [ownerAddress] = await ownerWallet.getAddresses();
const accountsPath = optionalArg("wallets-file") ?? process.env.HASHKEYTEST_TEST_WALLETS_FILE ?? ".secrets/hashkeytest-wallets.tsv";
const limit = positiveIntegerArg("limit", Number.MAX_SAFE_INTEGER);
const concurrency = positiveIntegerArg("concurrency", Number(process.env.HASHKEYTEST_ACCOUNT_CONCURRENCY ?? "5"));
const buyAmount = parseOkb(optionalArg("buy-okb") ?? process.env.HASHKEYTEST_ACCOUNT_BUY_OKB ?? "0.001");
const sellAmount = parseToken(optionalArg("sell-tokens") ?? process.env.HASHKEYTEST_ACCOUNT_SELL_TOKENS ?? "1");
const minBalance = parseOkb(optionalArg("min-balance") ?? process.env.HASHKEYTEST_ACCOUNT_MIN_BALANCE ?? "0.02");
const fundBalance = parseOkb(optionalArg("fund-balance") ?? process.env.HASHKEYTEST_ACCOUNT_FUND_BALANCE ?? "0.05");
const shouldFund = hasArg("fund") || process.env.HASHKEYTEST_FUND_TEST_WALLETS === "true";
const info = await resolveTokenInfo();

const accounts = selectHashKeyTestSmokeTargets(
  parseHashKeyTestWallets(readFileSync(accountsPath, "utf8")),
  ownerAddress,
  limit,
);

async function fundIfNeeded(account: HashKeyTestSmokeAccount): Promise<{ balance: bigint; funded: boolean }> {
  const balance = await client.getBalance({ address: account.address });
  if (balance >= minBalance) {
    return { balance, funded: false };
  }
  if (!shouldFund) {
    throw new Error(`balance ${balance} below minimum ${minBalance}; rerun with --fund`);
  }
  if (fundBalance <= balance) {
    throw new Error(`fund balance ${fundBalance} must exceed current balance ${balance}`);
  }

  const hash = await ownerWallet.sendTransaction({
    to: account.address,
    value: fundBalance - balance,
  });
  await waitForSuccessfulTransactionReceipt({ client, hash, label: `fund ${account.label}` });
  return { balance: fundBalance, funded: true };
}

async function runAccount(account: HashKeyTestSmokeAccount, initialBalance: bigint, funded: boolean): Promise<AccountSmokeResult> {
  const trader = privateKeyToAccount(account.privateKey);
  const wallet = createWalletClient({
    account: trader,
    chain: chainConfig("hashkeytest"),
    transport: http(rpcUrl("hashkeytest")),
  }).extend(publicActions);

  try {
    const buyHash = await wallet.writeContract({
      address: info.router,
      abi: routerAbi,
      functionName: "buy",
      args: [info.token, 0n, account.address],
      value: buyAmount,
    });
    const buyReceipt = await waitForSuccessfulTransactionReceipt({ client, hash: buyHash, label: `buy ${account.label}` });
    await waitForNextBlock(buyReceipt.blockNumber);

    const approvalHash = await wallet.writeContract({
      address: info.token,
      abi: tokenAbi,
      functionName: "approve",
      args: [info.router, sellAmount],
    });
    await waitForSuccessfulTransactionReceipt({ client, hash: approvalHash, label: `approve ${account.label}` });

    const sellHash = await wallet.writeContract({
      address: info.router,
      abi: routerAbi,
      functionName: "sell",
      args: [info.token, sellAmount, 0n, account.address],
    });
    await waitForSuccessfulTransactionReceipt({ client, hash: sellHash, label: `sell ${account.label}` });

    const finalBalance = await client.getBalance({ address: account.address });
    return {
      address: account.address,
      label: account.label,
      funded,
      initialBalance: initialBalance.toString(),
      finalBalance: finalBalance.toString(),
      buyHash,
      approvalHash,
      sellHash,
    };
  } catch (error) {
    return {
      address: account.address,
      label: account.label,
      funded,
      initialBalance: initialBalance.toString(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const prepared: Array<{ account: HashKeyTestSmokeAccount; balance: bigint; funded: boolean }> = [];
for (const account of accounts) {
  const { balance, funded } = await fundIfNeeded(account);
  prepared.push({ account, balance, funded });
}

const results: AccountSmokeResult[] = [];
for (const chunk of chunkAccounts(prepared, concurrency)) {
  results.push(...await Promise.all(chunk.map(({ account, balance, funded }) => runAccount(account, balance, funded))));
}

const failed = results.filter((result) => result.error);
printJson({
  ok: failed.length === 0,
  chainId,
  token: info.token,
  hook: info.hook,
  router: info.router,
  owner: ownerAddress,
  accounts: results.length,
  concurrency,
  buyAmount: buyAmount.toString(),
  sellAmount: sellAmount.toString(),
  fundedAccounts: results.filter((result) => result.funded).length,
  failedAccounts: failed.length,
  results,
});

if (failed.length > 0) {
  process.exitCode = 1;
}
