# Package Scripts Test Report

Generated: 2026-05-14T13:05:00Z

This report summarizes the `package.json` script sweep requested for the current testing phase. Private keys are intentionally omitted.

## Logs

- Safe/local matrix: `test-logs/package-scripts-safe.log`
- Anvil first pass: `test-logs/package-scripts-anvil-live.log`
- Anvil rerun after environment fixes: `test-logs/package-scripts-anvil-live-rerun.log`
- Anvil final fix verification: `test-logs/package-scripts-anvil-fixes.log`
- HashKey 133 live matrix: `test-logs/package-scripts-hashkeytest-live.log`
- HashKey 133 full multi-account smoke: `test-logs/hashkeytest-133-accounts-smoke.log`
- HashKey 133 small multi-account smoke: `test-logs/hashkeytest-133-accounts-smoke-small.log`

## Passed

The local verification group passed:

- `build`
- `test`
- `test:ts`
- `test:fuzz`
- `test:invariant`
- `test:fork:local`
- `coverage`
- `coverage:lcov`
- `coverage:95`
- `slither`
- `ci`
- `export:abis`
- `doctor:deployment -- --network hashkeytest`

Key results:

- Forge tests: `118` passed, `0` failed.
- TypeScript tests: passed.
- Coverage gate: line coverage `98.69%`, above the `95%` threshold.
- Slither: `0 result(s) found`.
- CI script: exit code `0`.

The Anvil broadcast group passed after setting Anvil-local environment values:

- `anvil`
- `script:check-chain`
- `deploy:anvil`
- `create-token`
- `inspect-token`
- `quote:buy`
- `buy`
- `quote:sell`
- `sell`
- `simulate:graduation`
- `migrate:liquidity`
- `claim:fees`
- `smoke:anvil`
- `smoke:anvil:accounts`
- `script:deploy-local`
- `script:create-token`
- `script:inspect-token`
- `script:quote-buy`
- `script:buy`
- `script:quote-sell`
- `script:sell`
- `script:simulate-graduation`
- `script:migrate-liquidity`
- `script:claim-fees`

The HashKey testnet `133` group passed for the current smoke scope:

- `deploy:hashkeytest`
- `create-token`
- `quote:buy`
- `buy`
- `quote:sell`
- `sell`
- `claim:fees`
- `smoke:hashkeytest:accounts -- --limit 2 --concurrency 2 --fund --buy-okb 0.001 --sell-tokens 1`

The full HashKey multi-account test also passed separately:

- Accounts: `61`
- Concurrency: `5`
- Per account flow: `buy -> approve -> sell`
- Failed accounts: `0`

## Remaining Issues

The XLayer-specific scripts were executed where safe, but failed because `XLAYER_RPC_URL` is not configured in the current local environment:

- `test:fork:xlayer`
- `script:verify-xlayer-addresses`
- `preflight:xlayer`
- `preflight:xlayer:readiness`
- `gate:xlayer`
- `doctor:xlayer-readiness`

These are configuration failures, not contract test failures.

The HashKey migration-target scripts failed because this temporary testnet setup does not define a real Uniswap v4 migration target configuration:

- `deploy:migration-target`: `UNISWAP_V4_POOL_MANAGER is required`
- `doctor:migration-target -- --network hashkeytest`: missing `deployments/hashkeytest/uniswap-v4-mint-position-target.json`

This is expected for the current HashKey 133 testing phase. Graduation has now been tested against the current `LocalMigrationTarget`, but real Uniswap v4 migration still requires a separate HashKey 133 configuration.

Standalone Forge `script:*` entries still read the ambient shell and `.env` for variables such as `FACTORY`, `TOKEN`, `RECIPIENT`, and `TEAM_MULTISIG`. When running those entries outside `smoke:anvil`, set Anvil-local values explicitly.

## Not Executed

`script:deploy-xlayer` was not executed. It is a production-style XLayer broadcast and verification script:

```bash
forge script script/DeployFactory.s.sol:DeployFactory --rpc-url $XLAYER_RPC_URL --broadcast --verify
```

Running it without explicit production deployment approval would be unsafe. All non-production and read/preflight equivalents were run or attempted.

## Notes

`DEP0205` Node warnings appeared repeatedly from the current `tsx`/Node runtime combination. They did not affect test or transaction results.
