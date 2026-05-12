# SATPAD Contract Backend

SATPAD is a permissionless token launch protocol for XLayer. Each launched token receives an isolated ERC-20 token, bonding-curve Hook, and Router. The protocol uses the sat1 exponential curve, native OKB settlement, 0.3% fees, graduation at 99% of token supply, and one-time liquidity migration.

This repository currently covers the contract backend, local deployment scripts, TypeScript CLI tooling, and tests. It does not include the web app, wallet UI, indexer, charts, portfolio, or operations dashboard.

## Documentation

- `PRODUCT_DOCUMENT.md`: product requirements and protocol rules.
- `PRODUCT_FLOW.md`: end-to-end product flows for creation, buy, sell, graduation, migration, fee, and third-party integration.
- `TECHNICAL_DEVELOPMENT.md`: architecture, interfaces, state model, and implementation requirements.
- `TESTING_GUIDE.md`: unit, integration, fuzz, invariant, fork, smoke, and CI testing requirements.
- `FORGE_ANVIL_TS_DEVELOPMENT.md`: Foundry, Anvil, Solidity scripts, and TypeScript CLI development workflow.
- `COMMERCIAL_READINESS.md`: commercial availability gates, blockers, stage definitions, and launch criteria.
- `DEPLOYMENT_RUNBOOK.md`: local, fork, and XLayer deployment procedures.
- `SECURITY_MODEL.md`: trust boundaries, invariants, attack surfaces, and pre-launch security checklist.

## Current Status

The local MVP includes:

- `SatpadFactory`
- `SatpadToken`
- `SatpadHook`
- `SatpadRouter`
- `Curve`
- Solidity scripts for local full-flow execution
- TypeScript CLI scripts for local deployment and smoke testing
- Unit, integration, fuzz, and invariant tests

The project is not yet mainnet-commercial-ready until the production external addresses, real Uniswap v4 migration adapter, XLayer fork tests, source verification workflow, and external audit/review are complete.

## Requirements

- Foundry (`forge`, `cast`, `anvil`)
- Node.js and npm
- Slither for static analysis

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

Run static analysis:

```bash
npm run slither
```

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

Simulate graduation and migration:

```bash
npm run simulate:graduation -- --token <token>
npm run migrate:liquidity -- --token <token>
```

## Pre-Commit Verification

Before each stage commit:

```bash
forge fmt --check
forge build
forge test
forge test --match-path "test/invariant/*"
npx tsc --noEmit
slither src --exclude-informational --exclude-low
```

Before production deployment also run XLayer fork tests, gas reporting, coverage, source verification, and audit/review steps described in `COMMERCIAL_READINESS.md`.
