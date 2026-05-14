# Eulr Contract Backend

Eulr is a permissionless token launch protocol for XLayer. Each launched token receives an isolated ERC-20 token, bonding-curve Hook, and Router. The protocol uses the sat1 exponential curve, native OKB settlement, 0.3% fees, graduation at 99% of token supply, and one-time liquidity migration.

This repository currently covers the contract backend, local deployment scripts, TypeScript CLI tooling, and tests. It does not implement the production web app, wallet UI, Bun.js indexer/API service, charts, portfolio, or operations dashboard, but it documents the data contracts those systems should consume.

The backend exposes frontend-friendly read surfaces through `EulrFactory.getTokens(offset, limit)` for token discovery and `EulrHook.curveState()` for token detail state snapshots.

Frontend/product data is split by source: current state comes from contract reads, theoretical curve and issuance series are computed client-side from `K` / `S`, and historical or aggregate fields such as 24h volume, price change, sparkline, holders, trades, and portfolio cost basis come from a separate Bun.js backend/indexer.

## Documentation

- `PRODUCT_DOCUMENT.md`: product requirements and protocol rules.
- `PRODUCT_FLOW.md`: end-to-end product flows for creation, buy, sell, graduation, migration, fee, and third-party integration.
- `TECHNICAL_DEVELOPMENT.md`: architecture, interfaces, state model, and implementation requirements.
- `TESTING_GUIDE.md`: unit, integration, fuzz, invariant, fork, smoke, and CI testing requirements.
- `FORGE_ANVIL_TS_DEVELOPMENT.md`: Foundry, Anvil, Solidity scripts, and TypeScript CLI development workflow.
- `COMMERCIAL_READINESS.md`: commercial availability gates, blockers, stage definitions, and launch criteria.
- `DEPLOYMENT_RUNBOOK.md`: local, fork, and XLayer deployment procedures.
- `SECURITY_MODEL.md`: trust boundaries, invariants, attack surfaces, and pre-launch security checklist.
- `CHANGELOG.md`: tracked changes grouped by Added / Changed / Fixed / Security and Known Blockers.
- `ANVIL_SMOKE_REPORT.md`: most recent local Anvil multi-signer smoke results and follow-ups.
- `FRONTEND_INTEGRATION.md`: frontend integration guide mapping the `Eulr Prototype.html` PRD to ABIs, reads, writes, events, chart data sources, and Bun.js backend/indexer expectations.

Suggested reading paths:

- New developer onboarding: `FORGE_ANVIL_TS_DEVELOPMENT.md` → this README.
- Product understanding: `PRODUCT_DOCUMENT.md` → `PRODUCT_FLOW.md`.
- Contract review / audit: `TECHNICAL_DEVELOPMENT.md` → `SECURITY_MODEL.md`.
- Testing / CI: `TESTING_GUIDE.md` → `COMMERCIAL_READINESS.md` §4.
- Deployment / operations: `DEPLOYMENT_RUNBOOK.md` → `COMMERCIAL_READINESS.md`.
- Change tracking: `CHANGELOG.md` → `ANVIL_SMOKE_REPORT.md`.
- Frontend integration: `FRONTEND_INTEGRATION.md` → `frontend/abi/`.

## Current Status

The local MVP includes:

- `EulrFactory`
- `EulrToken`
- `EulrHook`
- `EulrRouter`
- `Curve`
- Solidity scripts for local full-flow execution
- TypeScript CLI scripts for local deployment and smoke testing
- Unit, integration, fuzz, and invariant tests

The project is not yet mainnet-commercial-ready until the production external addresses, real Uniswap v4 migration adapter, XLayer fork tests, source verification workflow, and external audit/review are complete.

## Requirements

- Foundry (`forge`, `cast`, `anvil`)
- Node.js and npm for this contract repository's TypeScript CLI/tooling
- Bun.js for the separate product backend/indexer when that service is implemented
- Slither for static analysis
- `PRIVATE_KEY` for local Anvil deploy and smoke commands

Install TypeScript dependencies:

```bash
npm install
```

## Common Commands

Build:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Run deeper fuzz tests:

```bash
npm run test:fuzz
```

Run invariant tests:

```bash
npm run test:invariant
```

Run TypeScript type checking:

```bash
npx tsc --noEmit
```

Run TypeScript unit tests:

```bash
npm run test:ts
```

Run coverage and the 95% line-coverage gate:

