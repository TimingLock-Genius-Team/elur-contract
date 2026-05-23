# Post-Graduation Uniswap V4 Sell Tax Hook

This document describes the first implementation target for moving Eulr burn-tax behavior out of the bonding curve and into the graduated Uniswap v4 pool.

The goal is chain-enforced post-graduation sell tax:

- Pre-graduation bonding curve trades should not charge burn tax.
- After graduation and migration, the Uniswap v4 pool should enforce tax on EULR sells.
- The tax applies only to exact-input sells from EULR to OKB.
- Taxed EULR is sent to `0x000000000000000000000000000000000000dEaD`.
- Wallet transfers, buys, adds/removes liquidity, and non-EULR pools are outside this v1 tax scope.

## Current Architecture

Graduation and migration already have the correct high-level shape for a v4 hook pool.

`EulrHook.migrateLiquidity()` sends native OKB and newly minted EULR to the configured migration target after `selfDeprecated` is true. The production migration target, `UniswapV4MintPositionTarget`, decodes `migrationData`, validates an allowlisted PoolKey, and mints a Uniswap v4 LP position through the PositionManager.

The important field is:

```text
MigrationData.Params.hooks
```

That value becomes the Uniswap v4 PoolKey hook address. Today the expected hook is normally `address(0)`. For post-graduation tax, the migration target must instead require the deployed `EulrV4SellTaxHook` address.

Once a pool is initialized, its hook address is fixed by the PoolKey. This means the tax hook must be configured before migration. It cannot be added later to the same pool.

## V1 Scope

V1 should implement only these hook callbacks:

```text
beforeSwap
beforeSwapReturnDelta
```

The hook should not implement the exact-output path in v1. If a sell attempts exact-output semantics, the hook should revert.

This keeps the first version auditable:

- User says "sell this much EULR."
- Hook calculates tax from that input amount.
- Pool swaps only the remaining net EULR.
- Tax EULR is sent to `0xdead`.

## Pool Assumptions

The migrated pool should use:

```text
currency0 = native OKB
currency1 = EULR token
hooks     = EulrV4SellTaxHook
```

Under that PoolKey:

- Buy EULR: `zeroForOne = true`, OKB to EULR, no tax.
- Sell EULR: `zeroForOne = false`, EULR to OKB, tax applies.

The hook should validate that the pool is one of the Eulr migrated pools it supports. At minimum, v1 should require:

- `key.currency0` is native OKB.
- `key.currency1` is an Eulr token, or the pool is registered/allowlisted.
- `key.hooks` is this hook.

The registry choice can be simple at first: a mapping of authorized EULR token addresses or PoolIds configured by the migration target/deployer.

## Tax Rate Model

The product rule is:

- Lower price means higher sell tax.
- Higher price means lower sell tax.

Use pool tick as the source of truth because v4 pools price through ticks.

Recommended parameters:

```text
minTaxBps = 100      // 1%
maxTaxBps = 1000     // 10%
taxLowTick           // at or below this tick, use maxTaxBps
taxHighTick          // at or above this tick, use minTaxBps
```

Interpolation:

```text
if currentTick <= taxLowTick:
    taxBps = maxTaxBps
else if currentTick >= taxHighTick:
    taxBps = minTaxBps
else:
    progress = (currentTick - taxLowTick) / (taxHighTick - taxLowTick)
    taxBps = maxTaxBps - progress * (maxTaxBps - minTaxBps)
```

This matches the intended behavior from `update.md`, but only after graduation and only on sell pressure.

## Hook Flow

### 1. `beforeSwap`

`beforeSwap` identifies whether the swap is taxable.

Taxable conditions:

```text
params.zeroForOne == false
params.amountSpecified < 0
```

Meaning:

- `zeroForOne == false`: user is swapping `currency1` into `currency0`, so EULR to OKB.
- `amountSpecified < 0`: exact-input swap, so the EULR input amount is known before swap execution.

For taxable swaps, the hook:

1. Reads current pool tick.
2. Calculates `taxBps`.
3. Calculates `taxAmount = inputAmount * taxBps / 10_000`.
4. Returns a before-swap delta that reduces the amount sent into the pool from `inputAmount` to `inputAmount - taxAmount`.

For non-taxable swaps, the hook returns zero delta.

For exact-output EULR sells, the hook reverts:

```text
params.zeroForOne == false
params.amountSpecified > 0
```

Exact-output support can be added later with `afterSwap` accounting, but it should not be part of v1.

### 2. `beforeSwapReturnDelta`

The hook must enable before-swap return deltas so the PoolManager accounts for the tax amount separately from the pool's net input.

For an exact-input sell:

```text
grossEulrIn = 1,000 EULR
taxBps      = 500
taxAmount   = 50 EULR
netEulrIn   = 950 EULR
```

The pool receives pricing input equivalent to `950 EULR`. The remaining `50 EULR` is accounted to the hook and forwarded to:

```text
0x000000000000000000000000000000000000dEaD
```

Implementation must verify the exact sign conventions against the imported `v4-core` `BeforeSwapDelta` helpers. Conceptually, the hook's specified-currency delta should reduce the pool's exact-input amount by the tax amount without changing the swap type.

