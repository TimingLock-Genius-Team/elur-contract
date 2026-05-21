import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// CJS export: callable factory `Decimal(x)` (NodeNext + decimal.mjs default typing conflicts).
const Decimal = require("decimal.js") as {
  (n: string | number | bigint): import("decimal.js").Decimal;
};

/** Mirrors `backend/src/lib/curve.ts` for TS CLIs (`create-token-and-buy`, quotes). */
export const WAD = 1_000_000_000_000_000_000n;
const WAD_DECIMAL = Decimal(WAD.toString());
const MAX_EXPONENT_INPUT = Decimal(1_000);

export type CurveParams = {
  k: string;
  s: string;
  feeBps: number;
  burnTaxMinBps: number;
  burnTaxMaxBps: number;
  selfDeprecationBps: number;
  maxBuyOkb: string;
};

export type CurvePoint = {
  okbCum: bigint;
  currentPriceOkb: bigint;
  totalMinted: bigint;
};

export function curveParamsForS(base: CurveParams, curveS: number): CurveParams {
  if (!Number.isInteger(curveS) || curveS < 1 || curveS > 1000) {
    throw new Error(`Invalid curveS: ${curveS}`);
  }
  return { ...base, s: (BigInt(curveS) * WAD).toString() };
}

function wadToDecimal(value: bigint): import("decimal.js").Decimal {
  return Decimal(value.toString()).div(WAD_DECIMAL);
}

function toWad(value: import("decimal.js").Decimal): bigint {
  if (!value.isFinite()) {
    throw new Error("Curve calculation exceeded supported numeric range");
  }
  if (value.isNegative() || value.isZero()) return 0n;

  const scaled = value.mul(WAD_DECIMAL).floor();
  if (!scaled.isFinite()) {
    throw new Error("Curve calculation exceeded supported numeric range");
  }
  return BigInt(scaled.toFixed(0));
}

export function deriveCurvePoint(okbCum: bigint, params: CurveParams): CurvePoint {
  const s = BigInt(params.s);
  const okb = wadToDecimal(okbCum);
  const sUnits = wadToDecimal(s);
  const kUnits = wadToDecimal(BigInt(params.k));
  const exponentInput = okb.div(sUnits);
  if (exponentInput.gt(MAX_EXPONENT_INPUT)) {
    throw new Error("Curve calculation exceeded supported numeric range");
  }
  const exponent = exponentInput.exp();

  const mintedUnits = kUnits.mul(Decimal(1).minus(exponentInput.neg().exp()));
  const priceUnits = sUnits.div(kUnits).mul(exponent);

  return {
    okbCum,
    currentPriceOkb: toWad(priceUnits),
    totalMinted: toWad(mintedUnits),
  };
}

function okbAtMinted(minted: bigint, params: CurveParams): bigint {
  const k = BigInt(params.k);
  if (minted >= k) {
    throw new Error("minted amount must be below curve cap");
  }
  if (minted <= 0n) {
    return 0n;
  }

  const ratio = wadToDecimal(k).div(wadToDecimal(k - minted));
  return toWad(wadToDecimal(BigInt(params.s)).mul(ratio.ln()));
}

export function burnTaxBpsAtOkbCum(okbCum: bigint, params: CurveParams): number {
  const minted = deriveCurvePoint(okbCum, params).totalMinted;
  const threshold = (BigInt(params.k) * BigInt(params.selfDeprecationBps)) / 10000n;
  if (threshold <= 0n) {
    throw new Error("selfDeprecationBps must be positive");
  }
  if (minted >= threshold) {
    return params.burnTaxMinBps;
  }

  const taxRange = BigInt(params.burnTaxMaxBps - params.burnTaxMinBps);
  const taxDrop = (minted * taxRange) / threshold;
  return Number(BigInt(params.burnTaxMaxBps) - taxDrop);
}

/** Mirrors on-chain `Curve.quoteBuy`. */
export function quoteBuyAtOkbCum(
  okbCum: bigint,
  grossOkbIn: bigint,
  params: CurveParams,
): {
  fee: bigint;
  effectiveOkbIn: bigint;
  newOkbCum: bigint;
  grossTokensOut: bigint;
  burnTaxBps: number;
  burnTaxTokens: bigint;
  tokensOut: bigint;
} {
  const maxBuy = BigInt(params.maxBuyOkb);
  if (grossOkbIn > maxBuy) {
    throw new Error("gross OKB in exceeds curve maxBuyOkb");
  }
  if (grossOkbIn <= 0n) {
    throw new Error("gross OKB in must be positive");
  }
  const feeBps = BigInt(params.feeBps);
  const fee = (grossOkbIn * feeBps) / 10000n;
  const effectiveOkbIn = grossOkbIn - fee;
  if (effectiveOkbIn <= 0n) {
    throw new Error("effective OKB in must be positive");
  }
  const newOkbCum = okbCum + effectiveOkbIn;
  const oldMinted = deriveCurvePoint(okbCum, params).totalMinted;
  const newMinted = deriveCurvePoint(newOkbCum, params).totalMinted;
  const grossTokensOut = newMinted - oldMinted;
  const burnTaxBps = burnTaxBpsAtOkbCum(okbCum, params);
  const burnTaxTokens = (grossTokensOut * BigInt(burnTaxBps)) / 10000n;
  return {
    fee,
    effectiveOkbIn,
    newOkbCum,
    grossTokensOut,
    burnTaxBps,
    burnTaxTokens,
    tokensOut: grossTokensOut - burnTaxTokens,
  };
}

export function quoteSellAtOkbCum(
  okbCum: bigint,
  tokensIn: bigint,
  params: CurveParams,
): {
  tokensIn: bigint;
  grossOkbOut: bigint;
  fee: bigint;
  netOkbOut: bigint;
  oldOkbCum: bigint;
  newOkbCum: bigint;
  oldMinted: bigint;
  newMinted: bigint;
  burnTaxBps: number;
  burnTaxTokens: bigint;
  effectiveTokensIn: bigint;
} {
  if (tokensIn <= 0n) {
    throw new Error("tokens in must be positive");
  }

  const oldMinted = deriveCurvePoint(okbCum, params).totalMinted;
  const burnTaxBps = burnTaxBpsAtOkbCum(okbCum, params);
  const burnTaxTokens = (tokensIn * BigInt(burnTaxBps)) / 10000n;
  const effectiveTokensIn = tokensIn - burnTaxTokens;
  if (effectiveTokensIn > oldMinted) {
    throw new Error("effective tokens in exceeds curve minted amount");
  }

  const newMinted = oldMinted - effectiveTokensIn;
  const newOkbCum = okbAtMinted(newMinted, params);
  const grossOkbOut = okbCum - newOkbCum;
  const fee = (grossOkbOut * BigInt(params.feeBps)) / 10000n;
  return {
    tokensIn,
    grossOkbOut,
    fee,
    netOkbOut: grossOkbOut - fee,
    oldOkbCum: okbCum,
    newOkbCum,
    oldMinted,
    newMinted,
    burnTaxBps,
    burnTaxTokens,
    effectiveTokensIn,
  };
}
