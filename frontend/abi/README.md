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
- `index.ts` — typed `as const` ABIs for viem / wagmi.
- `addresses.json` / `addresses.ts` — deployment addresses, chain ids, proxy metadata, curve params.

OZ v5 transparent proxies create a distinct `ProxyAdmin` per proxy. The `proxyAdmin` column below is the recorded Factory proxy admin when available; Router proxy admins are read from each Router proxy's ERC-1967 admin slot by upgrade tooling.

## Networks

| Network | Chain ID | Factory Proxy | Proxy Admin | Migration Target |
| --- | --- | --- | --- | --- |
| anvil | 31337 | 0x1613beB3B2C4f22Ee086B2b38C1476A3cE7f78E8 | 0x9467A509DA43CB50EB332187602534991Be1fEa4 | 0xc3e53F4d16Ae77Db1c982e75a937B9f60FE63690 |
| forge-local | 31337 | 0x1F585372F116E1055AF2bED81a808DDf9638dCCD |  | 0xd544d7A5EF50c510f3E90863828EAba7E392907A |
| hashkeytest | 133 | 0x726B98099fCA8a1778EAC863Bac1232A9753a55A | 0x40Fb77DEB510584D878b73E676dC62c2EaebBc87 | 0x3c5969d393197E42B4b5Fcc54055c361f2F6ACef |
| sepolia | 11155111 | 0x659B9e6BC036535f34597c8BCBC2051B964e4a7F | 0x4dDAd72B990aA5b434A5B653556D420A232E5a81 | 0x8ca7F9C9D739C582c95B3A48f9F7668AFf1A2E78 |

See `FRONTEND_INTEGRATION.md` at the repository root for the full integration guide.
