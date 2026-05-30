# Post-Graduation Uniswap v4 Sell-Tax Hook

## 1. Goal

After an EULR token graduates from the bonding curve, liquidity is migrated into
Uniswap v4. At that point, token sells should be taxed by a Uniswap v4 hook
instead of by the pre-graduation bonding-curve hook.

This document specifies the contract, deployment, and verification work needed to
support that post-graduation v4 sell tax.

## 1.1 Current Status

This document describes the earlier single sell-tax-hook direction. The current
implementation has generalized that idea into profile-backed v4 hook migration:

- `EulrFactory` can register `V4MigrationProfile` entries containing a
  migration target, v4 hook address, pool fee, tick spacing, tick range, hook
  data hash, and active flag.
- `createTokenWithV4MigrationProfile` and
  `createTokenAndBuyWithV4MigrationProfile` bind a curve-first launch to a
  future v4 hook profile.
- The created `EulrHook` uses the profile-specific `migrationTarget`, so the
  eventual `migrateLiquidity(bytes)` call can route through a target configured
  for the selected hook.
- `TokenV4MigrationProfileBound` gives indexers and CLIs the token, profile id,
  hook address, and migration target.
- The old fixed sell-tax hook is now best understood as one possible
  `V4MigrationProfile` and hook template, not the only post-graduation hook path.

The remaining post-graduation gap is a full end-to-end migration test from a
profile-backed curve launch into `UniswapV4MintPositionTarget`. Current anvil
coverage verifies profile registration/creation and verifies all 10 hook
templates independently against local PoolManager swaps.

## 2. Product Model

Before graduation:

- Users trade against `EulrHook` and the bonding curve.
- Curve-phase burn tax is disabled.
- Buy and sell quotes still expose legacy burn-tax fields for compatibility, but
  values must be zero.

After graduation:

- Liquidity is migrated to a Uniswap v4 pool.
- Buys through the v4 pool are not taxed.
- Exact-input EULR sells through the v4 pool are taxed by the v4 hook.
- Taxed EULR is sent to `0x000000000000000000000000000000000000dEaD`.

## 3. Non-Goals

- Do not build a new frontend v4 swap UI in this phase.
- Do not change backend quote routing for post-graduation Uniswap swaps in this
  phase.
- Do not keep the old curve burn tax active as a fallback.
- Do not modify this plan while implementing it.

## 4. Hook Behavior

The v4 hook is responsible only for post-graduation pool swaps.

### Taxable Swap

A swap is taxable when all of the following are true:

- The caller is the configured Uniswap v4 `PoolManager`.
- The pool is a native OKB / EULR pool.
- The EULR token is the exact-input token.
- The swap is an exact-input swap.

For taxable swaps:

- Compute `taxAmount = amountSpecified * taxBps / 10_000`.
- The pool receives the net token input.
- The taxed amount is transferred or accounted to the dead address.
- Emit a sell-tax event with the token, pool, gross amount, tax bps, tax amount,
  and net amount.

### Non-Taxable Swap

The hook must not tax:

- Native OKB to EULR buys.
- Swaps for unrelated pools.
- Swaps involving unsupported EULR pool shape.

### Unsupported Exact-Output Sell

Exact-output EULR sells should revert. The hook only supports exact-input sell
tax accounting.

## 5. Tax Rate Model

The tax is based on the current pool tick and clamped to configured bounds.

Configuration:

- `minTaxBps`
- `maxTaxBps`
- `taxLowTick`
- `taxHighTick`

Rules:

- At or below `taxLowTick`, use `maxTaxBps`.
- At or above `taxHighTick`, use `minTaxBps`.
- Between the two ticks, linearly interpolate from max tax down to min tax.
- Validate that `minTaxBps <= maxTaxBps`.
- Validate that both tax bps values are at most `10_000`.
- Validate that `taxLowTick < taxHighTick`.

## 6. Contract Changes

### New Contracts

Add:

- `src/v4/EulrV4SellTaxHook.sol`
- `src/v4/EulrV4SellTaxHookDeployer.sol`

`EulrV4SellTaxHook` should implement the Uniswap v4 hook permissions:

- `beforeSwap = true`
- `beforeSwapReturnDelta = true`

`EulrV4SellTaxHookDeployer` should be a minimal `CREATE2` deployer used to deploy
the hook at an address with the required Uniswap v4 hook permission bits.

### Existing Contracts

Update `src/curve/Curve.sol`:

- `quoteBuy` returns `burnTaxBps = 0`.
- `quoteBuy` returns `burnTaxTokens = 0`.
- `quoteSell` returns `burnTaxBps = 0`.
- `quoteSell` returns `burnTaxTokens = 0`.
- Effective sell input equals gross sell input.

Update `src/hook/EulrHook.sol`:

- Stop incrementing `taxBurnedTokens` during buy/sell.
- Migration token amount should no longer subtract tax-burned supply.
- Keep public fields/events compatible where possible.

Update `UniswapV4MintPositionTarget` tests and migration config handling:

- The migration target must accept the configured sell-tax hook address.
- Unauthorized hook addresses should still be rejected.

## 7. TypeScript Tooling

### Curve Quote Helper

Update `ts/lib/curve-quote.ts`:

- `burnTaxBpsAtOkbCum` always returns `0`.
- `quoteBuyAtOkbCum` returns gross tokens as net tokens.
- `quoteSellAtOkbCum` uses full token input as effective input.
- Legacy nonzero burn-tax params must not re-enable curve burn tax.

### Default Params

Update `ts/config/params.ts`:

