# SATPAD 产品流程说明

本文档描述 SATPAD 合约后端对第三方客户端、脚本、区块浏览器和运营方暴露的完整链上流程。当前范围只包含合约后端，不包含前端页面、索引服务或运营后台。

## 1. 参与角色

### 创建者

创建者通过 `SatpadFactory.createToken` 发起新代币。创建者只负责提供：

- `name`
- `symbol`
- `metadataURI`
- `socialURI`

创建者不能修改曲线参数、fee、毕业阈值、Router、Hook，也不能 mint、burn 或删除代币。

输入边界：

- `name` 必须为 1 到 32 bytes。
- `symbol` 必须为 1 到 8 bytes。
- `metadataURI` 最多 512 bytes。
- `socialURI` 最多 256 bytes。

### 交易用户

交易用户只通过 token 绑定的 `SatpadRouter` 交易：

- `buy(token, minTokensOut, recipient)` 使用 native OKB 买入。
- `sell(token, tokensIn, minOkbOut, recipient)` burn token 换回 native OKB。
- `quoteBuy(token, okbIn)` 和 `quoteSell(token, tokensIn)` 读取报价。

交易必须设置 slippage 参数。`minTokensOut = 0` 或 `minOkbOut = 0` 只允许测试和脚本调试，不应作为生产 UI 默认值。

### 迁移调用者

任何地址都可以在 token 达到毕业阈值后调用 `SatpadHook.migrateLiquidity`。协议不依赖 keeper、cron 或管理员触发。迁移只能执行一次。

### 第三方读取者

第三方客户端和索引器应以事件为主要数据源，以只读接口为状态校验来源：

- `TokenCreated` 重建 token 列表。
- `Bought` / `Sold` 重建交易历史、fee、曲线位置。
- `SelfDeprecated` 识别毕业触发。
- `LiquidityMigrated` / `LiquidityMigrationResult` 识别 Hook 迁移结果。
- 真实 migration adapter 的 LP burn/lock 证明事件识别 LP 最终归宿。

## 2. 创建 Token 流程

```text
Creator
  -> SatpadFactory.createToken(name, symbol, metadataURI, socialURI)
      -> deploy SatpadToken
      -> deploy SatpadHook
      -> deploy SatpadRouter
      -> bind token.hook
      -> bind hook.router
      -> write tokenInfo registry
      -> emit TokenCreated
```

成功后必须满足：

- `factory.isToken(token) == true`
- `factory.getTokenInfo(token)` 返回 token / hook / router / creator / metadata。
- `SatpadToken(token).hook() == hook`
- `SatpadHook(hook).router() == router`
- `SatpadRouter(router).token() == token`
- `SatpadRouter(router).hook() == hook`

失败条件：

- `name` 为空或超过 32 bytes。
- `symbol` 为空或超过 8 bytes。
- Factory 构造时 fee recipient 或外部依赖地址为零。
- Factory 构造时外部依赖地址没有 code。

## 3. Buy 流程

```text
Trader
  -> SatpadRouter.buy{value: grossOkbIn}(token, minTokensOut, recipient)
      -> Factory registry validates token
      -> Hook quoteBuy(okbCum, grossOkbIn)
      -> require grossOkbIn > 0
      -> require grossOkbIn <= 10 OKB
      -> require tokensOut >= minTokensOut
      -> okbCum = oldOkbCum + effectiveOkbIn
      -> lastBuyBlock[payer] = block.number
      -> lastBuyBlock[recipient] = block.number
      -> mint tokensOut to recipient
      -> claimableFeeOkb += fee
      -> emit Bought
      -> maybe emit SelfDeprecated
```

Buy 的会计规则：

```text
fee = grossOkbIn * 30 / 10_000
effectiveOkbIn = grossOkbIn - fee
newOkbCum = oldOkbCum + effectiveOkbIn
tokensOut = Curve.totalMinted(newOkbCum) - Curve.totalMinted(oldOkbCum)
```

生产客户端要求：

- 必须先调用 quote。
- 必须向用户展示 gross input、fee、effective input、tokens out、预估价格和 slippage。
- 必须设置非零且合理的 `minTokensOut`。
- buy 后 payer 和 token recipient 在同一区块都不能 sell。

## 4. Sell 流程

```text
Trader
  -> SatpadToken.approve(router, tokensIn)
  -> SatpadRouter.sell(token, tokensIn, minOkbOut, recipient)
      -> Factory registry validates token
      -> Router pulls tokens into Hook
      -> Hook quoteSell(okbCum, tokensIn)
      -> require tokensIn > 0
      -> require lastBuyBlock[seller] != block.number
      -> require netOkbOut >= minOkbOut
      -> require Hook curve reserve >= grossOkbOut
      -> okbCum = newOkbCum
      -> burn tokensIn
      -> claimableFeeOkb += fee
      -> transfer netOkbOut to recipient
      -> emit Sold
```

