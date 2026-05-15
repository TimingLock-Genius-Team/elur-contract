# Anvil and HashKey 133 Full Test Report

Date: 2026-05-14

## Summary

Status: passed after fixes.

This run covered the local Anvil environment and HashKey testnet chain `133`.
Anvil passed full single-signer and multi-signer smoke flows. HashKey 133 was
redeployed because the previous Factory address was a legacy non-proxy contract,
then passed deployment doctor checks, basic trading CLI checks, and the full
test-wallet account smoke.

## Fixes Applied During Testing

- Added default standard Anvil private keys to `smoke:anvil:accounts`, so the
  account smoke can run without manually setting `ANVIL_PRIVATE_KEYS`.
- Corrected the default Anvil key list to match the currently running Foundry
  Anvil account set.
- Redeployed HashKey 133 with the current OpenZeppelin v5 transparent proxy
  Factory/Router model.
- Updated ABI export to also write `backend/frontend/abi`, which is the path
  imported by the backend indexer package.
- Updated root backend aliases to target the actual backend package at
  `backend/backend`.
- Removed the backend test's hardcoded old HashKey Factory address assertion so
  it validates the committed deployment shape instead of pinning a stale address.

## Anvil Results

Environment:

- Chain ID: `31337`
- RPC: `http://127.0.0.1:8545`
- Chain reset before smoke: `cast rpc anvil_reset`

Commands:

- `PRIVATE_KEY=<anvil-account-0> TEAM_MULTISIG=<anvil-account-0> DEPLOYMENT_NETWORK=anvil npm run smoke:anvil`
- `DEPLOYMENT_NETWORK=anvil npm run smoke:anvil:accounts`

Result:

- Single-signer full flow: passed.
- Multi-signer full flow: passed.
- Multi-signer accounts: 10 default Anvil accounts.
- Failed accounts: 0.

Covered flow:

- Deploy Factory proxy and implementations.
- Create token.
- Quote buy.
- Buy.
- Quote sell.
- Sell.
- Simulate graduation.
- Migrate liquidity.
- Claim fees.

## HashKey 133 Results

Previous issue:

- The previous recorded Factory `0x8CD276b90c887Ad82a31b53829F03d07bA1a4858`
  was not an ERC-1967 proxy. Its admin and implementation slots were zero, and
  the new Factory ABI call `routerImplementation()` reverted.

Redeployed deployment:

- Chain ID: `133`
- Deployer: `0xd8F391e10223580611A70160d1D42bf55fCc882C`
- Factory proxy: `0x726B98099fCA8a1778EAC863Bac1232A9753a55A`
- Factory ProxyAdmin: `0x40Fb77DEB510584D878b73E676dC62c2EaebBc87`
- Factory implementation: `0xB1F5802db3bD3e66A19eAb72bFd65260F931A59F`
- Router implementation: `0x3035c5428062B6f42cA1248baAF8Fa48338f1D7b`
- Migration target: `0x3c5969d393197E42B4b5Fcc54055c361f2F6ACef`

Smoke token:

- Token: `0x0Ee011433a57CeA77B5507f93D1D30923F87ceb2`
- Hook: `0x6eb01d5a49220639a1316f2CBD595C1201B1BAb0`
- Router proxy: `0x8F400E3fdF27a30e4C70894f50c88D59D88cE1Fe`
- Curve S: `25`

Commands:

- `DEPLOYMENT_NETWORK=hashkeytest npm run deploy:hashkeytest`
- `DEPLOYMENT_NETWORK=hashkeytest npm run doctor:deployment`
- `DEPLOYMENT_NETWORK=hashkeytest npm run create-token -- --name HashKey133Smoke --symbol H133 --metadata-uri ipfs://hashkey-133-smoke --curve-s 25`
- `DEPLOYMENT_NETWORK=hashkeytest npm run quote:buy -- --okb 0.001`
- `DEPLOYMENT_NETWORK=hashkeytest npm run buy -- --okb 0.001 --min-out 0 --allow-zero-min-out`
- `DEPLOYMENT_NETWORK=hashkeytest npm run quote:sell -- --tokens 1`
- `DEPLOYMENT_NETWORK=hashkeytest npm run sell -- --tokens 1 --min-out 0 --allow-zero-min-out`
- `DEPLOYMENT_NETWORK=hashkeytest npm run smoke:hashkeytest:accounts -- --fund`

