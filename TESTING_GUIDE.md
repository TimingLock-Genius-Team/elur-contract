# Eulr 合约后端测试文档

## 1. 测试目标

本文档只覆盖 Eulr 合约后端测试。当前不包含客户端页面、钱包 UI、图表、Portfolio 或独立索引服务测试。

测试必须证明：

```text
Factory 无许可创建代币
每个代币的 Token / Hook / Router 相互隔离
okbCum 是唯一曲线状态
sat1 指数曲线和反函数正确
buy 只用扣费后的 OKB 推动 okbCum
sell 严格反向减少 okbCum
fee 不污染曲线进度
same-block buy/sell 被阻止
selfDeprecated 后 buy 永久停止
毕业后 liquidity migration 只能执行一次
Router 不残留用户 OKB 或 token
```

测试栈：

```text
Unit / fuzz / invariant / fork: Forge
Local chain: Anvil
Contract repo smoke scripts: TypeScript + viem
Static analysis: Slither
```

这里的 TypeScript smoke scripts 指本仓库的合约部署、调试和 ABI 工具，不是产品 backend/indexer。产品 backend/indexer 约定使用 Bun.js，相关测试应在该服务加入仓库时单独补充。

商业可用测试还必须满足 `COMMERCIAL_READINESS.md` 和 `SECURITY_MODEL.md` 的上线门禁。本地 unit/integration/invariant 通过只能证明 MVP 行为，不能替代 XLayer fork、真实迁移适配器验证和审计。

## 2. 测试目录

```text
test/
  unit/
    Curve.t.sol
    EulrToken.t.sol
    FactoryValidation.t.sol
    MigrationData.t.sol
    UniswapV4PoolKey.t.sol
    BaseUniswapV4MigrationTarget.t.sol
    UniswapV4MintPositionTarget.t.sol

  integration/
    FactoryCreateToken.t.sol
    EventEmission.t.sol
    HookBuy.t.sol
    HookBuySell.t.sol
    HookSell.t.sol
    GraduationMigration.t.sol
    RouterSettlement.t.sol
    SameBlockProtection.t.sol
    SelfDeprecation.t.sol
    SelfDeprecationAndMigration.t.sol
    TokenIsolation.t.sol

  invariant/
    CurveStateInvariant.t.sol
    FactoryIsolationInvariant.t.sol
    FeeAccountingInvariant.t.sol
    RouterAssetInvariant.t.sol
    GraduationInvariant.t.sol

  fork/
    XLayerAddressFork.t.sol

  handlers/
    UserHandler.sol
```

TypeScript smoke：

```text
ts/cli/
  create-token.ts
  quote-buy.ts
  buy.ts
  quote-sell.ts
  sell.ts
  inspect-token.ts
  simulate-graduation.ts
  migrate-liquidity.ts
  claim-fees.ts
  smoke-anvil-accounts.ts
```

## 3. 测试命令

基础测试：

```bash
forge test
```

详细日志：

```bash
forge test -vvv
```

Fuzz：

```bash
forge test --fuzz-runs 10000
```

Invariant：

```bash
forge test --match-path "test/invariant/*" --fuzz-runs 1000
```

XLayer fork：

```bash
XLAYER_CHAIN_ID=196 forge test --match-path "test/fork/*" --fork-url $XLAYER_RPC_URL -vvv
```

Gas：

```bash
forge test --gas-report
```

Coverage：

```bash
npm run coverage
```

Static analysis：

```bash
slither src --exclude-informational --exclude-low
```

TypeScript smoke：

```bash
PRIVATE_KEY=<anvil-private-key> DEPLOYMENT_NETWORK=anvil npm run smoke:anvil
```

`smoke:anvil` 会广播本地 Anvil 交易，必须显式提供本地测试私钥。只允许使用 Anvil 公开测试账户或专用测试 signer，禁止使用生产私钥。

多 Anvil signer 轮询 smoke：

```bash
DEPLOYMENT_NETWORK=anvil ANVIL_PRIVATE_KEYS=<comma-separated-anvil-private-keys> npm run smoke:anvil:accounts
```

每轮 `smoke:anvil` 都会重新部署本地 Factory、创建新 token，并覆盖 `deployments/anvil/latest.json`。多 signer smoke 用来验证 TypeScript CLI 不依赖固定 deployer，且不同 Anvil 测试账户都能完成创建、交易、毕业、迁移和 fee claim。

