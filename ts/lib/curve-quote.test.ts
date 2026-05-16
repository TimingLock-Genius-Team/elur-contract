import assert from "node:assert/strict";
import test from "node:test";
import { curveParamsForS, deriveCurvePoint, quoteBuyAtOkbCum } from "./curve-quote.js";

const params = {
  k: "21000000000000000000000000",
  s: "100000000000000000000",
  feeBps: 30,
  selfDeprecationBps: 8000,
  maxBuyOkb: "10000000000000000000",
};

test("deriveCurvePoint matches backend fixture at small okbCum", () => {
  const point = deriveCurvePoint(1n, params);
  assert.equal(point.totalMinted, 210000n);
});

test("quoteBuyAtOkbCum matches minted delta at okbCum zero", () => {
  const gross = 1_000_000_000_000_000_000n;
  const { fee, effectiveOkbIn, tokensOut } = quoteBuyAtOkbCum(0n, gross, params);
  assert.equal(fee, 3_000_000_000_000_000n);
  assert.equal(effectiveOkbIn, gross - fee);
  const mint0 = deriveCurvePoint(0n, params).totalMinted;
  const mint1 = deriveCurvePoint(effectiveOkbIn, params).totalMinted;
  assert.equal(tokensOut, mint1 - mint0);
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
