/**
 * Sepolia: sell SUV4 into the canonical Uniswap v4 pool (native ETH / SUV4) via Universal Router + Permit2.
 *
 * Uniswap packages are loaded with `createRequire` so they resolve to CJS builds; their ESM entry uses
 * extensionless relative imports that fail on Node 20+ when loaded via `tsx`/native ESM.
 *
 * Env: PRIVATE_KEY (0x…), optional SEPOLIA_RPC_URL, SEPOLIA_SWAP_SELL_CHUNK_WEI (default 3000e18),
 * SEPOLIA_TOKEN, V4_POOL_FEE, V4_TICK_SPACING, V4_HOOKS.
 * CLI: --quote-weth-wei, --amount-wei, --chunk-wei, --dust-wei, --single-tx, --slippage-bps, --dry-run, --skip-precall.
 *
 * Default sell-all (no --amount-wei): chunked swaps until balance <= --dust-wei. Default chunk ~3000e18 (SUV4);
 * override with --chunk-wei or SEPOLIA_SWAP_SELL_CHUNK_WEI. If simulation reverts with TRANSFER_FROM_FAILED,
 * the amount is halved until the call succeeds (handles stricter limits when clearing a wallet). Use --single-tx
 * for one shot (balance−1 wei). --amount-wei sends exactly one swap of that size.
 */

import "dotenv/config";
import { createRequire } from "node:module";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  maxUint256,
  decodeFunctionData,
  type Hex,
  type Chain,
} from "viem";
import { privateKeyToAccount, type Account } from "viem/accounts";
import { sepolia } from "viem/chains";
import { waitForSuccessfulTransactionReceipt } from "../lib/transactions.js";
import type { Token as SdkToken } from "@uniswap/sdk-core";

const require = createRequire(import.meta.url);
const {
  CurrencyAmount,
  Ether,
  Percent,
  Token,
  TradeType,
  WETH9,
} = require("@uniswap/sdk-core") as typeof import("@uniswap/sdk-core");
const {
  SwapRouter,
  UniversalRouterVersion,
  UNIVERSAL_ROUTER_ADDRESS,
} = require("@uniswap/universal-router-sdk") as typeof import("@uniswap/universal-router-sdk");
const { Pool: V4Pool } = require("@uniswap/v4-sdk") as typeof import("@uniswap/v4-sdk");

const CHAIN_ID = 11155111 as const;
const PERMIT2 = getAddress("0x000000000022D473030F116dDEE9F6B43aC78BA3");
const DEFAULT_TOKEN = getAddress("0x7926876d0D28aC4d49F8c1129BEd261Fa3b4830C");
/** Used only when CLI/env do not set a chunk; large balances on Sepolia SUV4 tolerate multi-e24 pulls. */
const DEFAULT_SELL_ALL_CHUNK_WEI = 3_000_000_000_000_000_000_000_000n;
/** Never try an amount below this when backing off from TRANSFER_FROM_FAILED (dust / rounding). */
const MIN_SELL_BACKOFF_WEI = 1_000_000_000_000_000n;

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const permit2Abi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
    ],
    outputs: [],
  },
] as const;

