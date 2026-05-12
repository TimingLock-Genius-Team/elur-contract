# Changelog

All notable changes to SATPAD contract backend are tracked here.

## Unreleased

### Added

- Product flow, commercial readiness, deployment runbook, and security model documentation.
- XLayer fork readiness gate for production external address code checks.
- Deployment provenance fields in deployment JSON: `commit`, `deployedAt`, and `deployer`.
- Root MIT license.
- CI command and full Anvil smoke command.
- Verified Ethereum mainnet sat1 `Sat1HookDeployer` reference address in deployment and readiness documentation.

### Changed

- Split `migrationTarget` from `uniswapV4PositionManager` so production migration can be verified independently.
- TypeScript sell CLI approves only the exact sell amount.
- README now describes SATPAD instead of Foundry boilerplate.
- Removed the unused `sat1HookDeployer` constructor dependency from the direct deployment architecture.
- Removed unused Uniswap PoolManager and PositionManager immutables from `SatpadFactory`; these addresses remain deployment/fork verification inputs.
- Replaced instant fee transfers with pull-based fee accounting through `claimableFeeOkb` and `claimFees`.
- Added Solidity and TypeScript fee-claim scripts and included fee claim in the local smoke flow.
- Added Factory-side length limits for metadata and social URIs.
- Added migration result validation so zero pool or zero liquidity results revert.
- Added TypeScript deployment checks for configured external addresses.
- Extended same-block sell protection to mark both buy payer and token recipient.
- Added coverage for fee claim recipient transfer rejection preserving accrued fees.
- Added `expectEmit` coverage for core factory, trading, fee, and migration events.
- Added migration invalid-result rollback coverage for state and asset preservation.
- Made TypeScript and Solidity buy/sell scripts reject zero min-out unless explicitly allowed for local smoke flows.
- Added Forge XLayer deployment JSON output with external address code checks.
- Aligned testing documentation with existing fork files and separated current XLayer fork coverage from future migration-adapter fork requirements.
- Renamed Hook migration result event from `LiquidityBurned` to `LiquidityMigrationResult` so LP burn/lock proof remains the adapter's responsibility.
- Documented `IMigrationTarget` as an adapter boundary and added concrete real-adapter acceptance checks.
- Hardened Forge deployment provenance so `GIT_COMMIT` and `DEPLOYED_AT` must be explicit non-empty values.
- Expanded guarded XLayer fork coverage to create a token and execute small buy/sell flows.
- Added TypeScript deployment network selection via `DEPLOYMENT_NETWORK` / `--network` and CI-covered Node tests.
- Added TypeScript RPC client network selection for Anvil and XLayer.
- Added a TypeScript deployment doctor to validate deployment JSON structure, expected chain id, and deployed code.
- Made deployment doctor code checks run sequentially for deterministic diagnostics.
- Added a Solidity `MigrationData` decoder/validator with tests for the real migration adapter input boundary.
- Made the deployment doctor CLI reject invalid `--chain-id` values before running deployment checks.
- Added `BaseUniswapV4MigrationTarget` as a tested adapter shell for dependency validation, migration input checks, and LP custody proof events.

### Known Blockers

- Real XLayer external addresses are not confirmed in repo.
- Real Uniswap v4 migration adapter and LP burn/lock path are not implemented.
- XLayer fork migration test requires verified production addresses and RPC.
- External audit is not complete.