仍需注意：单独执行 Forge `script:*` 时，`FACTORY`、`TOKEN`、`RECIPIENT`、`TEAM_MULTISIG` 等变量仍来自当前 shell / `.env`。如果 `.env` 正在指向 HashKey testnet，单独跑 Anvil `script:*` 前必须显式导出 Anvil 本地值。

或逐步执行：

```bash
PRIVATE_KEY=<anvil-private-key> DEPLOYMENT_NETWORK=anvil npm run deploy:anvil
PRIVATE_KEY=<anvil-private-key> DEPLOYMENT_NETWORK=anvil npm run create-token -- --name Demo --symbol DEMO --metadata-uri ipfs://demo
DEPLOYMENT_NETWORK=anvil npm run quote:buy -- --token <address> --okb 1
PRIVATE_KEY=<anvil-private-key> DEPLOYMENT_NETWORK=anvil npm run buy -- --token <address> --okb 1 --min-out <value>
DEPLOYMENT_NETWORK=anvil npm run quote:sell -- --token <address> --tokens <value>
PRIVATE_KEY=<anvil-private-key> DEPLOYMENT_NETWORK=anvil npm run sell -- --token <address> --tokens <value> --min-out <value>
DEPLOYMENT_NETWORK=anvil npm run inspect-token -- --token <address>
PRIVATE_KEY=<anvil-private-key> DEPLOYMENT_NETWORK=anvil npm run simulate:graduation -- --token <address>
PRIVATE_KEY=<anvil-private-key> DEPLOYMENT_NETWORK=anvil npm run migrate:liquidity -- --token <address>
PRIVATE_KEY=<anvil-private-key> DEPLOYMENT_NETWORK=anvil npm run claim:fees -- --token <address>
```

最近本地 Anvil smoke 记录：

- 2026-05-13：使用 Anvil 本地测试 signer 并设置 `DEPLOYMENT_NETWORK=anvil` 后，完整 `smoke:anvil` 通过，覆盖 deploy factory、create token、quote buy、buy、quote sell、sell、simulate graduation、migrate liquidity 和 claim fees。
- 2026-05-13：使用 Anvil account 0、1、2 正确私钥串行执行多 signer `smoke:anvil`，最终退出码为 `0`。完整日志报告见 `ANVIL_SMOKE_REPORT.md`。
- 通过样本的关键状态：`chainId = 31337`，`buy` 后 `okbCum = 997000000000000000`，`simulate graduation` 后 `selfDeprecated = true`，`migrate liquidity` 后 `liquidityMigrated = true`，`claim fees` 后 `claimableAfter = 0`。

## 4. Curve 单元测试

曲线：

```text
price(okb)  = (S / K) * e^(okb / S)
minted(okb) = K * (1 - e^(-okb / S))
okbAtMinted(q) = -S * ln(1 - q / K)
```

参数：

```text
K = 21_000_000e18
S = 100e18
feeBps = 30
selfDeprecationBps = 9900
maxBuyOkb = 10e18
```

必须测试：

- `totalMinted(0) == 0`。
- `totalMinted(okbCum) < K`。
- `totalMinted(okbCum)` 单调增加。
- `marginalPrice(okbCum)` 单调增加。
- `okbAtMinted(totalMinted(okbCum))` 在误差范围内等于 `okbCum`。
- `totalMinted(460.517 OKB)` 约等于 `99% * K`。
- `okbAtMinted(K)` revert。
- `okbAtMinted(q > K)` revert。
- `quoteBuy` 的 fee 不进入 `newOkbCum`。
- `quoteSell` 会降低 `newOkbCum`。
- rounding dust 有明确上限。
- 极大输入不会 overflow。

## 5. Factory 测试

创建流程：

```text
createToken(name, symbol, metadataURI, socialURI)
```

成功验证：

- 任意 EOA 可创建。
- name 非空且长度限制生效。
- symbol 非空且长度限制生效。
- 创建后 Token、Hook、Router 都有 code。
- token 绑定正确 Hook。
- router 绑定正确 token / hook。
- curve params 固定为 Eulr 参数。
- factory 记录 tokenInfo。
- allTokens 长度递增。
- `getTokens(offset, limit)` 按创建顺序分页返回 token 地址，并在 offset 越界或 limit 为 0 时返回空数组。
- emit `TokenCreated`，且 creator 必须可索引。

失败验证：

- 空 name revert。
- 空 symbol revert。
- name 超长 revert。
- symbol 超长 revert。
- metadata URI 超过 512 bytes revert。
- social URI 超过 256 bytes revert。
- fee recipient zero address 部署失败。
- migration target 地址无 code 时 Factory 部署失败。

权限验证：