- `burnTaxMinBps = 0`
- `burnTaxMaxBps = 0`

### ABI Export

Update ABI export tooling:

- Export `EulrV4SellTaxHook`.
- Preserve existing deployment address maps when no fresh deployment records are
  present.
- Export ABI bundles for root/frontend/backend consumers.

### Hook Address Mining

Add `ts/lib/v4-hook-miner.ts`:

- Mine a `CREATE2` salt for the hook deployment.
- Require an exact match of the Uniswap v4 hook permission mask.
- The target bits are `BEFORE_SWAP_FLAG | BEFORE_SWAP_RETURNS_DELTA_FLAG`.

### Deployment Script

Add `ts/deploy/00-deploy-v4-sell-tax-hook.ts`:

- Read `UNISWAP_V4_POOL_MANAGER`.
- Deploy `EulrV4SellTaxHookDeployer`.
- Build hook init code.
- Mine salt.
- Deploy the hook via `CREATE2`.
- Print the hook address and an `XLAYER_V4_HOOKS` env snippet.

### Anvil Config Smoke

Add `ts/cli/smoke-v4-sell-tax-config-anvil.ts`:

- Deploy the v4 sell-tax hook.
- Deploy the migration target with the mined hook address.
- Run migration target doctor checks.
- Assert the recorded migration pool hook equals the mined hook.

## 8. Backend Integration

Update backend curve quote logic to match contracts:

- Curve burn tax must be zero even if legacy params are nonzero.
- Keep API response fields for compatibility.
- Do not remove `burnTaxSupported`, `burnTaxBps`, `burnTaxTokens`, or
  `effectiveTokensIn` response fields.

The frontend should decide whether to display burn tax based on actual
`burnTaxTokens`, not merely `burnTaxSupported`.

## 9. Frontend Integration

Update quote breakdown behavior:

- If `burnTaxTokens > 0`, show gross/tax/net rows.
- If `burnTaxTokens == 0`, hide the burn-tax rows.
- Preserve nonzero burn-tax display compatibility for historical or unexpected
  responses.
- Do not add a v4 swap UI in this phase.

## 10. Tests

### Solidity

Add `test/v4/EulrV4SellTaxHook.t.sol` covering:

- Exact-input EULR sells are taxed.
- Pool receives net input.
- Tax is sent/accounted to the dead address.
- Native OKB buys are not taxed.
- Exact-output sells revert.
- Unsupported or unauthorized pools revert.
- Tax bps clamps and interpolates by tick.

Update curve tests:

- Default params disable curve burn tax.
- Buy quote returns gross as net token output.
- Sell quote uses full token input without burn tax.
- Burn tax remains zero near graduation.

Update migration tests:

- Configured sell-tax hook address is accepted.
- Unapproved hook address is rejected.

### TypeScript

Add or update tests for:

- `curve-quote` zero burn-tax behavior.
- Legacy nonzero burn-tax params being ignored.
- v4 hook miner exact permission bits.
- ABI export including `EulrV4SellTaxHook`.
- ABI export preserving existing address snapshots.
- v4 sell-tax config Anvil smoke script wiring.

### Backend

Add or update tests for:

- Backend curve quotes return zero burn tax.
- Legacy nonzero burn-tax params do not affect backend quotes.

### Frontend

Add or update tests for:

- Mint quote with zero burn-tax amount hides burn-tax rows.
- Burn quote with zero burn-tax amount hides burn-tax rows.
- Nonzero burn-tax responses still show gross/tax/net rows.

## 11. Verification Commands

Run focused contract checks:

```bash
forge fmt --check
forge build
forge test --match-path 'test/v4/*' -vvv
forge test --match-path 'test/unit/Curve.t.sol' -vv
forge test --match-path 'test/unit/UniswapV4MintPositionTarget.t.sol' -vv
```

Run broader contract checks:

```bash
forge test --match-path 'test/integration/*'
forge test --match-path 'test/invariant/*'
```

Run root TypeScript checks:

```bash
npm run export:abis
npm run test:ts
```

Run backend checks:

```bash
cd backend
npm run test:node
npm run typecheck
```

Run frontend checks:

```bash
cd web
node --import tsx --test 'src/**/*.test.ts'
npx tsc --noEmit
npm run build
```

Run Anvil smokes:

```bash
PRIVATE_KEY=<anvil-private-key> \
DEPLOYMENT_NETWORK=anvil \
TEAM_MULTISIG=<anvil-account> \
npm run smoke:anvil
```

```bash
PRIVATE_KEY=<anvil-private-key> \
DEPLOYMENT_NETWORK=anvil \
TEAM_MULTISIG=<anvil-account> \
UNISWAP_V4_POOL_MANAGER=<local-or-real-pool-manager> \
UNISWAP_V4_POSITION_MANAGER=<local-or-real-position-manager> \
npm run smoke:anvil:v4-sell-tax-config
```

## 12. Acceptance Criteria

- Curve-phase burn tax is disabled in Solidity and TypeScript.
- Backend quote logic reports zero burn tax for curve trades.
- Frontend hides burn-tax rows when tax amount is zero.
- V4 sell-tax hook taxes exact-input post-graduation EULR sells.
- V4 buys are untaxed.
- Exact-output EULR sells through the hook revert.
- Hook deployment script mines an address with exact required permission bits.
- Migration target records and validates the configured hook address.
- ABI export includes `EulrV4SellTaxHook` without wiping deployment maps.
- Foundry, TypeScript, backend, frontend, and Anvil verification commands pass.