Sell 的会计规则：

```text
oldMinted = Curve.totalMinted(okbCum)
newMinted = oldMinted - tokensIn
newOkbCum = Curve.okbAtMinted(newMinted)
grossOkbOut = okbCum - newOkbCum
fee = grossOkbOut * 30 / 10_000
netOkbOut = grossOkbOut - fee
```

生产客户端要求：

- 必须先调用 quote。
- 必须向用户展示 gross output、fee、net output 和 slippage。
- 必须设置非零且合理的 `minOkbOut`。
- approve 应使用本次 sell 所需数量，不应默认无限授权。

## 5. Same-Block 防护流程

同一地址在同一区块 buy 或收到 buy 铸币后不能 sell 同一 token：

```text
block N:
  user buys token A to self
  user sells token A -> revert SameBlockSell

  buyer buys token A to recipient
  recipient sells token A -> revert SameBlockSell

block N + 1:
  user sells token A -> success
```

防护粒度是 `user + token Hook`。不同 token 的 Hook 各自维护 `lastBuyBlock`，不会互相影响。

## 6. 毕业流程

毕业条件由唯一曲线状态 `okbCum` 推导：

```text
Curve.totalMinted(okbCum) >= 99% * K
```

达到阈值的 buy 仍然成功，但会设置：

```text
selfDeprecated = true
```

毕业后：

- buy 永久关闭。
- sell 保持开放。
- `selfDeprecated` 没有重置路径。
- 任何用户都可以触发迁移。

## 7. Liquidity Migration 流程

当前实现通过 `migrationTarget` 适配外部迁移逻辑。商业可用版本必须把该 target 固定为经过验证的 Uniswap v4 / LP burn 或 lock 适配器。

```text
Caller
  -> SatpadHook.migrateLiquidity(migrationData)
      -> require selfDeprecated == true
      -> require liquidityMigrated == false
      -> compute okbAmount = hook.balance - claimableFeeOkb
      -> compute tokenAmount = K - token.totalSupply()
      -> mint tokenAmount to Hook
      -> transfer tokenAmount to migrationTarget
      -> migrationTarget.migrate{value: okbAmount}(...)
      -> liquidityMigrated = true
      -> emit LiquidityMigrated
      -> emit LiquidityMigrationResult
```

商业可用门槛：

- XLayer 上 `migrationTarget` 必须有 code。
- migration target 必须只调用验证过的 Uniswap v4 PoolManager / PositionManager。
- migration target 必须严格校验 `migrationData`，包括 pool currency 顺序、tick range、liquidity、amount max、deadline 和 LP burn/lock recipient；当前 `BaseUniswapV4MigrationTarget` 已定义该外壳。
- Uniswap v4 pool 身份必须使用 `PoolId` 追踪，不能把 PoolManager 地址误当成独立 pool address。
- migration target 必须返回非零 pool 和非零 liquidity。
- LP ownership 必须 burn 或 lock，且 fork 测试能证明团队 EOA 不能取回。
- LP burn/lock 证明必须由真实 migration adapter 事件提供，Hook 不自行宣称 LP 已 burn。
- 迁移只能执行一次。

## 8. Fee 流程

当前实现选择 pull-based fee：

```text
buy fee -> claimableFeeOkb
sell fee -> claimableFeeOkb
feeRecipient -> claimFees(recipient)
```

优点是 buy / sell 不依赖 fee recipient 的 native OKB 接收逻辑，避免团队多签或接收合约异常导致用户交易 revert。claim 只能由 `feeRecipient` 发起，且只能提取 `claimableFeeOkb`，不能提取用户可赎回曲线储备。

## 9. 第三方集成流程

第三方无需后端 API 即可集成：

1. 监听 `TokenCreated` 得到 token 列表。
2. 调 `getTokenInfo(token)` 校验 token / hook / router。
3. 调 `quoteBuy` / `quoteSell` 展示报价。
4. 用户通过 Router buy / sell。
5. 监听 `Bought` / `Sold` 更新交易历史。
6. 监听 `SelfDeprecated` 更新毕业状态。
7. 监听 `LiquidityMigrated` / `LiquidityMigrationResult` 更新 Hook 迁移状态。
8. 监听真实 migration adapter 的 LP burn/lock 证明事件更新 LP 归宿状态。

## 10. 商业可用状态定义

SATPAD 合约后端只有在以下条件全部满足后才能称为商业可用：

- 本地 unit / integration / invariant / fuzz 全通过。
- Slither 无 high / medium 未处理项。
- XLayer fork 测试通过。
- Uniswap v4、migration target、LP burn/lock 地址全部验证有 code。
- 主网部署脚本输出完整 deployment JSON。
- 源码验证完成。
- 外部安全审计或至少独立 reviewer 审核完成。
- 产品流程、技术文档、测试文档、部署 runbook 与代码一致。