```bash
npm run coverage
npm run coverage:95
```

Run static analysis:

```bash
npm run slither
```

Run the local CI gate:

```bash
npm run ci
```

`npm run ci` runs `forge fmt --check`, `forge build`, fuzz / invariant / fork builds, `npx tsc --noEmit`, `npm run test:ts`, `npm run coverage:95`, and Slither in the same order as `.github/workflows/ci.yml`.

## Local Anvil Flow

Start Anvil:

```bash
npm run anvil
```

Deploy local Factory:

```bash
npm run deploy:anvil
```

Create a token:

```bash
npm run create-token -- --name Demo --symbol DEMO --metadata-uri ipfs://demo
```

Inspect and trade:

```bash
npm run inspect-token -- --token <token>
npm run quote:buy -- --token <token> --okb 1
npm run buy -- --token <token> --okb 1 --min-out <tokensOut>
npm run quote:sell -- --token <token> --tokens <amount>
npm run sell -- --token <token> --tokens <amount> --min-out <netOkbOut>
```

The TypeScript buy/sell CLIs require an explicit non-zero `--min-out`. Local smoke tests may pass `--allow-zero-min-out` for deterministic development flows only.

TypeScript deployment and CLI tools read `deployments/anvil/latest.json` and `ANVIL_RPC_URL` by default. Use `DEPLOYMENT_NETWORK=xlayer` or `--network xlayer` to read/write `deployments/xlayer/latest.json` and connect through `XLAYER_RPC_URL`. Production migration target deployment is a separate step: set `UNISWAP_V4_POOL_MANAGER`, `UNISWAP_V4_POSITION_MANAGER`, `LP_RECIPIENT`, and the `XLAYER_V4_*` pool allowlist values, run `npm run deploy:migration-target`, validate it with `npm run doctor:migration-target -- --network xlayer --rpc-url $XLAYER_RPC_URL`, then use the recorded `migrationTarget` address as `MIGRATION_TARGET`. After `MIGRATION_TARGET` is set, run `npm run preflight:xlayer` to verify required XLayer env and provenance before the Factory deploy. Before launch, run `npm run gate:xlayer` to cross-check XLayer env, deployment records, on-chain Factory config, and guarded fork migration behavior.

Validate deployment JSON before production smoke:

```bash
npm run doctor:deployment -- --network xlayer --rpc-url $XLAYER_RPC_URL
npm run doctor:xlayer-readiness
```

Simulate graduation and migration:

```bash
npm run simulate:graduation -- --token <token>
npm run migrate:liquidity -- --token <token>
npm run claim:fees -- --token <token>
```

Run the full local smoke flow:

```bash
PRIVATE_KEY=<anvil-private-key> npm run smoke:anvil
```

Run the multi-signer Anvil smoke regression across default Anvil accounts:

```bash
npm run smoke:anvil:accounts
```

`npm run smoke:anvil:accounts` is the canonical replacement for hand-rolled shell loops; see `ANVIL_SMOKE_REPORT.md` for the most recent multi-signer results.

## Frontend Integration

Generate the frontend ABI bundle from the latest Foundry artifacts and deployment records:

```bash
npm run export:abis
```

This writes `frontend/abi/`:

- `EulrFactory.json`, `EulrHook.json`, `EulrRouter.json`, `EulrToken.json`, `UniswapV4MintPositionTarget.json` — raw ABIs for runtime use (viem, ethers, REST gateways).
- `index.ts` — same ABIs inlined as `as const satisfies Abi` so viem / wagmi infer call argument and return types.
- `addresses.json` / `addresses.ts` — per-network snapshot of factory address, migration target, fee recipient, and curve parameters from `deployments/<network>/latest.json`.
- `README.md` — bundle table of contents.

See `FRONTEND_INTEGRATION.md` for the page-by-page mapping from the `Eulr Prototype.html` PRD to contract calls, slippage handling, event subscription, error mapping, and off-chain data expectations.

## Pre-Commit Verification

Before each stage commit run the same gate as CI:

```bash
npm run ci
```

`npm run ci` expands to `forge fmt --check`, `forge build`, fuzz / invariant / fork tests, `npx tsc --noEmit`, `npm run test:ts`, `npm run coverage:95`, and Slither.

Before production deployment also run XLayer fork tests, gas reporting, coverage, source verification, and audit/review steps described in `COMMERCIAL_READINESS.md`.
