# Eulr Curve, Graduation, Migration, and Launch Parameters

This document explains the user-facing mechanics of Eulr. It is a mechanism description, not a promise of profit, price support, redemption, or liquidity. On-chain behavior is defined by the contracts in `src/`.

## Quick Summary

| Topic | Rule |
| --- | --- |
| Graduation threshold | Implied minted supply from `okbCum` must reach `80% * K` by default (`selfDeprecationBps = 8000`). |
| Graduation trigger | A successful buy can set `selfDeprecated = true`; later buys are permanently closed. |
| Sells after graduation | Sells remain open, subject to reserve, slippage, and same-block protections. |
| Irreversibility | `selfDeprecated` never resets, even if later sells reduce `okbCum`. |
| Curve steepness | Creators may choose `curveS` in `1..1000`; omitting it uses `100`. |
| Migration | After graduation, any caller can trigger the one-time migration if it has not already succeeded. |

## Product Model

Each launched token has its own:

- ERC-20 token
- Hook that stores curve state, fees, graduation state, and migration state
- Router used by traders for buy and sell actions

Creators can set:

- `name`
- `symbol`
- `metadataURI`
- `socialURI`
- optional `curveS`

Creators cannot set or later modify:

- `K`
- `feeBps`
- `selfDeprecationBps`
- `maxBuyOkb`
- `feeRecipient`
- `migrationTarget`
- router or hook addresses
- user balances or reserves

## Curve State

The main curve state is:

```text
okbCum
```

`okbCum` is the cumulative net OKB that entered the curve after fees. Current price, implied minted supply, progress, and graduation are derived from this state and the token's `CurveParams`.

The curve is:

```text
minted(okbCum) = K * (1 - exp(-okbCum / S))
price(okbCum)  = (S / K) * exp(okbCum / S)
```

Where:

```text
K = 21,000,000 tokens
S = curveS * 1e18
feeBps = 30
selfDeprecationBps = 8000
maxBuyOkb = 10 OKB
```

`totalSupply()` is useful for ERC-20 accounting, but graduation should not be calculated from `totalSupply()` alone. Graduation uses implied minted supply derived from `okbCum`.

## CurveS

`curveS` controls the scale of the curve:

- Smaller `curveS`: steeper curve, faster progress, lower net OKB needed to reach graduation.
- Larger `curveS`: flatter curve, slower progress, deeper net OKB needed to reach graduation.

The factory exposes two creation paths:

```text
createToken(name, symbol, metadataURI, socialURI)
createToken(name, symbol, metadataURI, socialURI, curveS)
```

The 4-parameter path uses `curveS = 100`. The 5-parameter path requires `curveS` in `1..1000`.

Approximate net OKB needed to reach the default 80% threshold:

```text
okbCum = -S * ln(1 - 0.80)
       = S * 1.609...
```

| curveS | Approx net OKB to 80% | Interpretation |
| --- | ---: | --- |
| 1 | 1.6 OKB | Very steep; small absolute reserve at graduation. |
| 25 | 40.2 OKB | Steeper than default; useful for lower-threshold launches. |
| 100 | 160.9 OKB | Factory default. |
| 500 | 804.7 OKB | Flatter, requires deeper net demand. |
| 1000 | 1609.4 OKB | Flattest allowed setting. |

Fees and sell activity affect the real path. The table is only the theoretical net `okbCum` threshold.

## Buy Flow

A buy is exact-input OKB:

```text
grossOkbIn = msg.value
fee = grossOkbIn * feeBps / 10_000
effectiveOkbIn = grossOkbIn - fee
newOkbCum = oldOkbCum + effectiveOkbIn
tokensOut = totalMinted(newOkbCum) - totalMinted(oldOkbCum)
```

Successful buys:

- increase `okbCum` by the fee-adjusted input
- mint tokens to the recipient
- accrue fees to `claimableFeeOkb`
- record same-block sell protection for payer and recipient
- may set `selfDeprecated = true` when the implied threshold is reached

Production frontends and scripts must quote first and submit a non-zero `minTokensOut`.

## Sell Flow

A sell is exact-input token:

```text
oldMinted = totalMinted(okbCum)
newMinted = oldMinted - tokensIn
newOkbCum = okbAtMinted(newMinted)
grossOkbOut = okbCum - newOkbCum
fee = grossOkbOut * feeBps / 10_000
netOkbOut = grossOkbOut - fee
```

Successful sells:

- reduce `okbCum`
- burn sold tokens
- accrue fees to `claimableFeeOkb`
- transfer net OKB to the recipient

Sells can fail if the user has insufficient balance or allowance, if slippage protection is too strict, if the seller bought in the same block, or if the hook reserve cannot cover the payout.

## Graduation

Graduation is called self-deprecation in the contracts. The condition is:

```text
totalMinted(okbCum) >= K * selfDeprecationBps / 10_000
```

With default parameters, this is:

```text
totalMinted(okbCum) >= 80% * K
```

The buy that reaches the threshold still succeeds. After that:

- `selfDeprecated = true`
- future buys revert
- sells remain open
- fee claiming remains available
- graduation cannot be reset

User interfaces should display graduation from `curveState().selfDeprecated`, not from a hardcoded progress value.

## Migration

After graduation, any address can call:

```text
migrateLiquidity(migrationData)
```

The migration can only succeed once. The hook sends the migration target:

- native OKB balance minus `claimableFeeOkb`
- enough newly minted tokens to bring token supply up to `K`, if supply is below `K`

The migration target decodes and validates `migrationData`. The production target must validate pool parameters, deadline, amounts, liquidity, recipient or lock address, and Uniswap v4 dependencies.

A successful migration must return a non-zero pool or venue address and non-zero liquidity. If the target returns an invalid result or reverts, the migration transaction reverts atomically.

Hook migration events prove that the hook handed assets to the configured target. They do not by themselves prove that LP ownership was burned or locked. Production LP custody must be proven by the real migration adapter and fork tests.

## Reserve and Risk Notes

There are two different quantities users should not confuse:

- Curve layer: implied minted supply derived from `okbCum`, used for pricing and graduation.
- Asset layer: real native OKB held by the hook, minus unclaimed fees, used for sells and migration.

High progress does not mean every holder can exit at the displayed price. Exits are order-dependent, reserves can move as sells occur, and post-migration secondary market liquidity is separate from the bonding curve.

Avoid product language such as "the pool is full" or "holders are guaranteed an exit." Prefer: "the curve-implied minted supply has reached 80% of K, so buys are closed and migration can be triggered."

## Disclaimer

Eulr is a permissionless launch mechanism. Graduation and migration are not endorsements, audits, guarantees, buybacks, or price commitments. Users should verify the network, contract addresses, quotes, slippage, fees, reserves, graduation state, migration target, and secondary-market liquidity before trading.
