# Eulr

Eulr is a permissionless token launch protocol for XLayer. Each launch creates an isolated ERC-20 token, bonding-curve hook, and router. Trading uses native OKB, a sat1-style exponential curve, a 0.3% fee, creator-selected curve steepness, and a one-time graduation migration.

This repository contains the contract backend, Foundry tests, deployment scripts, TypeScript CLI tooling, ABI export tooling, and the backend indexer/API package. The canonical project documentation is intentionally small:

- `README.md`: product scope, repository layout, development commands, and deployment notes.
- `docs/curve-graduation-and-migration.md`: mechanism, product behavior, graduation, migration, and user-facing caveats.

## Product Scope

Eulr supports three core user actions:

- Creators launch a token with `name`, `symbol`, `metadataURI`, `socialURI`, and optional `curveS`.
- Traders buy with native OKB or sell tokens back through the token's router.
- Any caller can trigger liquidity migration after graduation, if migration has not already succeeded.

The protocol does not let creators change K, fees, graduation threshold, router, hook, or reserves after creation. The default curve parameters are:

```text
K = 21,000,000 tokens
default curveS = 100
feeBps = 30
selfDeprecationBps = 8000
maxBuyOkb = 10 OKB
```

`curveS` is optional at creation time and must be in `1..1000`. It maps to `S = curveS * 1e18`. Smaller values graduate with less net OKB and steeper early price movement; larger values require deeper net OKB and produce a flatter curve.

For a detailed mechanism explanation, read `docs/curve-graduation-and-migration.md`.

## Repository Layout

```text
src/                     Solidity contracts
script/                  Foundry deployment and operation scripts
test/                    Unit, integration, invariant, and fork tests
ts/                      TypeScript deploy, CLI, doctor, ABI export, and smoke tooling
deployments/             Network deployment snapshots
frontend/abi/            Generated ABI bundle for app consumers
backend/abi/             Generated ABI bundle for backend/tooling consumers
backend/frontend/abi/    Generated ABI bundle used by the backend package
backend/backend/         Bun.js/Postgres indexer and API package
docs/                    Canonical mechanism documentation
web/                     Frontend application workspace
```

Third-party dependency documentation under `lib/**` and `backend/lib/**` is vendor material and is not part of the project documentation set.

## Requirements

- Foundry: `forge`, `cast`, `anvil`
- Node.js and npm for contract tooling
- Bun.js and Postgres for the backend indexer/API package
- Slither for static analysis
- A local Anvil private key for local broadcast scripts

Install root dependencies:

```bash
npm install
```

Install backend package dependencies when working on the indexer/API:

```bash
npm --prefix backend/backend install
```

## Common Development Commands

Build contracts:

```bash
npm run build
```

Run Solidity tests:

```bash
npm test
npm run test:fuzz
npm run test:invariant
```

Run TypeScript checks:

```bash
npx tsc --noEmit
npm run test:ts
```

Run coverage and static analysis:

```bash
npm run coverage
npm run coverage:95
npm run slither
```

Run the local CI gate:

```bash
npm run ci
```

`npm run ci` runs formatting checks, build, fuzz tests, invariant tests, fork test entrypoints, TypeScript typecheck, TypeScript tests, the 95% coverage gate, and Slither.

## Local Anvil Flow

Start Anvil:

```bash
npm run anvil
```

Deploy the local factory:

```bash
npm run deploy:anvil
```

Create a token:

```bash
npm run create-token -- --name Demo --symbol DEMO --metadata-uri ipfs://demo --curve-s 25
```

Omit `--curve-s` to use the default `curveS = 100`.

Inspect and trade:

```bash
npm run inspect-token -- --token <token>
npm run quote:buy -- --token <token> --okb 1
npm run buy -- --token <token> --okb 1 --min-out <tokensOut>
npm run quote:sell -- --token <token> --tokens <amount>
npm run sell -- --token <token> --tokens <amount> --min-out <netOkbOut>
```

Buy and sell CLIs require explicit non-zero `--min-out` values. Local smoke tests may use `--allow-zero-min-out` only for deterministic development flows.

Simulate graduation and migration locally:

```bash
npm run simulate:graduation -- --token <token>
npm run migrate:liquidity -- --token <token>
npm run claim:fees -- --token <token>
```

Run the local smoke flow:

```bash
PRIVATE_KEY=<anvil-private-key> TEAM_MULTISIG=<anvil-account> DEPLOYMENT_NETWORK=anvil npm run smoke:anvil
```

Run multi-signer Anvil smoke:

```bash
DEPLOYMENT_NETWORK=anvil npm run smoke:anvil:accounts
```

## ABI Export

Generate ABI bundles from Foundry artifacts and deployment records:

```bash
npm run export:abis
```

The exporter writes:

- `frontend/abi/`
- `backend/abi/`
- `backend/frontend/abi/`

Each bundle contains contract ABIs, typed TypeScript/JavaScript entries, deployment address snapshots, and proxy metadata.

## Backend Indexer/API

The backend package indexes contract events into Postgres and serves frontend read models for token lists, token summaries, charts, trades, holders, portfolio data, metadata, health checks, and OpenAPI docs.

Root aliases:

```bash
npm run backend:migrate
npm run backend:indexer
npm run backend:dev
npm run backend:test
npm run backend:typecheck
```

The backend reads deployment metadata from generated ABI address snapshots. Wallet writes still belong in the frontend or CLI; the backend indexes confirmed events and serves read-only product data.

## XLayer Deployment Notes

Production deployment requires confirmed and verified external addresses:

- `TEAM_MULTISIG`
- `UNISWAP_V4_POOL_MANAGER`
- `UNISWAP_V4_POSITION_MANAGER`
- `LP_RECIPIENT`
- `MIGRATION_TARGET`

Deploy the Uniswap v4 migration target first, then set its address as `MIGRATION_TARGET` before deploying the factory:

```bash
DEPLOYMENT_NETWORK=xlayer npm run deploy:migration-target
npm run doctor:migration-target -- --network xlayer --rpc-url "$XLAYER_RPC_URL"
npm run preflight:xlayer
DEPLOYMENT_NETWORK=xlayer npm run script:deploy-xlayer
```

Before launch, run the non-broadcast readiness gate:

```bash
npm run gate:xlayer
```

After deployment, verify the deployment snapshot and regenerate ABI bundles:

```bash
npm run doctor:deployment -- --network xlayer --rpc-url "$XLAYER_RPC_URL" --chain-id 196
npm run doctor:xlayer-readiness
npm run export:abis
```

Mainnet commercial readiness also requires source verification, fork proof for the real migration path, LP custody proof, gas and coverage records, and independent security review or audit.

## Safety Notes

- Never commit `.env`, private keys, RPC secrets, or wallet files.
- Do not treat local migration mocks as proof of production Uniswap v4 behavior.
- Do not run smoke flows concurrently, because deployment snapshots are overwritten.
- Do not default user trades to zero slippage protection.
- Treat `selfDeprecated` as irreversible: graduation closes buys permanently, while sells remain open.
