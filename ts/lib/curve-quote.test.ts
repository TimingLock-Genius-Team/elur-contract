import assert from "node:assert/strict";
import test from "node:test";
import {
  burnTaxBpsAtOkbCum,
  curveParamsForS,
  deriveCurvePoint,
  quoteBuyAtOkbCum,
  quoteSellAtOkbCum,
} from "./curve-quote.js";

const params = {
  k: "21000000000000000000000000",
  s: "100000000000000000000",
  feeBps: 30,
  burnTaxMinBps: 0,
  burnTaxMaxBps: 0,
  selfDeprecationBps: 8000,
  maxBuyOkb: "10000000000000000000",
};

test("deriveCurvePoint matches backend fixture at small okbCum", () => {
  const point = deriveCurvePoint(1n, params);
  assert.equal(point.totalMinted, 210000n);
});

test("quoteBuyAtOkbCum matches minted delta at okbCum zero", () => {
  const gross = 1_000_000_000_000_000_000n;
  const { fee, effectiveOkbIn, grossTokensOut, burnTaxBps, burnTaxTokens, tokensOut } =
    quoteBuyAtOkbCum(0n, gross, params);
  assert.equal(fee, 3_000_000_000_000_000n);
  assert.equal(effectiveOkbIn, gross - fee);
  const mint0 = deriveCurvePoint(0n, params).totalMinted;
  const mint1 = deriveCurvePoint(effectiveOkbIn, params).totalMinted;
  assert.equal(grossTokensOut, mint1 - mint0);
  assert.equal(burnTaxBps, 0);
  assert.equal(burnTaxTokens, 0n);
  assert.equal(tokensOut, grossTokensOut);
});

test("burnTaxBpsAtOkbCum stays zero through graduation", () => {
  const low = burnTaxBpsAtOkbCum(0n, params);
  const thresholdMinted = (BigInt(params.k) * BigInt(params.selfDeprecationBps)) / 10000n;
  const nearGraduation = deriveCurvePoint(400_000_000_000_000_000_000n, params);

  assert.equal(low, 0);
  assert.ok(nearGraduation.totalMinted > thresholdMinted);
  assert.equal(burnTaxBpsAtOkbCum(nearGraduation.okbCum, params), 0);
});

test("burnTaxBpsAtOkbCum ignores legacy nonzero burn tax params", () => {
  const legacyParams = { ...params, burnTaxMinBps: 100, burnTaxMaxBps: 1000 };

  assert.equal(burnTaxBpsAtOkbCum(0n, legacyParams), 0);
  assert.equal(quoteBuyAtOkbCum(0n, 1_000_000_000_000_000_000n, legacyParams).burnTaxTokens, 0n);
});

test("quoteSellAtOkbCum uses full token input without curve burn tax", () => {
  const buy = quoteBuyAtOkbCum(0n, 1_000_000_000_000_000_000n, params);
  const sell = quoteSellAtOkbCum(buy.newOkbCum, buy.tokensOut / 4n, params);

  assert.equal(sell.burnTaxBps, 0);
  assert.equal(sell.burnTaxTokens, 0n);
  assert.equal(sell.effectiveTokensIn, sell.tokensIn);
  assert.ok(sell.grossOkbOut > sell.netOkbOut);
  assert.equal(sell.fee, (sell.grossOkbOut * BigInt(params.feeBps)) / 10000n);
});

test("quoteBuyAtOkbCum respects curveParamsForS slope", () => {
  const base = { ...params };
  const p25 = curveParamsForS(base, 25);
  const p100 = curveParamsForS(base, 100);
  const g = 1_000_000_000_000_000_000n;
  const o25 = quoteBuyAtOkbCum(0n, g, p25).tokensOut;
  const o100 = quoteBuyAtOkbCum(0n, g, p100).tokensOut;
  assert.ok(o25 > o100);
});

test("deriveCurvePoint rejects non-finite curve outputs", () => {
  assert.throws(
    () => deriveCurvePoint(10n ** 80n, params),
    /Curve calculation exceeded supported numeric range/,
  );
});
