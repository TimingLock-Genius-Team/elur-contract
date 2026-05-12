# Changelog

All notable changes to SATPAD contract backend are tracked here.

## Unreleased

### Added

- Product flow, commercial readiness, deployment runbook, and security model documentation.
- XLayer fork readiness gate for production external address code checks.
- Deployment provenance fields in deployment JSON: `commit`, `deployedAt`, and `deployer`.
- Root MIT license.
- CI command and full Anvil smoke command.

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

### Known Blockers

- Real XLayer external addresses are not confirmed in repo.
- Real Uniswap v4 migration adapter and LP burn/lock path are not implemented.
- XLayer fork migration test requires verified production addresses and RPC.
- External audit is not complete.
