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

### Known Blockers

- Real XLayer external addresses are not confirmed in repo.
- Real Uniswap v4 migration adapter and LP burn/lock path are not implemented.
- XLayer fork migration test requires verified production addresses and RPC.
- External audit is not complete.
