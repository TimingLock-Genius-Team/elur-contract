# SATPAD 商业可用清单

本文档定义“商业可用”的最低门槛。当前仓库已经具备本地 MVP 和完整本地测试基础，但仍不能宣称已可主网商业部署，原因是外部地址、真实迁移适配器、fork 验证和审计仍未完成。

## 1. 当前状态

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| Curve 数学 | 已实现 | 使用 `PRBMath UD60x18`，包含 fuzz 与 rounding dust 测试。 |
| Token | 已实现 | Hook-only mint/burn，无 owner mint、blacklist、transfer tax。 |
| Factory | 已实现 | 无许可创建 token/hook/router，记录 registry。 |
| Hook buy/sell | 已实现 | 使用 `okbCum` 单状态、slippage、same-block sell 防护。 |
| Router | 已实现 | 验证 registry，交易后不保留资产。 |
| Fee | 已实现 | 即时 native OKB 转账到 `feeRecipient`。 |
| Graduation | 已实现 | 达阈值后 buy 关闭，sell 保持开放。 |
| Migration | 本地适配 | 当前通过 mock/adapter 接口验证流程，真实 Uniswap v4 target 仍待实现和 fork 测试。 |
| Solidity scripts | 已实现本地流 | 本地 Anvil deploy/create/quote/buy/sell/graduation/migration 可跑。 |
| TypeScript CLI | 已实现本地流 | 用于本地部署、调试和 deployment JSON。 |
| CI | 已实现基础门禁 | GitHub Actions 运行格式、构建、Forge 测试、invariant、guarded fork、TS 类型检查和 Slither。 |
| Fork tests | 待补强 | 需要真实 XLayer RPC 和外部地址。 |
| 审计 | 未完成 | 主网上线前必须完成外部审计或独立安全 review。 |

## 2. 必须补齐的生产阻塞项

### P0: 外部地址验证

- 团队 Safe 多签地址。
- sat1 Hook Deployer 完整地址。
- XLayer Uniswap v4 PoolManager 地址。
- XLayer Uniswap v4 PositionManager 地址。
- LP burn 或 lock 合约地址。

所有地址必须满足：

- 非零地址。
- 目标链上有 code。
- 与官方来源或团队签名确认一致。
- 写入 `.env.example`、部署脚本、fork 测试和 deployment JSON。

### P0: 真实迁移适配器

当前 migration target 只证明协议 Hook 能把 OKB/token 迁出并标记一次性迁移。商业版本必须实现或接入真实适配器：

- 初始化或复用 Uniswap v4 pool。
- 添加 OKB/token 流动性。
- 获得 LP / position 权益。
- 将 LP / position burn 或永久锁定。
- emit 可索引事件。
- fork 测试证明迁移后团队 EOA 无法取回 LP。

### P0: XLayer fork 门禁

上线前必须运行：

```bash
forge test --match-path "test/fork/*" --fork-url $XLAYER_RPC_URL -vvv
```

Fork 测试必须覆盖：

- `block.chainid`。
- 外部地址 code。
- Factory 部署。
- Token 创建。
- 小额 buy/sell。
- migration target 调用路径。

### P0: 审计与独立复核

主网商业可用前必须完成：

- Slither high/medium 全部处理。
- Fuzz / invariant 使用 CI 参数跑通。
- Gas report 留档。
- 覆盖率报告留档。
- 至少一次独立安全 review。
- 对外资金上线前完成正式审计。

## 3. 安全门禁

每次部署前必须检查：

- 每个状态修改函数都有明确调用权限。
- 外部调用使用 CEI 和 `nonReentrant`。
- ERC-20 return value 已检查或使用 SafeERC20。
- native OKB 转账失败会 revert。
- Slippage 参数由用户控制，不在合约中默认跳过。
- fee 不进入 `okbCum`。
- `okbCum` 是唯一曲线主状态。
- Factory 不能删除 token 或修改曲线。
- Creator 不能 mint/burn/暂停/拉黑。
- Router 不能保留用户资产。
- `selfDeprecated` 没有重置路径。
- migration 只能执行一次。

## 4. 测试门禁

PR / 阶段提交前：

```bash
npm run ci
```

等价展开命令：

```bash
forge fmt --check
forge build
forge test
forge test --fuzz-runs 10000
forge test --match-path "test/invariant/*"
forge test --match-path "test/fork/*"
npx tsc --noEmit
slither src --exclude-informational --exclude-low
```

主网部署前额外运行：

```bash
forge test --match-path "test/fork/*" --fork-url $XLAYER_RPC_URL -vvv
forge test --gas-report
forge coverage
npm run deploy:anvil
npm run smoke:anvil
```

## 5. 文档门禁

每次改代码后必须同步检查：

- `PRODUCT_DOCUMENT.md` 是否描述了最新产品规则。
- `PRODUCT_FLOW.md` 是否描述了最新用户流程。
- `TECHNICAL_DEVELOPMENT.md` 是否描述了最新架构和接口。
- `TESTING_GUIDE.md` 是否描述了最新测试覆盖。
- `FORGE_ANVIL_TS_DEVELOPMENT.md` 是否描述了最新脚本和命令。
- `DEPLOYMENT_RUNBOOK.md` 是否描述了最新部署步骤。
- `SECURITY_MODEL.md` 是否描述了最新信任边界和风险。

## 6. 发布阶段

### Stage 0: 本地 MVP

要求：

- 本地 Anvil 全流程跑通。
- Solidity scripts 和 TypeScript CLI 都可使用。
- unit / integration / invariant / fuzz / Slither 通过。

### Stage 1: Testnet / Fork Candidate

要求：

- 外部地址全部补齐。
- fork 测试通过。
- 真实 migration target 完成。
- deployment JSON 稳定输出。
- gas report 和 coverage 留档。

### Stage 2: Audit Candidate

要求：

- 代码冻结。
- 文档冻结。
- 已知 P0/P1 全部关闭。
- 独立安全 review 完成。
- 审计材料齐全。

### Stage 3: Commercial Launch

要求：

- 审计发现已处理。
- 源码验证完成。
- 多签确认。
- 主网部署和 smoke test 完成。
- 紧急响应文档和监控方案完成。

## 7. 当前不能宣称完成的事项

以下事项完成前，不能称为主网商业可用：

- 未验证真实 XLayer 外部地址。
- 未实现真实 Uniswap v4 迁移和 LP burn/lock 适配器。
- 未运行 XLayer fork migration 测试。
- 未完成外部审计。
- 未部署并验证主网源码。
