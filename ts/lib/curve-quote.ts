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

/** Mirrors on-chain `Curve.quoteBuy`. */
export function quoteBuyAtOkbCum(
  okbCum: bigint,
  grossOkbIn: bigint,
  params: CurveParams,
): {
  fee: bigint;
  effectiveOkbIn: bigint;
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
  return { fee, effectiveOkbIn, tokensOut: newMinted - oldMinted };
}
