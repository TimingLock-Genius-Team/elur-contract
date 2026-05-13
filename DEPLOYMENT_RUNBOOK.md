# SATPAD 部署 Runbook

本文档描述从本地验证到 XLayer 生产部署的操作流程。所有命令都应在仓库根目录执行。

## 1. 环境变量

创建本地 `.env`，不要提交：

```bash
XLAYER_RPC_URL=
ANVIL_RPC_URL=http://127.0.0.1:8545
PRIVATE_KEY=
TEAM_MULTISIG=
UNISWAP_V4_POOL_MANAGER=
UNISWAP_V4_POSITION_MANAGER=
LP_RECIPIENT=
MIGRATION_TARGET=
```

生产部署前必须确认：

- `PRIVATE_KEY` 属于部署 EOA 或部署专用 signer。
- `TEAM_MULTISIG` 是可接收 native OKB 的 Safe 或接收合约。
- `LP_RECIPIENT` 是最终接收或永久锁定 / burn Uniswap v4 position 权益的地址，并且必须与上线 migration data 中的 `lpRecipient` 一致。
- 所有外部地址来自官方或团队签名来源。
- `.env` 不进入 git。

待核验的 Ethereum mainnet sat1 参考线索（不能作为部署依据）：

- `Sat1HookDeployer`: `0xcbE096C140dB48199CC7e481116FD835BC33eDC6`
- `Sat1Hook`: `0x2a0A30dd78aF7698E6f40212b8B8324fcE2ee888`
- `Sat1Token`: `0x8f66337a0c2A02202fd91Dd596c411CF977c6060`
- deployer EOA: `0x248C2FCEBAc1413fCA4da21B675cdaEb4fF20681`
- `Sat1HookDeployer` deployment tx: `0x7a60ceb20059b775d9b71d113193e318aad43c73af637e54321d5712802d4f8c`

这些地址当前只作为 sat1 参考实现和 Hook deployer 复用设计的待核验线索；不能直接视为 XLayer 生产外部地址，也不能用于部署参数。若 Factory 重新引入 `Sat1HookDeployer` 依赖，部署前必须通过官方来源、区块浏览器和 `cast code` / `cast tx` 在目标链确认同名合约地址、源码、code 和权限位都匹配预期。

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
npm run claim:fees -- --token <token>
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
MIN_TOKENS_OUT=<quote.tokensOut> \
npm run script:buy
npm run script:quote-sell
MIN_OKB_OUT=<quote.netOkbOut> \
npm run script:sell
```

Solidity buy / sell scripts default to rejecting zero min-out. Local-only debugging can set `ALLOW_ZERO_MIN_OUT=true`; production and fork smoke must use quoted non-zero values.

毕业迁移：

```bash
npm run script:simulate-graduation
npm run script:migrate-liquidity
npm run script:claim-fees
```

## 4. 阶段验证

每个阶段提交前运行：

```bash
forge fmt --check
forge build
forge test
forge test --match-path "test/invariant/*"
npx tsc --noEmit
npm run test:ts
npm run doctor:deployment -- --network anvil
slither src --exclude-informational --exclude-low
```

部署 JSON 或生产参数变更后，先运行 doctor 检查必填字段、chainId、地址格式和已创建 token 记录。提供 RPC 时会额外检查 chainId 和合约 code：

```bash
npm run doctor:deployment -- --network xlayer --rpc-url "$XLAYER_RPC_URL" --chain-id 196
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
XLAYER_CHAIN_ID=196 forge test --match-path "test/fork/*" --fork-url $XLAYER_RPC_URL -vvv
```

Fork 测试必须验证：

- `block.chainid` 是预期 XLayer chain id。
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

TypeScript 本地部署脚本和 Forge XLayer 部署脚本都会检查外部地址是否已有 code：

- `UNISWAP_V4_POOL_MANAGER`
- `UNISWAP_V4_POSITION_MANAGER`
- `MIGRATION_TARGET`

先部署真实 Uniswap v4 migration target：

```bash
GIT_COMMIT=$(git rev-parse --short HEAD) \
DEPLOYED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ") \
DEPLOYMENT_NETWORK=xlayer \
npm run deploy:migration-target
```

该命令使用 `UNISWAP_V4_POOL_MANAGER`、`UNISWAP_V4_POSITION_MANAGER` 和 `LP_RECIPIENT` 作为构造参数，部署 `UniswapV4MintPositionTarget`，检查 PoolManager / PositionManager 和新 target 都有 code，并写入 `deployments/xlayer/uniswap-v4-mint-position-target.json`（包含 `transactionHash` 以便浏览器核验）。确认记录后，先运行：

```bash
npm run doctor:migration-target -- --network xlayer --rpc-url $XLAYER_RPC_URL
```

通过后把其中的 `migrationTarget` 地址设置为 `MIGRATION_TARGET`，再部署 Factory：

```bash
GIT_COMMIT=$(git rev-parse --short HEAD) \
DEPLOYED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ") \
DEPLOYMENT_NETWORK=xlayer \
npm run script:deploy-xlayer
```

`DeployFactory` 会在部署后写入 `deployments/xlayer/latest.json`。Forge 脚本要求 `GIT_COMMIT` 和 `DEPLOYED_AT` 都是非空值；`npm run script:deploy-xlayer` 会默认填充当前短 commit 和 UTC ISO 时间，也可以在发布冻结时显式传入固定值。

部署后：

1. 检查 `deployments/xlayer/latest.json` 中的 chainId、commit、deployer、Factory、Uniswap 地址和 migration target。
2. 运行 `npm run doctor:deployment -- --network xlayer --rpc-url $XLAYER_RPC_URL`。
3. 在区块浏览器验证源码。
4. 创建一个小额测试 token。
5. 执行小额 buy。
6. 下一块执行小额 sell。
7. 记录 tx hash、block number、地址和验证链接。

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
uniswapV4PoolManager:
uniswapV4PositionManager:
migrationTarget:
verificationUrl:
smokeCreateTx:
smokeBuyTx:
smokeSellTx:
```
