# Changelog

All notable changes to Eulr contract backend are tracked here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Added

- Product flow, commercial readiness, deployment runbook, and security model documentation.
- Root MIT license.
- Eulr backend rename across contracts, scripts, TypeScript artifact references, and documentation.
- Frontend-friendly reads: `EulrFactory.getTokens(offset, limit)`, `EulrHook.curveState()`, and creator-indexed `TokenCreated`.
- Pull-based fee accounting through `claimableFeeOkb` and `claimFees`.
- Solidity and TypeScript fee-claim scripts and inclusion of fee claim in the local smoke flow.
- Factory-side length limits for metadata and social URIs.
- Migration result validation so zero pool or zero liquidity results revert.
- Same-block sell protection extended to mark both buy payer and token recipient.
- Migration invalid-result rollback coverage for state and asset preservation.
- TypeScript deployment checks for configured external addresses.
- Forge XLayer deployment JSON output with external address code checks.
- Deployment provenance fields in deployment JSON: `commit`, `deployedAt`, and `deployer`.
- TypeScript deployment network selection via `DEPLOYMENT_NETWORK` / `--network` and CI-covered Node tests.
- TypeScript RPC client network selection for Anvil and XLayer.
- TypeScript deployment doctor to validate deployment JSON structure, expected chain id, and deployed code.
- CI command and full Anvil smoke command.
- Solidity `MigrationData` decoder/validator with tests for the real migration adapter input boundary.
- `BaseUniswapV4MigrationTarget` as a tested adapter shell for dependency validation, migration input checks, and LP custody proof events.
- `UniswapV4PoolKey` library to compute v4 PoolIds from validated migration data.
- `UniswapV4MintPositionTarget` to encode v4 `MINT_POSITION` / `SETTLE_PAIR` migrations and reject residual OKB/token.
- Deployment recording and doctor tooling for the Uniswap v4 migration target.
- XLayer production preflight checks for required env, provenance, addresses, and private key shape.
- Read-only XLayer readiness preflight that avoids requiring `PRIVATE_KEY` for non-broadcast checks.
- XLayer readiness consistency doctor that cross-checks Factory deployment records, migration-target records, and environment addresses before fork migration proof.
- Guarded XLayer fork migration gate for the real Uniswap v4 mint-position migration target.
- `npm run gate:xlayer` to run XLayer preflight, deployment doctors, and fork tests as a non-broadcast readiness gate.
- `npm run coverage` wrapper using `forge coverage --ir-minimum` so coverage remains reproducible when default coverage compilation hits stack-depth limits.
- LCOV coverage gate (`coverage:95`) enforcing line coverage ≥ 95% via `ts/cli/check-lcov-coverage.ts`.
- `expectEmit` coverage for core factory, trading, fee, and migration events.
- Coverage for fee claim recipient transfer rejection preserving accrued fees.
- Multi-signer Anvil smoke CLI (`npm run smoke:anvil:accounts`) for serial regression across default Anvil accounts.
- Anvil smoke report (`ANVIL_SMOKE_REPORT.md`) recording multi-signer smoke results and follow-ups.

### Changed

- Split `migrationTarget` from `uniswapV4PositionManager` so production migration can be verified independently.
- Replaced instant fee transfers with pull-based fee accounting (see Added).
- Removed unused Uniswap PoolManager and PositionManager immutables from `EulrFactory`; these addresses remain deployment/fork verification inputs.
- Removed the unused `sat1HookDeployer` constructor dependency from the direct deployment architecture.
- TypeScript sell CLI now approves only the exact sell amount.
- TypeScript and Solidity buy/sell scripts reject zero min-out unless explicitly allowed for local smoke flows.
- README now describes Eulr instead of Foundry boilerplate.
- Aligned testing documentation with existing fork files and separated current XLayer fork coverage from future migration-adapter fork requirements.
- Renamed Hook migration result event from `LiquidityBurned` to `LiquidityMigrationResult` so LP burn/lock proof remains the adapter's responsibility.
- Documented `IMigrationTarget` as an adapter boundary and added concrete real-adapter acceptance checks.
- Hardened Forge deployment provenance so `GIT_COMMIT` and `DEPLOYED_AT` must be explicit non-empty values.
- Expanded guarded XLayer fork coverage to create a token and execute small buy/sell flows.
- Deployment doctor now verifies on-chain Factory immutable config when RPC is available, and runs code checks sequentially for deterministic diagnostics.
- Deployment doctor CLI rejects invalid `--chain-id` values before running deployment checks.
- Consolidated TypeScript chain/env/param/artifact/deployment record configuration under `ts/config/` while keeping runtime clients and doctors under `ts/lib/`.
- `test:fork:xlayer` is pinned to `XLAYER_CHAIN_ID=196` and the readiness preflight rejects other `XLAYER_CHAIN_ID` overrides so misconfiguration cannot silently skip fork checks.

### Fixed

- RPC URL redaction for deployment doctor diagnostics.
- XLayer fork chain-id enforcement in the readiness gate.

### Security

- Verified Ethereum mainnet sat1 `Sat1HookDeployer` reference address recorded as the canonical lookup line in `DEPLOYMENT_RUNBOOK.md` §1; only used as a reference for any future Hook deployer reuse, never as a production address.
- XLayer fork readiness gate enforces external address code checks before any non-broadcast or broadcast migration step.

### Known Blockers

- Real XLayer external addresses are not confirmed in repo.
- Uniswap v4 migration adapter still needs a passing real XLayer fork gate with verified production addresses and RPC.
- LP burn/lock proof against production PositionManager requires running `npm run gate:xlayer` with confirmed XLayer env.
- External audit is not complete.
