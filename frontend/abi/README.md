# Eulr ABI Bundle

Generated from `out/` Foundry artifacts and `deployments/<network>/latest.json` via
`npm run export:abis`. Re-run after every contract or deployment change.

## Files

- `EulrFactory.json` — Singleton factory. Creates per-token (token, hook, router) trios and exposes the read registry.
- `EulrHook.json` — Per-token bonding-curve engine. Owns curve state, fee accrual, self-deprecation, and one-shot migration.
- `EulrRouter.json` — Per-token user entrypoint. Wraps buy/sell so frontends interact with a stable interface per token.
- `EulrToken.json` — Per-token ERC-20. Mint and burn are gated to the bound hook; transfer/approve match the standard ABI.
- `ProxyAdmin.json` — OZ v5 transparent proxy admin ABI. Each proxy owns a distinct ProxyAdmin; deployment metadata records the Factory proxy admin.
- `TransparentUpgradeableProxy.json` — Transparent proxy shell used for the singleton Factory and each per-token Router.
- `UniswapV4MintPositionTarget.json` — Reference migration adapter. Encodes Uniswap v4 MINT_POSITION/SETTLE_PAIR and sends the LP position to the configured recipient.
- `EulrV4SellTaxHook.json` — Post-graduation Uniswap v4 hook. Taxes exact-input EULR sells and leaves buys untaxed.
- `index.ts` — typed `as const` ABIs for viem / wagmi.
- `addresses.json` / `addresses.ts` — deployment addresses, chain ids, proxy metadata, curve params.

OZ v5 transparent proxies create a distinct `ProxyAdmin` per proxy. The `proxyAdmin` column below is the recorded Factory proxy admin when available; Router proxy admins are read from each Router proxy's ERC-1967 admin slot by upgrade tooling.

## Networks

| Network | Chain ID | Factory Proxy | Proxy Admin | Migration Target |
| --- | --- | --- | --- | --- |
| anvil | 31337 | 0x1c85638e118b37167e9298c2268758e058DdfDA0 | 0xC5999Ef9Fe837eDB1fE6611983fb1Bf8ceB477d4 | 0x2B0d36FACD61B71CC05ab8F3D2355ec3631C0dd5 |
| forge-local | 31337 | 0x1F585372F116E1055AF2bED81a808DDf9638dCCD |  | 0xd544d7A5EF50c510f3E90863828EAba7E392907A |
| hashkeytest | 133 | 0x726B98099fCA8a1778EAC863Bac1232A9753a55A | 0x40Fb77DEB510584D878b73E676dC62c2EaebBc87 | 0x3c5969d393197E42B4b5Fcc54055c361f2F6ACef |
| sepolia | 11155111 | 0xB5AC20Fca4A268eA0eb3455147dCdf07EB1c3B5e | 0x4bB53e32aB795A45FFa198D544452D817503b569 | 0xCb7562a48f3b677777f7E003868846402a6C06cf |

See `FRONTEND_INTEGRATION.md` at the repository root for the full integration guide.
