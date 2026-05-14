# Eulr Frontend ABI Bundle

Generated from `out/` Foundry artifacts and `deployments/<network>/latest.json` via
`npm run export:abis`. Re-run after every contract or deployment change.

## Files

- `EulrFactory.json` — Singleton factory. Creates per-token (token, hook, router) trios and exposes the read registry.
- `EulrHook.json` — Per-token bonding-curve engine. Owns curve state, fee accrual, self-deprecation, and one-shot migration.
- `EulrRouter.json` — Per-token user entrypoint. Wraps buy/sell so frontends interact with a stable interface per token.
- `EulrToken.json` — Per-token ERC-20. Mint and burn are gated to the bound hook; transfer/approve match the standard ABI.
- `UniswapV4MintPositionTarget.json` — Reference migration adapter. Encodes Uniswap v4 MINT_POSITION/SETTLE_PAIR and burns the LP to address(0x..dEaD).
- `index.ts` — typed `as const` ABIs for viem / wagmi.
- `addresses.json` / `addresses.ts` — deployment addresses, chain ids, curve params.

## Networks

| Network | Chain ID | Factory | Migration Target |
| --- | --- | --- | --- |
| anvil | 31337 | 0x75b09E468e66d6341968477244E01764A5BAe546 | 0x7129ecFbcb8d61f4F5ADE27b9E73FE82f4E3757B |
| forge-local | 31337 | 0x1F585372F116E1055AF2bED81a808DDf9638dCCD | 0xd544d7A5EF50c510f3E90863828EAba7E392907A |

See `FRONTEND_INTEGRATION.md` at the repository root for the full integration guide, including chart data sources and Bun.js backend/indexer API expectations.
