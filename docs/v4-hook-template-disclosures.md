# v4 Hook Template Disclosures

These disclosures describe the 10 v4 hook templates wired into contracts, registry metadata, simulations, ABI export, and local Anvil smoke coverage for the launchpad and Hook Plaza.

## Launch Binding Status

The hook templates can now be referenced by curve-first launches through a factory-level `V4MigrationProfile`.

Implemented launch binding pieces:

- `register:v4-migration-profile` registers a migration profile for an approved hook/pool configuration.
- `create-token --v4-migration-profile <id>` creates a normal Eulr curve token and binds its future migration to the selected profile.
- `create-token-and-buy --v4-migration-profile <id>` performs the same binding while executing the initial buy.
- Deployment JSON records `v4MigrationProfileId`, `v4Hooks`, `v4MigrationTarget`, and `launchMode`.
- `smoke:anvil:v4-profile` verifies the local profile registration and profile-backed token creation path.
- `smoke:anvil:v4-hooks` verifies all 10 hook templates against local Uniswap v4 PoolManager swap callbacks.

Current limitation: one Uniswap v4 pool can use only one `hooks` address. Combining mechanisms such as anti-snipe plus referral requires a composite hook contract and separate disclosure.

Identity limitation: Uniswap v4 hook callbacks receive `sender` as the swap caller. With aggregator or router flows this is usually the router, not the end user's wallet. Template state and events that use `trader` are therefore caller-scoped unless a future trusted router appends and authenticates end-user identity. UI and indexers must not present Diamond Hands, First Believers, Loyalty Tier, Quest, or Team Battle state as per-wallet guarantees for generic router swaps.

## Diamond Hands Decay Tax

Story: swap callers that hold longer pay lower sell tax.

Mechanism: the hook records the swap caller's first qualifying buy and linearly decays exact-input sell tax from `maxSellTaxBps` to `minSellTaxBps`.

Warnings: exact-output sells are unsupported. Fresh holders can pay the maximum configured sell tax. Tax recipients must be burn addresses or registry-approved non-creator vaults.

## Launch Shield Anti-Snipe

Story: opening-window tax protection fades after launch.

Mechanism: immutable launch time and protection duration determine buy and sell taxes that decay from initial rates to final rates.

Warnings: exact-output paths are unsupported. Early buys and sells can pay higher temporary tax. No owner path can extend the launch window after deployment.

## Whale Boss Tax

Story: small sellers pay base tax while oversized sells face a whale-protection tax.

Mechanism: the MVP hook uses an immutable absolute token threshold and raises exact-input sell tax toward `maxSellTaxBps` as trade size grows.

Warnings: exact-output sells are unsupported. Pool-share threshold mode is disabled until trusted pool liquidity access is available. Tax recipients cannot be creator-controlled in Tier 1.

## Buyback Flywheel

Story: each trade can fuel a visible buyback or burn vault.

Mechanism: exact-input buy and sell fees settle to a registry-approved flywheel vault. The hook does not route keeper swaps internally.

Warnings: exact-output taxed paths are unsupported. Vault behavior must be disclosed and approved before production use.

## First Believers NFT

Story: early qualifying buyers become claimable founder-badge recipients.

Mechanism: the hook records claimable eligibility for the first `maxBadges` buyers above `minBuyAmount` during the badge window.

Warnings: no ERC-721 mint happens in the swap path. A separate minter or indexer must consume eligibility state.

## Quest Referral Hook

Story: buyers can include referral hookData for launch quests and ambassador campaigns.

Mechanism: the hook decodes referral identifiers and records deterministic points/events without paying rewards during the swap.

Warnings: UI must encode hookData correctly. Malformed or self-referral data can be rejected or ignored.

## Loyalty Tier Rebate

Story: repeated caller activity unlocks better fee tiers.

Mechanism: the hook tracks swap caller activity and applies the configured fee for the caller's current tier.

Warnings: exact-output taxed paths are unsupported. Tier thresholds and fee bps are immutable after deployment.

## Milestone Unlock Treasury

Story: community trading progress unlocks public milestones.

Mechanism: the hook tracks pool-level metrics and emits milestone progress/unlock events. MVP event-only mode does not transfer treasury assets.

Warnings: fee-change mode needs additional disclosure; event-only mode has no hook-level tax.

## Team Battle Hook

Story: buyers choose a team and push a community scoreboard.

Mechanism: the hook decodes team id hookData on buys and records team points.

Warnings: UI must surface team choice before signing. Invalid hookData can reject point credit.

## Creator Fee Split Hook

Story: swaps can accrue recurring creator, community, and protocol fee claims.

Mechanism: exact-input buy and sell fees accrue to immutable split recipients.

Warnings: this is a high-risk/post-MVP template. Production listing requires explicit approval for recurring fee policy.
