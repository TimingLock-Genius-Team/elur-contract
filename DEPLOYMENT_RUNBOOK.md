# SATPAD 部署 Runbook

本文档描述从本地验证到 XLayer 生产部署的操作流程。所有命令都应在仓库根目录执行。

## 1. 环境变量

创建本地 `.env`，不要提交：

```bash
XLAYER_RPC_URL=
ANVIL_RPC_URL=http://127.0.0.1:8545
PRIVATE_KEY=
TEAM_MULTISIG=
SAT1_HOOK_DEPLOYER=
UNISWAP_V4_POOL_MANAGER=
UNISWAP_V4_POSITION_MANAGER=
MIGRATION_TARGET=
```

生产部署前必须确认：

- `PRIVATE_KEY` 属于部署 EOA 或部署专用 signer。
- `TEAM_MULTISIG` 是可接收 native OKB 的 Safe 或接收合约。
- 所有外部地址来自官方或团队签名来源。
- `.env` 不进入 git。

## 2. 本地部署流程

启动 Anvil：

```bash
npm run anvil
```

部署 Factory：

```bash
npm run deploy:anvil
```

创建测试 token：

```bash
npm run create-token -- --name Demo --symbol DEMO --metadata-uri ipfs://demo
```

检查 token：

```bash
npm run inspect-token -- --token <token>
```

报价并买入：

```bash
npm run quote:buy -- --token <token> --okb 1
npm run buy -- --token <token> --okb 1 --min-out <quote.tokensOut>
```

报价并卖出：

```bash
npm run quote:sell -- --token <token> --tokens <amount>
npm run sell -- --token <token> --tokens <amount> --min-out <quote.netOkbOut>
```

模拟毕业和迁移：

```bash
npm run simulate:graduation -- --token <token>
npm run migrate:liquidity -- --token <token>
```

## 3. Solidity Script 流程

检查 chain：

```bash
npm run script:check-chain
```

本地部署：

```bash
npm run script:deploy-local
```

创建 token：

```bash
npm run script:create-token
```

交易：

```bash
npm run script:quote-buy
npm run script:buy
npm run script:quote-sell
npm run script:sell
```

毕业迁移：

```bash
npm run script:simulate-graduation
npm run script:migrate-liquidity
```

## 4. 阶段验证

每个阶段提交前运行：

```bash
forge fmt --check
forge build
forge test
forge test --match-path "test/invariant/*"
npx tsc --noEmit
slither src --exclude-informational --exclude-low
```

主网候选前运行更严格版本：

```bash
forge test --fuzz-runs 10000
forge test --match-path "test/invariant/*" --fuzz-runs 1000
forge test --gas-report
forge coverage
```

## 5. XLayer Fork 验证

Fork 测试要求真实 `XLAYER_RPC_URL`：

```bash
npm run script:verify-xlayer-addresses
forge test --match-path "test/fork/*" --fork-url $XLAYER_RPC_URL -vvv
```

Fork 测试必须验证：

- `block.chainid` 是预期 XLayer chain id。
- `SAT1_HOOK_DEPLOYER` 有 code。
- `UNISWAP_V4_POOL_MANAGER` 有 code。
- `UNISWAP_V4_POSITION_MANAGER` 有 code。
- `MIGRATION_TARGET` 有 code。
- Factory 可部署。
- Token 可创建。
- 小额 buy / sell 成功。
- 迁移路径可执行或明确 revert 原因。

## 6. XLayer 部署流程

部署前冻结：

1. 确认 git 工作区干净。
2. 确认 commit hash。
3. 确认所有 P0 readiness item 已关闭。
4. 确认 `.env` 地址。
5. 运行完整验证。

部署：

```bash
forge script script/DeployFactory.s.sol:DeployFactory \
  --rpc-url $XLAYER_RPC_URL \
  --broadcast \
  --verify
```

部署后：

1. 保存 `deployments/xlayer/latest.json`。
2. 在区块浏览器验证源码。
3. 创建一个小额测试 token。
4. 执行小额 buy。
5. 下一块执行小额 sell。
6. 记录 tx hash、block number、地址和验证链接。

## 7. 回滚与失败处理

合约不可升级，部署失败时不能“回滚”已部署地址，只能停止使用该 Factory 并重新部署。

失败处理原则：

- 如果构造参数错误，废弃部署地址。
- 如果外部地址错误，废弃部署地址。
- 如果源码验证失败，暂停发布，先修复验证流程。
- 如果 smoke buy/sell 失败，暂停发布，保留 tx 和日志定位。
- 如果迁移路径失败，不允许开放生产交易。

## 8. 上线记录

每次生产部署必须记录：

```text
network:
chainId:
commit:
deployer:
factory:
feeRecipient:
sat1HookDeployer:
uniswapV4PoolManager:
uniswapV4PositionManager:
migrationTarget:
verificationUrl:
smokeCreateTx:
smokeBuyTx:
smokeSellTx:
```
