# SATPAD 安全模型

本文档描述 SATPAD 合约后端的信任边界、攻击面和上线前安全门禁。

## 1. 信任边界

### 不信任对象

协议默认不信任：

- Token 创建者。
- 交易用户。
- 任意迁移调用者。
- 第三方前端。
- 任意 calldata。
- 任意 recipient 地址。

### 信任对象

协议必须显式信任：

- Factory 构造时传入的 fee recipient。
- Factory 构造时传入的 migration target。
- 部署和 fork 测试中验证的 Uniswap v4 PoolManager / PositionManager。

这些地址必须在部署前通过 fork 测试和人工来源确认。

## 2. 核心安全不变量

以下属性必须长期保持：

- `okbCum` 是唯一曲线主状态。
- fee 不进入 `okbCum`。
- buy 只能增加 `okbCum`。
- sell 只能减少 `okbCum`。
- `Curve.totalMinted(okbCum)` 与 ERC-20 supply 的差异只能是已定义 dust。
- Router 交易后不保留 OKB 或 token。
- Hook 的 native OKB 余额必须覆盖用户按曲线可赎回储备。
- `selfDeprecated` 一旦为 true 不可重置。
- graduation migration 只能执行一次。
- Creator 不能 mint、burn、暂停、拉黑、改曲线或提储备。

## 3. Buy 风险

攻击面：

- Slippage 设置过宽导致用户收到更少 token。
- fee recipient claim 到拒收 native OKB 的 recipient 导致 claim revert。
- 恶意 recipient 回调。
- rounding dust 累积。

防护：

- 用户传入 `minTokensOut`。
- fee recipient 必须能主动 claim，claim recipient 必须可接收 native OKB。
- `buy` 使用 CEI 和 `nonReentrant`。
- rounding dust 在 unit/fuzz/invariant 中定义上限。

## 4. Sell 风险

攻击面：

- Same-block buy/sell 对曲线做短周期操纵。
- 用户授权过大。
- Hook 储备不足。
- recipient 拒收 native OKB。

防护：

- buy 成功后同时标记 payer 和 token recipient 的 `lastBuyBlock`。
- sell 要求 `lastBuyBlock[seller] != block.number`，避免买给第三方后由 recipient 同块卖出。
- 前端和脚本默认精确授权。
- Hook 在转账前校验储备。
- native transfer 失败 revert。
- 用户传入 `minOkbOut`。

## 5. Migration 风险

Migration 是当前最大生产风险，因为它依赖外部 Uniswap v4 和 LP burn/lock 逻辑。

必须防止：

- 迁移到错误 pool。
- LP / position 所有权保留在团队 EOA。
- migration target 可被替换。
- 迁移重复执行。
- 迁移后 Hook 状态和资产会计不一致。

商业版本要求：

- migration target 作为不可变地址写入 Factory/Hook。
- target 源码可验证。
- fork 测试证明外部调用路径和 LP 归宿。
- target 返回的 pool 和 liquidity 必须非零。
- 迁移完成后 emit 完整事件。
- 迁移失败必须整体 revert。

## 6. Reentrancy 模型

外部调用包括：

- native OKB fee 累计到 `claimableFeeOkb`，由 fee recipient 主动 claim。
- native OKB 转账到 sell recipient。
- ERC-20 mint / burn / transfer。
- migration target 调用。

要求：

- 所有会移动资产的入口使用 `nonReentrant`。
- 状态更新先于外部转账。
- 外部调用失败必须 revert。
- 不允许 delegatecall 到用户传入地址。

## 7. 权限模型

Factory：

- 无 owner 管理路径。
- 创建 token 无许可。
- 不允许修改已部署 token。

Token：

- 只有绑定 Hook 能 mint/burn。
- 无 blacklist。
- 无 transfer tax。
- 无 owner arbitrary mint。

Hook：

- buy/sell 只能由绑定 Router 调用。
- migration 对任意调用者开放，但必须满足毕业状态。
- 没有 reserve withdraw。

Router：

- 只能操作 Factory registry 中的 token。
- 不接受任意 Hook。

## 8. MEV 与用户保护

Bonding curve 交易存在价格递增和滑点风险。合约提供最小输出保护，但无法替用户选择合理 slippage。

生产前端应：

- 默认设置保守 slippage。
- 对大额 buy 提示价格影响。
- 展示 fee 和有效输入。
- 对 sell 展示净输出。
- 鼓励使用私有 RPC 或 MEV-aware 路由。

## 9. 静态分析策略

每次提交前运行：

```bash
slither src --exclude-informational --exclude-low
```

不可忽略：

- reentrancy。
- unchecked transfer。
- arbitrary delegatecall。
- unprotected state-changing function。
- incorrect access control。

允许保留但必须注释说明：

- 迁移到不可变且部署时验证过的 migration target。
- same-block 检查中的 `block.number` equality。

## 10. 上线前安全清单

- [ ] 外部地址全部确认且有 code。
- [ ] Fork tests 覆盖真实外部地址。
- [ ] migration target 源码已验证。
- [ ] LP burn/lock 归宿已验证。
- [ ] Slither high/medium 为零或有明确处理说明。
- [ ] Fuzz tests 使用 10,000 runs。
- [ ] Invariant tests 使用 CI 参数。
- [ ] Gas report 已保存。
- [ ] Coverage report 已保存。
- [ ] 独立安全 review 完成。
- [ ] 审计完成或明确标记为未审计。