- creator 不能改曲线参数。
- creator 不能替换 Hook。
- creator 不能删除 token。
- factory owner 如果存在，也不能提取用户储备。

## 6. Token 测试

必须验证：

- 只有绑定 Hook 可以 mint。
- 只有绑定 Hook 可以 burn。
- 其他 Hook 不能 mint/burn。
- owner 不能 arbitrary mint。
- 不存在 blacklist。
- 不存在 transfer tax。
- 不存在管理员修改用户余额路径。
- decimals 固定为 18，除非产品明确修改。

不需要重复测试 OpenZeppelin ERC-20 内部基础逻辑。

## 7. Hook Buy 测试

成功路径：

```text
Router.buy{value: X}(token, minTokensOut, recipient)
```

验证：

- `X > 0`。
- `X <= 10 OKB`。
- fee = `X * 30 / 10_000`。
- `effectiveOkbIn = X - fee`。
- `okbCum` 增加 `effectiveOkbIn`。
- token mint 给 recipient。
- `lastBuyBlock[payer] = block.number`。
- `lastBuyBlock[recipient] = block.number`。
- fee 进入团队多签或 claimable fee。
- emit `Bought`。
- 达到阈值时 emit `SelfDeprecated`。
- Router 交易后 OKB/token 余额为 0。

失败路径：

- `msg.value = 0` revert。
- `msg.value > 10 OKB` revert。
- `minTokensOut` 太高 revert。
- `selfDeprecated == true` revert。
- 非 Router 直接调用 Hook buy revert。
- Router 传入未注册 token revert。

## 8. Hook Sell 测试

成功路径：

```text
approve Router
Router.sell(token, tokensIn, minOkbOut, recipient)
```

验证：

- token 从用户扣除或由 Hook burn。
- `okbCum` 降低到 `newOkbCum`。
- fee = `grossOkbOut * 30 / 10_000`。
- recipient 收到 `netOkbOut`。
- fee 进入团队多签或 claimable fee。
- emit `Sold`。
- Router 交易后 OKB/token 余额为 0。

失败路径：

- `tokensIn = 0` revert。
- balance 不足 revert。
- allowance 不足 revert。
- `tokensIn > totalMinted(okbCum)` revert。
- `minOkbOut` 太高 revert。
- 同一区块内刚 buy 的用户 sell revert。
- Hook OKB balance 不足时 revert。
- 非 Router 直接调用 Hook sell revert。

## 9. Same-Block 防护测试

流程：

```text
vm.roll(N)
buy()
sell() -> revert
vm.roll(N + 1)
sell() -> success
```

必须覆盖：

- 同一用户 buy 后同块 sell revert。
- buyer 和 recipient 不同时，recipient 同块 sell revert。
- 不同用户不被错误阻止。
- 多 token 情况下 lastBuyBlock 不串扰。
- failed buy 不应写入 lastBuyBlock。

## 10. Self-Deprecation 测试

触发条件：

```text
Curve.totalMinted(okbCum) >= 99% * K
```

验证：

- 阈值前 buy 成功。
- 达到阈值的 buy 成功并设置 `selfDeprecated`。
- 阈值后 buy 永久 revert。
- sell 在 selfDeprecated 后仍成功。
- owner、creator、fee recipient 都不能重置。
- 状态变化 emit `SelfDeprecated`。

## 11. Graduation Migration 测试

成功路径：

```text
selfDeprecated == true
migrateLiquidity(migrationData)
```

验证：

- 未毕业前 migrate revert。
- 已迁移后再次 migrate revert。
- 调用正确 Uniswap v4 地址。
- 添加流动性金额符合协议定义。
- LP 被 burn 或 lock。
- `liquidityMigrated = true`。
- Hook emit `LiquidityMigrated` 和 `LiquidityMigrationResult`。
- 真实 adapter 必须额外 emit 可验证的 LP burn/lock 证明事件。

失败路径：

- Uniswap v4 地址无 code revert。
- LP burn/lock 失败 revert。
- `migrationData` 解码 / 校验失败必须 revert。
- migration target 返回零 pool 或零 liquidity revert。
- migration target 返回无效结果时必须回滚 `liquidityMigrated`、Hook OKB 和 target token balance。
- 迁移后资产会计不一致 revert。

如果迁移需要外部 position manager token id，必须测试 token id 所有权最终不可恢复到团队 EOA。

