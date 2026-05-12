# SATPAD 合约后端产品文档

## 1. 产品定位

SATPAD 是运行在 XLayer 主网的无许可代币发射协议。任何用户都可以通过链上工厂创建一个使用 sat1 bonding curve 机制的 ERC-20 代币。

当前开发范围只包含合约后端：

- 合约工厂。
- 每个代币独立的 ERC-20、Hook、Router。
- sat1 曲线数学库。
- mint / burn / graduation / liquidity migration 链上流程。
- 事件、只读接口、部署脚本和验证脚本。

不在当前开发范围：

- 网站、页面、钱包连接、图表、Portfolio、搜索、交易列表等客户端功能。
- 独立索引服务或数据 API。
- 运营后台。

合约后端必须保证任何第三方客户端、脚本或区块浏览器都能直接调用协议。

相关文档：

- `PRODUCT_FLOW.md` 描述完整产品流程。
- `COMMERCIAL_READINESS.md` 定义商业可用门槛和当前阻塞项。
- `DEPLOYMENT_RUNBOOK.md` 描述本地、fork 和 XLayer 部署流程。
- `SECURITY_MODEL.md` 描述信任边界、安全不变量和上线前安全清单。

## 2. 核心用户与链上动作

### 创建者

创建者可以：

- 调用 `SatpadFactory.createToken` 创建新代币。
- 设置代币 name、symbol、metadata URI 和可选社交 metadata URI。
- 支付部署 gas。

字段限制：

```text
name: 1-32 bytes
symbol: 1-8 bytes
metadataURI: <= 512 bytes
socialURI: <= 256 bytes
```

创建者不可以：

- 修改曲线参数。
- 修改 fee。
- 修改毕业阈值。
- 任意增发或销毁用户余额。
- 删除已创建代币。

### 交易用户

交易用户可以：

- 使用 OKB buy 新代币。
- burn 代币换回 OKB。
- 读取 quote、当前价格、已铸造量、毕业状态。

交易用户受到以下约束：

- 单次 buy 上限为 `10 OKB`。
- 同一区块内 buy 后不能 sell。
- buy / sell 都必须传入 slippage 保护参数。
- 代币毕业后 buy 永久停止，但 sell 仍保持开放。

### 迁移调用者

任意符合条件的调用者可以在代币毕业后触发流动性迁移。合约不能依赖自动定时任务；所有状态变化都必须由外部交易触发。

## 3. sat1 曲线规格

固定曲线参数：

```text
K = 21,000,000 token
S = 100 OKB
feeBps = 30
selfDeprecatedThreshold = 99% * K
maxBuy = 10 OKB
```

曲线公式：

```text
price(okb)  = (S / K) * e^(okb / S)
minted(okb) = K * (1 - e^(-okb / S))
```

反函数：

```text
okbAtMinted(q) = -S * ln(1 - q / K)
```

按上述公式，达到 `99% * K` 约需要 `460.517 OKB` 净投入。文档、测试和脚本均以公式为准。

## 4. 单状态原则

每个代币 Hook 只保存一个曲线主状态：

```text
okbCum
```

所有核心值从 `okbCum` 推导：

```text
currentPrice = Curve.marginalPrice(okbCum)
totalMinted  = Curve.totalMinted(okbCum)
graduated    = totalMinted >= 99% * K
```

禁止把以下值作为第二套曲线状态存储并参与判断：

- 手动维护的 minted 总量。
- 手动维护的 graduation progress。
- 独立的 curve supply checkpoint。

ERC-20 `totalSupply()` 可以存在，但不能取代 `okbCum` 作为曲线位置。

## 5. Buy 规格

用户通过 Router exact-input buy：

```text
grossOkbIn = msg.value
fee = grossOkbIn * feeBps / 10_000
effectiveOkbIn = grossOkbIn - fee
oldMinted = Curve.totalMinted(okbCum)
newOkbCum = okbCum + effectiveOkbIn
newMinted = Curve.totalMinted(newOkbCum)
tokensOut = newMinted - oldMinted
```

状态变化：

```text
okbCum = newOkbCum
lastBuyBlock[payer] = block.number
lastBuyBlock[recipient] = block.number
```

成功条件：

- `msg.value > 0`。
- `msg.value <= 10 OKB`。
- `tokensOut >= minTokensOut`。
- `selfDeprecated == false`。

## 6. Sell 规格

用户通过 Router exact-input sell：

```text
oldMinted = Curve.totalMinted(okbCum)
newMinted = oldMinted - tokensIn
newOkbCum = Curve.okbAtMinted(newMinted)
grossOkbOut = okbCum - newOkbCum
fee = grossOkbOut * feeBps / 10_000
netOkbOut = grossOkbOut - fee
```