const universalRouterExecuteAbi = [
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      { name: "commands", type: "bytes" },
      { name: "inputs", type: "bytes[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      { name: "commands", type: "bytes" },
      { name: "inputs", type: "bytes[]" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

function getArg(name: string, fallback: string | undefined): string | undefined {
  const flag = `--${name}`;
  const i = process.argv.indexOf(flag);
  if (i < 0) return fallback;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) throw new Error(`Missing value for ${flag}`);
  return v;
}

function hasArg(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function applySellAllWeiMargin(balance: bigint, rawWant: bigint): bigint {
  let v = rawWant > balance ? balance : rawWant;
  if (v <= 0n) return v;
  if (v === balance && balance > 1n) v = balance - 1n;
  return v;
}

async function ensureErc20Approval(
  wallet: ReturnType<typeof createWalletClient>,
  publicClient: ReturnType<typeof createPublicClient>,
  signingAccount: Account,
  chain: Chain,
  token: `0x${string}`,
  owner: `0x${string}`,
  spender: `0x${string}`,
  needed: bigint,
): Promise<Hex | null> {
  const allowance = await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
  if (allowance >= needed) return null;
  return wallet.writeContract({
    account: signingAccount,
    chain,
    address: token,
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, maxUint256],
  });
}

async function ensurePermit2RouterAllowance(
  wallet: ReturnType<typeof createWalletClient>,
  publicClient: ReturnType<typeof createPublicClient>,
  signingAccount: Account,
  chain: Chain,
  owner: `0x${string}`,
  token: `0x${string}`,
  universalRouter: `0x${string}`,
  needed: bigint,
): Promise<Hex | null> {
  const [amount, expiration] = await publicClient.readContract({
    address: PERMIT2,
    abi: permit2Abi,
    functionName: "allowance",
    args: [owner, token, universalRouter],
  });
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (amount >= needed && BigInt(expiration) > now) return null;
  const max160 = (1n << 160n) - 1n;
  const exp48 = Number(2n ** 48n - 1n);
  return wallet.writeContract({
    account: signingAccount,
    chain,
    address: PERMIT2,
    abi: permit2Abi,
    functionName: "approve",
    args: [token, universalRouter, max160, exp48],
  });
}

type BuildSwapParams = {
  amountInWei: bigint;
  tokenIn: SdkToken;
  outputCurrency: ReturnType<typeof Ether.onChain>;
  wethToken: SdkToken;
  poolKey: ReturnType<typeof V4Pool.getPoolKey>;
  zeroForOne: boolean;
  tokenAddr: `0x${string}`;
  quoteWethWei: bigint;
  slippageBps: number;
  recipient: `0x${string}`;
};

function buildSwap(params: BuildSwapParams): { calldata: Hex; value: bigint; decoded: ReturnType<typeof decodeFunctionData> } {
  const {
    amountInWei,
    tokenIn,
    outputCurrency,
    wethToken,
    poolKey,
    zeroForOne,
    tokenAddr,
    quoteWethWei,
    slippageBps,
    recipient,
  } = params;

  const quoteAmount = CurrencyAmount.fromRawAmount(wethToken, quoteWethWei.toString());
  const inputAmount = CurrencyAmount.fromRawAmount(tokenIn, amountInWei.toString());
  const slip = new Percent(slippageBps, 10_000);

  const nativeCurrency = "0x0000000000000000000000000000000000000000" as const;
  const minEthOut =
    quoteWethWei > 0n ? (quoteWethWei * BigInt(10_000 - slippageBps)) / 10_000n : 0n;

  const swapSteps = [
    {
      type: "V4_SWAP" as const,
      v4Actions: [
        {
          action: "SWAP_EXACT_IN_SINGLE" as const,
          poolKey,
          zeroForOne,
          amountIn: amountInWei.toString(),
          amountOutMinimum: minEthOut.toString(),
          hookData: "0x",
        },
        {
          action: "SETTLE_ALL" as const,
          currency: tokenAddr,
          maxAmount: amountInWei.toString(),
        },
        {
          action: "TAKE_ALL" as const,
          currency: nativeCurrency,
          minAmount: minEthOut.toString(),
        },
      ],
    },
  ];

  const { calldata, value } = SwapRouter.encodeSwaps(
    {
      tradeType: TradeType.EXACT_INPUT,
      routing: {
        inputToken: tokenIn,
        outputToken: outputCurrency,
        amount: inputAmount,
        quote: quoteAmount,
      },
      slippageTolerance: slip,
      recipient,
      chainId: CHAIN_ID,
      urVersion: UniversalRouterVersion.V2_0,
    },
    swapSteps,
  );

  const decoded = decodeFunctionData({
    abi: universalRouterExecuteAbi,
    data: calldata as Hex,
  });

  return { calldata: calldata as Hex, value: BigInt(value), decoded };
}

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk?.startsWith("0x")) throw new Error("PRIVATE_KEY must be 0x-prefixed in env");
  const account = privateKeyToAccount(pk as `0x${string}`);
  const rpcUrl = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
  const chain: Chain = { ...sepolia, rpcUrls: { default: { http: [rpcUrl] } } };
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });

  const tokenAddr = process.env.SEPOLIA_TOKEN ? getAddress(process.env.SEPOLIA_TOKEN) : DEFAULT_TOKEN;
  const poolFee = Number(process.env.V4_POOL_FEE ?? "3000");
  const tickSpacing = Number(process.env.V4_TICK_SPACING ?? "60");
  const hooks = process.env.V4_HOOKS
    ? getAddress(process.env.V4_HOOKS)
    : getAddress("0x0000000000000000000000000000000000000000");

  const quoteRaw = getArg("quote-weth-wei", "0");
  if (!quoteRaw || !/^\d+$/.test(quoteRaw)) {
    throw new Error("--quote-weth-wei must be non-negative integer (wei), or omit for 0");
  }
  const quoteWethWei = BigInt(quoteRaw);

  const amountWeiOpt = getArg("amount-wei", "");
  const chunkWeiOpt = getArg("chunk-wei", "");
  const singleTxSellAll = hasArg("single-tx");
  const dustRaw = getArg("dust-wei", "0");
  if (!dustRaw || !/^\d+$/.test(dustRaw)) {
    throw new Error("--dust-wei must be a non-negative integer (wei), default 0");
  }
  const dustWei = BigInt(dustRaw);

  const slippageBps = Number(getArg("slippage-bps", "100") ?? "100");
  const dryRun = hasArg("dry-run");
  const skipPrecall = hasArg("skip-precall");

  if (amountWeiOpt && chunkWeiOpt) {
    throw new Error("Use either --amount-wei or --chunk-wei, not both");
  }
  if (singleTxSellAll && chunkWeiOpt) {
    throw new Error("Use either --single-tx or --chunk-wei, not both");
  }
  if (singleTxSellAll && amountWeiOpt) {
    throw new Error("--single-tx only applies when omitting --amount-wei");
  }

  const wethToken = WETH9[CHAIN_ID];
  const ethCurrency = Ether.onChain(CHAIN_ID);
  const tokenIn = new Token(CHAIN_ID, tokenAddr, 18, "SUV4", "SUV4");
  const poolKey = V4Pool.getPoolKey(ethCurrency, tokenIn, poolFee, tickSpacing, hooks);
  const zeroForOne = tokenAddr.toLowerCase() === poolKey.currency0.toLowerCase();
  const outputCurrency = ethCurrency;

  const universalRouter = getAddress(UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V2_0, CHAIN_ID) as string);

  async function readBalance(): Promise<bigint> {
    return publicClient.readContract({
      address: tokenAddr,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    });
  }

  async function runOne(
    amountInWei: bigint,
  ): Promise<{ txHash: Hex; blockNumber: string; amountInWei: string } | "dry-run"> {
    if (amountInWei <= 0n) throw new Error("Sell amount must be > 0");
    let bal = await readBalance();
    if (amountInWei > bal) throw new Error("Sell amount exceeds balance");

    if (dryRun) {
      const ctx: BuildSwapParams = {
        amountInWei,
        tokenIn,
        outputCurrency,
        wethToken,
        poolKey,
        zeroForOne,
        tokenAddr,
        quoteWethWei,
        slippageBps,
        recipient: account.address,
      };
      const { calldata } = buildSwap(ctx);
      console.log(
        JSON.stringify(
          {
            dryRun: true,
            account: account.address,
            universalRouter,
            amountInWei: amountInWei.toString(),
            quoteWethWei: quoteWethWei.toString(),
            poolKey,
            zeroForOne,
            calldata,
          },
          null,
          2,
        ),
      );
      return "dry-run";
    }

    let attempt = amountInWei;
    let calldata!: Hex;
    let value!: bigint;
    let decoded!: ReturnType<typeof decodeFunctionData>;

    const doPrecall = !skipPrecall;
    let simulatedOk = !doPrecall;

    for (let i = 0; i < 48; i++) {
      bal = await readBalance();
      if (attempt > bal) attempt = bal;
      if (attempt <= 0n) {
        console.error("eth_call: amount backed off to 0 (insufficient balance)");
        process.exit(1);
      }

      const ctx: BuildSwapParams = {
        amountInWei: attempt,
        tokenIn,
        outputCurrency,
        wethToken,
        poolKey,
        zeroForOne,
        tokenAddr,
        quoteWethWei,
        slippageBps,
        recipient: account.address,
      };
      ({ calldata, value, decoded } = buildSwap(ctx));

      if (!doPrecall) {
        simulatedOk = true;
        break;
      }

      try {
        await publicClient.call({
          account,
          to: universalRouter,
          data: calldata,
          value,
        });
        simulatedOk = true;
        break;
      } catch (e: unknown) {
        const msg =
          e && typeof e === "object" && "shortMessage" in e ? String((e as { shortMessage: string }).shortMessage) : String(e);
        const transferFail = msg.includes("TRANSFER_FROM_FAILED");
        if (!transferFail || attempt <= MIN_SELL_BACKOFF_WEI) {
          console.error("eth_call simulation failed (tx would likely revert):", msg);
          process.exit(1);
        }
        const next = attempt / 2n;
        attempt = next < MIN_SELL_BACKOFF_WEI ? MIN_SELL_BACKOFF_WEI : next;
      }
    }

    if (!simulatedOk) {
      console.error("eth_call: could not find a simulable amount after backoff (TRANSFER_FROM_FAILED)");
      process.exit(1);
    }

    if (attempt !== amountInWei) {
      console.warn(`Note: reduced sell amount from ${amountInWei} to ${attempt} wei after simulation backoff`);
    }

    const h1 = await ensureErc20Approval(
      wallet,
      publicClient,
      account,
      chain,
      tokenAddr,
      account.address,
      PERMIT2,
      attempt,
    );
    if (h1) await waitForSuccessfulTransactionReceipt({ client: publicClient, hash: h1, label: "erc20 approve" });
    const h2 = await ensurePermit2RouterAllowance(
      wallet,
      publicClient,
      account,
      chain,
      account.address,
      tokenAddr,
      universalRouter,
      attempt,
    );
    if (h2) {
      await waitForSuccessfulTransactionReceipt({ client: publicClient, hash: h2, label: "permit2 approve" });
    }

    const hash = await wallet.writeContract({
      account,
      chain,
      address: universalRouter,
      abi: universalRouterExecuteAbi,
      functionName: decoded.functionName as "execute",
      args:
        decoded.args.length === 3
          ? (decoded.args as readonly [Hex, Hex[], bigint])
          : (decoded.args as readonly [Hex, Hex[]]),
      value,
    });
    const receipt = await waitForSuccessfulTransactionReceipt({ client: publicClient, hash, label: "swap" });
    return { txHash: hash, blockNumber: receipt.blockNumber.toString(), amountInWei: attempt.toString() };
  }

  const useChunkedSellAll = !amountWeiOpt && (!singleTxSellAll || !!chunkWeiOpt);
  if (useChunkedSellAll) {
    let chunkMax: bigint;
    if (chunkWeiOpt) {
      if (!/^[1-9]\d*$/.test(chunkWeiOpt)) throw new Error("--chunk-wei must be a positive integer (wei)");
      chunkMax = BigInt(chunkWeiOpt);
    } else {
      const raw = process.env.SEPOLIA_SWAP_SELL_CHUNK_WEI?.trim();
      chunkMax = raw && /^[1-9]\d*$/.test(raw) ? BigInt(raw) : DEFAULT_SELL_ALL_CHUNK_WEI;
    }
    const txs: { txHash: Hex; blockNumber: string; amountInWei: string }[] = [];
    for (;;) {
      const balance = await readBalance();
      if (balance <= dustWei) break;
      const rawTarget = balance < chunkMax ? balance : chunkMax;
      const amountInWei = applySellAllWeiMargin(balance, rawTarget);
      if (amountInWei <= 0n) break;
      const r = await runOne(amountInWei);
      if (r === "dry-run") return;
      txs.push(r);
    }
    console.log(JSON.stringify({ ok: true, mode: "chunked", chunkMaxWei: chunkMax.toString(), txs }, null, 2));
    return;
  }

  const balance = await readBalance();
  let amountInWei: bigint;
  if (amountWeiOpt) {
    if (!/^[1-9]\d*$/.test(amountWeiOpt)) throw new Error("--amount-wei invalid");
    amountInWei = BigInt(amountWeiOpt);
  } else {
    amountInWei = applySellAllWeiMargin(balance, balance);
  }
  if (amountInWei <= 0n) throw new Error("Sell amount must be > 0 (check token balance)");
  if (amountInWei > balance) throw new Error("Sell amount exceeds balance");

    const r = await runOne(amountInWei);
    if (r === "dry-run") return;
    console.log(
      JSON.stringify(
        {
          ok: true,
          txHash: r.txHash,
          blockNumber: r.blockNumber,
          amountInWei: r.amountInWei,
        },
        null,
        2,
      ),
    );
}

await main();