当前 `test/unit/MigrationData.t.sol`、`test/unit/UniswapV4PoolKey.t.sol`、`test/unit/BaseUniswapV4MigrationTarget.t.sol` 和 `test/unit/UniswapV4MintPositionTarget.t.sol` 已覆盖真实 adapter 前置输入校验：dependency code、currency ordering、pool fee、tick spacing/range、liquidity、amount max、deadline、burn / lock recipient、PoolId 编码、OKB/token max、v4 `MINT_POSITION` / `SETTLE_PAIR` 编码、残留资产拒绝和 LP 证明事件。真实 XLayer 接入后，还必须增加 PositionManager fork 调用、position owner 和 LP 归宿证明测试。

## 12. Fee 测试

累计 claim 模型：

- fee 累计到 `claimableFeeOkb`。
- 只有 team multisig 可 claim。
- claim 不得提取用户可赎回储备。
- claim 后 emit event。
- fee recipient 拒收 native OKB 不得导致 buy / sell revert。
- claim recipient 拒收 native OKB 时必须整体 revert，且 `claimableFeeOkb` 保持不变。
- 迁移只迁移曲线储备，不迁移未 claim fee。

当前实现采用累计 claim，测试必须覆盖 claim 权限、claim 后余额、迁移后 fee 仍可领取。

## 13. Router Asset 测试

每次 buy / sell 后：

```text
address(router).balance == 0
token.balanceOf(address(router)) == 0
```

还必须测试：

- revert 时资产回滚。
- recipient 可以不是 msg.sender。
- recipient zero address revert。
- Router 不能被用来调用未注册 Hook。
- Router quote 与 Hook quote 一致。

## 14. Event 测试

关键事件必须使用 `expectEmit` 固定索引字段和 data 字段：

- `TokenCreated` 必须包含 indexed token、indexed hook、indexed creator、router、metadataURI 和 socialURI。
- `Bought` / `Sold` 必须包含 token、user、recipient 和完整 quote 会计字段。
- `FeesClaimed` 必须包含 recipient 和 amount。
- `LiquidityMigrated` 必须包含 migration target 返回的 pool / venue address、迁移金额和 token 数量。
- `LiquidityMigrationResult` 必须包含 migration target 返回的 pool / venue address 和 liquidity。
- 真实 adapter 的 LP burn/lock 事件必须包含 LP 归宿证明和 Uniswap v4 `PoolId`；`BaseUniswapV4MigrationTarget.LpCustodyProven` 是当前最小事件形状，后续真实 adapter 需要补齐 PoolId 事件字段。

## 15. 前端读取接口测试

前端 PRD 所需的只读接口必须有回归测试：

- `EulrFactory.getTokens(offset, limit)` 覆盖首页、尾页、空页和 limit 为 0。
- `EulrHook.curveState()` 覆盖 buy 后的 `okbCum`、`totalMinted`、`currentPrice`、`claimableFeeOkb`、`selfDeprecated` 和 `liquidityMigrated`。
- `curveState()` 只能聚合现有状态和 `okbCum` 推导值，不能引入第二套曲线状态。

## 16. Invariant 测试

Handler 随机执行：

```text
createToken
buy
sell
triggerGraduation
migrateLiquidity
claimFee
```

不变量：

- 每个 token 的 `okbCum` 独立。
- `okbCum` 不包含 fee。
- buy 增加 `okbCum`，sell 减少 `okbCum`。
- `Curve.totalMinted(okbCum)` 与 token supply 差异不超过 dust 上限。
- selfDeprecated 后 buy 永远失败。
- sell 不因 selfDeprecated 被关闭。
- same-block sell 永远失败。
- Router 永远不残留资产。
- `claimableFeeOkb` 等于事件累计 fee。
- 已迁移 token 不能重复迁移。
- LP burn/lock 后不可恢复。

## 17. XLayer Fork 测试

当前 `XLayerAddressFork.t.sol` 已验证：

- chainId 与 XLayer 配置一致。
- Uniswap v4 PoolManager 有 code。
- Uniswap v4 PositionManager 有 code。
- migration target 有 code。
- Factory 可部署。
- Factory 可创建 token。
- 小额 buy / sell 成功。

真实 Uniswap v4 migration adapter 完成后，必须新增 fork 测试覆盖：

- migration 调用路径在 fork 上可执行。
- LP owner / burn / lock 结果可证明，团队 EOA 不能取回 LP。
- 无效 `migrationData` 或错误 pool 参数必须 revert。

禁止：

- 使用省略地址。
- 凭记忆硬编码地址。
- 在测试中提交真实 private key 或 RPC secret。

## 18. TypeScript Smoke 测试

脚本必须覆盖：