状态变化：

```text
okbCum = newOkbCum
```

成功条件：

- `tokensIn > 0`。
- `tokensIn <= userBalance`。
- `netOkbOut >= minOkbOut`。
- `lastBuyBlock[seller] != block.number`。
- Hook 有足够 OKB 支付 `netOkbOut`。

## 7. 费用规格

费用：

```text
buy fee = 0.3% of gross OKB input
sell fee = 0.3% of gross OKB output
recipient = team multisig
```

要求：

- fee recipient 必须在部署或初始化时设置为非零地址。
- fee 不进入 `okbCum`。
- fee 不推动毕业进度。
- fee 累计到 Hook 的 `claimableFeeOkb`。
- 只有 fee recipient 可以调用 `claimFees(recipient)`。
- fee recipient 不能提取用户可赎回储备。
- 事件必须记录 gross、fee、net/effective。

当前实现选择累计 claim 模型。buy / sell 不会因为 fee recipient 拒收 native OKB 而 revert；fee recipient 只在主动 claim 时需要提供可接收 native OKB 的 recipient。

## 8. 毕业规格

触发条件：

```text
Curve.totalMinted(okbCum) >= 99% * K
```

触发后：

- `selfDeprecated = true`。
- buy 永久停止。
- sell 仍可执行。
- `selfDeprecated` 不可被 owner、creator 或 fee recipient 重置。

毕业迁移：

- 迁移到 Uniswap v4 池。
- 添加协议定义的 OKB/token 流动性。
- 添加完成后 burn 或永久锁定 LP 所有权。
- 迁移只能执行一次。
- 所有迁移步骤必须 emit event。

## 9. 合约交付物

MVP 合约：

```text
SatpadFactory
SatpadToken
SatpadHook
SatpadRouter
Curve
```

辅助交付物：

```text
interfaces/
libraries/
deployment scripts
verification scripts
ABI artifacts
deployment JSON
```

## 10. 链上事件

必须事件：

```solidity
event TokenCreated(address indexed token, address indexed hook, address indexed router, address creator, string metadataURI, string socialURI);
event Bought(address indexed token, address indexed user, address indexed recipient, uint256 grossOkbIn, uint256 fee, uint256 tokensOut, uint256 oldOkbCum, uint256 newOkbCum);
event Sold(address indexed token, address indexed user, address indexed recipient, uint256 tokensIn, uint256 grossOkbOut, uint256 fee, uint256 netOkbOut, uint256 oldOkbCum, uint256 newOkbCum);
event FeesClaimed(address indexed recipient, uint256 amount);
event SelfDeprecated(address indexed token, uint256 okbCum, uint256 minted);
event LiquidityMigrated(address indexed token, address indexed pool, uint256 okbAmount, uint256 tokenAmount);
event LiquidityMigrationResult(address indexed token, address indexed pool, uint256 liquidity);
```

事件是合约后端对外的数据接口，必须足够支持第三方客户端重建代币列表、交易历史、毕业状态和迁移状态。
`LiquidityMigrationResult` 只表示 migration target 返回的 pool / liquidity，不作为 LP 已 burn/lock 的证明；真实 Uniswap v4 adapter 必须单独 emit LP 归宿证明事件。

## 11. 非功能要求

安全：

- 不允许任意 mint。
- 不允许 blacklist。
- 不允许 transfer tax。
- 不允许 owner 提取用户储备。
- 不允许创建者修改核心参数。
- 不允许 selfDeprecated 重置。

可验证：

- 合约代码可验证。
- 部署地址写入 deployment JSON。
- 参数在部署后可读取。
- 所有关键状态变化都有事件。

无许可：

- 创建无需管理员审批。
- buy / sell 无白名单。
- 毕业迁移不依赖单一管理员。

## 12. 当前实现状态

已完成本地 MVP：

- Factory / Token / Hook / Router / Curve。
- 本地 Solidity scripts 全流程。
- TypeScript CLI 本地部署和 smoke 流程。
- unit / integration / fuzz / invariant / Slither 本地门禁。

仍不满足主网商业可用：

- 真实 XLayer 外部地址未全部确认。
- 真实 Uniswap v4 migration target 未完成。
- LP burn/lock 路径未在 fork 中证明。
- XLayer fork tests 需要真实 RPC 和地址。
- 外部审计尚未完成。

## 13. 待确认事项

商业部署前必须确认：

1. 团队多签完整地址。
2. XLayer 上 Uniswap v4 PoolManager / PositionManager 地址。
3. LP burn 或 lock 的具体合约路径。
4. entropy 启动窗口是否进入 MVP。