Result:

- Deployment doctor: passed.
- Basic quote/buy/sell CLI flow: passed.
- Account smoke: passed.
- Test wallet accounts: 61.
- Funded accounts: 0.
- Failed accounts: 0.

## HashKey 133 Retest

Fresh retest token:

- Token: `0xA068D9A8b5b7002DBa6f47829fbd1C9c1E908C87`
- Hook: `0xA5b6EdaBe886e982F8017bc55BD81dd91FAcC693`
- Router proxy: `0x5A74ceE0039C01465337984eC951e2bFB1300Ea4`
- Curve S: `25`

Commands:

- `DEPLOYMENT_NETWORK=hashkeytest npm run doctor:deployment`
- `DEPLOYMENT_NETWORK=hashkeytest npm run create-token -- --name HashKey133Retest --symbol H133R --metadata-uri ipfs://hashkey-133-retest --curve-s 25`
- `DEPLOYMENT_NETWORK=hashkeytest npm run quote:buy -- --okb 0.001`
- `DEPLOYMENT_NETWORK=hashkeytest npm run buy -- --okb 0.001 --min-out 0 --allow-zero-min-out`
- `DEPLOYMENT_NETWORK=hashkeytest npm run quote:sell -- --tokens 1`
- `DEPLOYMENT_NETWORK=hashkeytest npm run sell -- --tokens 1 --min-out 0 --allow-zero-min-out`
- `DEPLOYMENT_NETWORK=hashkeytest npm run smoke:hashkeytest:accounts -- --fund`

Result:

- Deployment doctor: passed.
- Basic quote/buy/sell CLI flow: passed.
- Account smoke: passed.
- Test wallet accounts: 61.
- Funded accounts: 0.
- Failed accounts: 0.

## Final Regression

Commands:

- `npm run export:abis`
- `forge test`
- `npm run test:ts`
- `npx tsc --noEmit`
- `npm run backend:typecheck`
- `npm run backend:test`

Result:

- ABI export: passed.
- Foundry tests: passed.
- Root TypeScript tests: 109 passed.
- Root TypeScript typecheck: passed.
- Backend typecheck: passed.
- Backend Node tests: 59 passed, 1 skipped Postgres integration.

## Backend 133 Integration

Backend integration has been updated to use the real HashKey 133 deployment
snapshot from `backend/frontend/abi/addresses.json` as the source of truth.

- Required Factory proxy: `0x726B98099fCA8a1778EAC863Bac1232A9753a55A`
- Required Factory ProxyAdmin: `0x40Fb77DEB510584D878b73E676dC62c2EaebBc87`
- Required Factory implementation: `0xB1F5802db3bD3e66A19eAb72bFd65260F931A59F`
- Required Router implementation: `0x3035c5428062B6f42cA1248baAF8Fa48338f1D7b`
- Required migration target: `0x3c5969d393197E42B4b5Fcc54055c361f2F6ACef`

Backend startup now rejects stale HashKey 133 deployment metadata, including the
legacy non-proxy Factory `0x8CD276b90c887Ad82a31b53829F03d07bA1a4858`.
Ponder defaults Factory and migration-target addresses from the committed
deployment snapshot; if address environment variables are set, they must match
that snapshot exactly.

## Notes

- `npm install` was run in `backend/backend` so backend type definitions and
  package dependencies are available for local verification.
- `npm install` reported dependency audit warnings in backend dependencies
  (3 moderate, 4 high). `npm audit fix` was attempted, but npm did not provide
  a safe non-breaking fix path; the `--force` path would install `ponder@0.0.1`,
  so it was intentionally not applied. This did not block the requested
  smoke/regression run.
- Backend Postgres integration remains skipped unless
  `BACKEND_INTEGRATION_DATABASE_URL` is provided.
- Node printed `DEP0205 module.register()` deprecation warnings from the current
  loader/toolchain. They did not fail tests.