```text
deploy factory
create token
inspect token
quote buy
buy
quote sell
sell
simulate graduation
try migration
write deployment JSON
```

每个脚本输出：

- chainId。
- contract addresses。
- input amount。
- fee。
- expected output。
- tx hash。
- block number。
- post-state `okbCum`、minted、selfDeprecated、liquidityMigrated。

Smoke 失败必须退出非零状态码，方便 CI 使用。

TypeScript buy / sell CLI 默认拒绝 `--min-out 0`，Solidity buy / sell scripts 默认拒绝 `MIN_TOKENS_OUT=0` 或 `MIN_OKB_OUT=0`。只有本地 smoke 或调试流程可以显式传入 `--allow-zero-min-out` / `ALLOW_ZERO_MIN_OUT=true`。

## 19. CI 门禁

每个 PR 至少运行：

```bash
npm run ci
```

CI 展开命令（以 `package.json` 中 `ci` script 为准）：

```bash
forge fmt --check
forge build
forge test --fuzz-runs 10000
forge test --match-path "test/invariant/*"
forge test --match-path "test/fork/*"
npx tsc --noEmit
npm run test:ts
npm run coverage:95
slither src --exclude-informational --exclude-low
```

`coverage:95` 基于 `forge coverage --report lcov` 校验 line coverage 不低于 95%，对应 CLI 为 `ts/cli/check-lcov-coverage.ts`。

主网部署前额外运行：

```bash
npm run gate:xlayer
forge test --match-path "test/fork/*" --fork-url $XLAYER_RPC_URL -vvv
forge test --gas-report
npm run coverage
npm run deploy:anvil
npm run smoke:anvil
```

合并条件：

- unit / integration / fuzz / invariant 通过。
- fork tests 通过。
- Slither 无 high / medium 未处理项。
- 部署脚本输出完整 deployment JSON，包含 `commit`、`deployedAt` 和 `deployer`。
- 文档与实现参数一致。

## 20. 当前覆盖状态

已覆盖：

- Curve 数学、反函数、fee quote、rounding dust。
- Factory 创建和参数校验。
- Token hook-only mint/burn 和无 transfer tax。
- Hook buy / sell 成功与失败路径。
- Router settlement 和资产不残留。
- Same-block sell 防护。
- Self-deprecation 和毕业后 buy 关闭。
- 本地 migration mock 一次性迁移。
- 多 token 隔离。
- Fee accounting invariant。
- Router asset invariant。
- Factory isolation invariant。
- Graduation invariant。
- `MigrationData` 解码与校验：currency ordering、fee、tick spacing/range、liquidity、amount max、deadline、burn/lock recipient。
- `UniswapV4PoolKey` PoolId 编码与边界。
- `BaseUniswapV4MigrationTarget` 适配器外壳：依赖 code、输入校验、LP 归宿证明事件、残留资产拒绝。
- `UniswapV4MintPositionTarget` 第一版：v4 `MINT_POSITION` / `SETTLE_PAIR` 编码、OKB/token max、残留 OKB/token 拒绝。
- LCOV 覆盖率门禁（`coverage:95`，line ≥ 95%）。

仍需补齐：

- 真实 XLayer fork tests（依赖真实 `XLAYER_RPC_URL` 和已确认外部地址）。
- Uniswap v4 PoolManager / PositionManager 真实地址校验。
- 真实 PositionManager 行为下的 `UniswapV4MintPositionTarget` migration 和 LP burn/lock fork 证明。
- Gas snapshot 留档。
- 审计后回归测试。

## 21. 上线前清单

- [ ] 团队多签地址确认。
- [ ] Uniswap v4 地址确认。
- [ ] Curve 数学测试通过。
- [ ] Factory 创建测试通过。
- [ ] Token 无后门测试通过。
- [ ] Hook buy / sell 测试通过。
- [ ] same-block 防护测试通过。
- [ ] selfDeprecated 测试通过。
- [ ] migration + LP burn/lock 测试通过。
- [ ] Router asset invariant 通过。
- [ ] XLayer fork smoke 通过。
- [ ] Slither 无 high / medium 未处理项。
- [ ] 合约已验证。

## 22. 失败处理原则

如果测试失败：

1. 不要先改测试。
2. 先判断失败的是 PRD、测试假设、数学误差还是实现 bug。
3. 曲线或 invariant 失败时，优先认为实现或设计有问题。
4. rounding 问题必须定义误差上限。
5. fork 失败先确认地址、chainId、RPC 和外部合约版本。
6. migration 失败先确认 Uniswap v4 接口和 LP burn/lock 路径。