## Why Not Other Designs

### Dynamic LP Fee

Uniswap v4 dynamic LP fees can adjust the pool fee, but LP fee revenue belongs to LPs. It does not send EULR to `0xdead`, so it does not match the desired tax semantics.

### ERC-20 Transfer Tax

Adding transfer tax to `EulrToken` would also tax wallet transfers, LP operations, integrations, and possibly migration flows. The desired scope is narrower: only graduated-pool sells.

### Official Router Tax

Router-only tax is easy to bypass by calling other routers or the PoolManager. A v4 PoolKey hook is enforced for every swap through that pool.

## Contract Changes

### New `EulrV4SellTaxHook`

Add a new hook contract under `src/`, likely:

```text
src/v4/EulrV4SellTaxHook.sol
```

Responsibilities:

- Inherit or implement Uniswap v4 hook interfaces.
- Declare permissions for `beforeSwap` and `beforeSwapReturnDelta`.
- Validate supported pools.
- Compute sell tax from current tick.
- Return before-swap delta for exact-input sells.
- Send tax EULR to `0xdead`.
- Emit a tax event.

Suggested event:

```text
event SellTaxApplied(
    bytes32 indexed poolId,
    address indexed token,
    address indexed sender,
    uint16 taxBps,
    uint256 grossAmountIn,
    uint256 taxAmount,
    uint256 netAmountIn
);
```

### Uniswap V4 Dependencies

The repo currently uses minimal hand-written v4 interfaces for migration. Building a real hook needs v4 Solidity dependencies and remappings:

```text
v4-core
v4-periphery
```

The hook address must have the correct permission bits in the low address bits. Deployment should include a HookMiner/Create2 step to produce a valid address.

### Migration Target Wiring

Deploy a new `UniswapV4MintPositionTarget` with:

```text
expectedHooks = EulrV4SellTaxHook
```

Then update:

- `XLAYER_V4_HOOKS`
- `XLAYER_V4_HOOK_DATA`
- migration target deployment JSON
- frontend/backend ABI address exports
- readiness checks and deployment doctor expectations

The existing migration target has immutable allowlist fields, so changing hooks requires a new migration target deployment.

### Factory / Token Launch Wiring

The factory stores `migrationTarget`, and each launched token hook receives that value during creation.

For future launches, add or use an admin-controlled path so new tokens use the new migration target.

Existing tokens need separate analysis because their already-created `EulrHook` instances already store the old migration target.

## Pre-Graduation Cleanup

Because the chosen model is "tax starts after graduation", the bonding curve should not charge burn tax.

Implementation should remove or neutralize:

- `burnTaxMinBps`
- `burnTaxMaxBps`
- curve buy-side mint-then-burn tax
- curve sell-side effective-input tax
- `taxBurnedTokens`-based migration cap adjustment

For compatibility, the API can keep old burn-tax fields as zero for one release, but the contract behavior should not tax the curve phase.

## Backend And UI

Pre-graduation:

- Quote output should not show burn tax.
- `TradePanel` should behave like a normal curve buy/sell panel.

Post-migration:

- The current backend quote path rejects migrated tokens because trading has moved to Uniswap.
- Add a v4 quote path that knows the PoolKey and the hook tax formula.
- UI should show gross sell amount, tax amount to `0xdead`, net amount entering the pool, and estimated OKB out.
- Exact-output sell UI should be disabled until the hook supports it.

The hook remains the source of truth. Frontend and backend calculations are only for quoting/display.

## Testing Requirements

Contract tests:

- `beforeSwap` taxes only `EULR -> OKB` exact-input sells.
- `OKB -> EULR` buys are not taxed.
- exact-output sells revert.
- tax-rate interpolation clamps correctly at low/high ticks.
- tax amount is sent to `0xdead`.
- pool receives net input.
- unsupported pools revert or no-op according to the chosen registry policy.

Migration tests:

- migration target rejects an unexpected hook address.
- migration target accepts the tax hook address.
- migrated PoolKey contains `EulrV4SellTaxHook`.
- LP custody proof remains unchanged.

Regression tests:

- bonding curve buy has no burn tax.
- bonding curve sell has no burn tax.
- migration token amount is no longer reduced by curve-phase `taxBurnedTokens`.

Fork tests:

- deploy tax hook and migration target on the target network.
- graduate and migrate a token.
- execute a real exact-input v4 sell.
- assert `SellTaxApplied` emitted and `0xdead` receives EULR.

## Rollout Order

1. Add v4 Solidity dependencies and local hook test harness.
2. Implement `EulrV4SellTaxHook` exact-input sell tax.
3. Remove or neutralize pre-graduation curve burn tax.
4. Wire deployment scripts for hook mining and migration target deployment.
5. Update backend/frontend quote display.
6. Run Anvil end-to-end graduation, migration, and taxed v4 sell.
7. Run fork proof before production deployment.

## V1 Non-Goals

- No exact-output sell support.
- No buy tax.
- No wallet transfer tax.
- No true ERC-20 `burn()` from the v4 hook.
- No retroactive change to already-migrated pools.
- No automatic hook swap for existing PoolKeys.
