# SATPAD 合约后端测试文档

## 1. 测试目标

本文档只覆盖 SATPAD 合约后端测试。当前不包含客户端页面、钱包 UI、图表、Portfolio 或独立索引服务测试。

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
Backend smoke scripts: TypeScript + viem
Static analysis: Slither
```

商业可用测试还必须满足 `COMMERCIAL_READINESS.md` 和 `SECURITY_MODEL.md` 的上线门禁。本地 unit/integration/invariant 通过只能证明 MVP 行为，不能替代 XLayer fork、真实迁移适配器验证和审计。

## 2. 测试目录

```text
test/
  unit/
    Curve.t.sol
    SatpadToken.t.sol
    FactoryValidation.t.sol

  integration/
    FactoryCreateToken.t.sol
    HookBuy.t.sol
    HookSell.t.sol
    RouterSettlement.t.sol
    SameBlockProtection.t.sol
    SelfDeprecation.t.sol
    GraduationMigration.t.sol
    TokenIsolation.t.sol

  invariant/
    CurveStateInvariant.t.sol
    FactoryIsolationInvariant.t.sol
    FeeAccountingInvariant.t.sol
    RouterAssetInvariant.t.sol
    GraduationInvariant.t.sol

  fork/
    XLayerAddressFork.t.sol
    Sat1HookDeployerFork.t.sol
    UniswapV4MigrationFork.t.sol

  handlers/
    UserHandler.sol
    FactoryHandler.sol
    GraduationHandler.sol
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
forge test --match-path "test/fork/*" --fork-url $XLAYER_RPC_URL -vvv
```

Gas：

```bash
forge test --gas-report
```

Coverage：

```bash
forge coverage
```

Static analysis：

```bash
slither .
```

TypeScript smoke：

```bash
npm run deploy:anvil
npm run create-token -- --name Demo --symbol DEMO --metadata-uri ipfs://demo
npm run quote:buy -- --token <address> --okb 1
npm run buy -- --token <address> --okb 1 --min-out <value>
npm run quote:sell -- --token <address> --tokens <value>
npm run sell -- --token <address> --tokens <value> --min-out <value>
npm run inspect-token -- --token <address>
```

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
- curve params 固定为 SATPAD 参数。
- factory 记录 tokenInfo。
- allTokens 长度递增。
- emit `TokenCreated`。

失败验证：

- 空 name revert。
- 空 symbol revert。
- name 超长 revert。
- symbol 超长 revert。
- fee recipient zero address 部署失败。
- sat1 Hook Deployer 地址无 code 时部署或初始化失败。

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
- `lastBuyBlock[user] = block.number`。
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
- emit `LiquidityMigrated` 和 `LiquidityBurned`。

失败路径：

- Uniswap v4 地址无 code revert。
- LP burn/lock 失败 revert。
- 迁移后资产会计不一致 revert。

如果迁移需要外部 position manager token id，必须测试 token id 所有权最终不可恢复到团队 EOA。

## 12. Fee 测试

即时转账模型：

- buy fee 立即发送 team multisig。
- sell fee 立即发送 team multisig。
- fee transfer failure revert。
- fee 不进入 `okbCum`。
- fee 不影响毕业判断。

累计 claim 模型：

- fee 累计到 `claimableFeeOkb`。
- 只有 team multisig 可 claim。
- claim 不得提取用户可赎回储备。
- claim 后 emit event。

项目只能选择一种模型进入 MVP，测试必须与实现一致。

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

## 14. Invariant 测试

Handler 随机执行：

```text
createToken
buy
sell
triggerGraduation
migrateLiquidity
claimFee（如果采用 claim 模型）
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
- fee recipient 收到的 fee 等于事件累计 fee。
- 已迁移 token 不能重复迁移。
- LP burn/lock 后不可恢复。

## 15. XLayer Fork 测试

必须验证：

- chainId 与 XLayer 配置一致。
- sat1 Hook Deployer 完整地址有 code。
- Uniswap v4 PoolManager 有 code。
- Uniswap v4 PositionManager 有 code。
- Factory 可部署。
- Factory 可创建 token。
- 小额 buy / sell 成功。
- migration 调用路径在 fork 上可执行。

禁止：

- 使用省略地址。
- 凭记忆硬编码地址。
- 在测试中提交真实 private key 或 RPC secret。

## 16. TypeScript Smoke 测试

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

## 17. CI 门禁

每个 PR 至少运行：

```bash
forge fmt --check
forge build
forge test
forge test --fuzz-runs 10000
forge test --match-path "test/invariant/*"
slither .
```

主网部署前额外运行：

```bash
forge test --match-path "test/fork/*" --fork-url $XLAYER_RPC_URL
forge test --gas-report
forge coverage
npm run deploy:anvil
npm run smoke:anvil
```

合并条件：

- unit / integration / fuzz / invariant 通过。
- fork tests 通过。
- Slither 无 high / medium 未处理项。
- 部署脚本输出完整 deployment JSON。
- 文档与实现参数一致。

## 18. 当前覆盖状态

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

仍需补齐：

- 真实 XLayer fork tests。
- sat1 Hook Deployer 真实地址校验。
- Uniswap v4 PoolManager / PositionManager 真实地址校验。
- 真实 migration target 和 LP burn/lock fork 测试。
- Gas snapshot 留档。
- Coverage 留档。
- 审计后回归测试。

## 19. 上线前清单

- [ ] 团队多签地址确认。
- [ ] sat1 Hook Deployer 地址确认。
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

## 20. 失败处理原则

如果测试失败：

1. 不要先改测试。
2. 先判断失败的是 PRD、测试假设、数学误差还是实现 bug。
3. 曲线或 invariant 失败时，优先认为实现或设计有问题。
4. rounding 问题必须定义误差上限。
5. fork 失败先确认地址、chainId、RPC 和外部合约版本。
6. migration 失败先确认 Uniswap v4 接口和 LP burn/lock 路径。
