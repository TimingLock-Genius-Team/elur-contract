# SATPAD 合约后端开发文档：Forge + Anvil + TypeScript

## 1. 文档目标

本文档定义 SATPAD 合约后端的工程开发方式：

```text
Contracts: Foundry / Forge
Local chain: Anvil
Backend scripts: TypeScript + viem
Target chain: XLayer
Protocol: sat1 bonding curve + Factory + per-token Hook/Router
```

当前开发范围不包含客户端应用。TypeScript 只用于部署、命令行调试、smoke test、地址验证和生成部署产物。

开发过程中必须同步维护：

- `PRODUCT_DOCUMENT.md`
- `PRODUCT_FLOW.md`
- `TECHNICAL_DEVELOPMENT.md`
- `TESTING_GUIDE.md`
- `COMMERCIAL_READINESS.md`
- `DEPLOYMENT_RUNBOOK.md`
- `SECURITY_MODEL.md`

## 2. 工程目录

```text
uniswap-hook-pool/
  foundry.toml
  remappings.txt
  package.json
  tsconfig.json
  .env.example

  src/
    factory/
      SatpadFactory.sol
    token/
      SatpadToken.sol
    curve/
      Curve.sol
      CurveTypes.sol
    hook/
      SatpadHook.sol
    router/
      SatpadRouter.sol
    interfaces/
      ISatpadFactory.sol
      ISatpadHook.sol
      ISatpadRouter.sol
    libraries/
      NativeOkbTransfer.sol
    mocks/
      LocalExternalDependency.sol
      LocalMigrationTarget.sol

  test/
    unit/
    integration/
    invariant/
    fork/
    handlers/

  script/
    CheckChain.s.sol
    LocalDeployFactory.s.sol
    DeployFactory.s.sol
    CreateToken.s.sol
    InspectToken.s.sol
    QuoteBuy.s.sol
    Buy.s.sol
    QuoteSell.s.sol
    Sell.s.sol
    SimulateGraduation.s.sol
    MigrateLiquidity.s.sol
    VerifyXLayerAddresses.s.sol

  ts/
    config/
      chains.ts
      contracts.ts
      params.ts
    deploy/
      00-check-chain.ts
      01-deploy-factory.ts
      02-write-deployment.ts
    cli/
      create-token.ts
      inspect-token.ts
      quote-buy.ts
      buy.ts
      quote-sell.ts
      sell.ts
      simulate-graduation.ts
      migrate-liquidity.ts
    lib/
      clients.ts
      units.ts
      addresses.ts
      artifacts.ts
      tx.ts

  deployments/
    anvil/latest.json
    xlayer/latest.json

  PRODUCT_DOCUMENT.md
  TECHNICAL_DEVELOPMENT.md
  TESTING_GUIDE.md
```

## 3. Foundry 配置

初始化：

```bash
forge init --no-commit
```

依赖：

```bash
forge install foundry-rs/forge-std
forge install OpenZeppelin/openzeppelin-contracts
forge install Uniswap/v4-core
forge install Uniswap/v4-periphery
```

`foundry.toml`：

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc_version = "0.8.26"
optimizer = true
optimizer_runs = 200
evm_version = "cancun"
via_ir = true

[fuzz]
runs = 1000

[invariant]
runs = 512
depth = 50

[rpc_endpoints]
xlayer = "${XLAYER_RPC_URL}"
```

说明：

- Uniswap v4 依赖 Cancun EVM。
- fork tests 使用环境变量 RPC。
- 不提交 `.env`、private key、RPC secret。

## 4. TypeScript 配置

依赖：

```bash
npm install viem
npm install --save-dev typescript tsx dotenv
```

可选测试依赖：

```bash
npm install --save-dev vitest
```

`package.json` scripts：

```json
{
  "scripts": {
    "anvil": "anvil --chain-id 31337",
    "build": "forge build",
    "test": "forge test",
    "test:fuzz": "forge test --fuzz-runs 10000",
    "test:invariant": "forge test --match-path 'test/invariant/*'",
    "test:fork:local": "forge test --match-path 'test/fork/*'",
    "test:fork:xlayer": "XLAYER_CHAIN_ID=${XLAYER_CHAIN_ID:-196} forge test --match-path 'test/fork/*' --fork-url $XLAYER_RPC_URL",
    "slither": "slither src --exclude-informational --exclude-low",
    "ci": "forge fmt --check && forge build && forge test --fuzz-runs 10000 && forge test --match-path 'test/invariant/*' && forge test --match-path 'test/fork/*' && npx tsc --noEmit && npm run slither",
    "deploy:anvil": "tsx ts/deploy/00-check-chain.ts && tsx ts/deploy/01-deploy-factory.ts && tsx ts/deploy/02-write-deployment.ts",
    "script:verify-xlayer-addresses": "forge script script/VerifyXLayerAddresses.s.sol:VerifyXLayerAddresses --rpc-url $XLAYER_RPC_URL",
    "create-token": "tsx ts/cli/create-token.ts",
    "inspect-token": "tsx ts/cli/inspect-token.ts",
    "quote:buy": "tsx ts/cli/quote-buy.ts",
    "buy": "tsx ts/cli/buy.ts",
    "quote:sell": "tsx ts/cli/quote-sell.ts",
    "sell": "tsx ts/cli/sell.ts",
    "simulate:graduation": "tsx ts/cli/simulate-graduation.ts",
    "migrate:liquidity": "tsx ts/cli/migrate-liquidity.ts",
    "claim:fees": "tsx ts/cli/claim-fees.ts",
    "smoke:anvil": "npm run deploy:anvil && npm run create-token -- --name Demo --symbol DEMO --metadata-uri ipfs://demo && npm run quote:buy -- --okb 1 && npm run buy -- --okb 1 --min-out 0 && npm run quote:sell -- --tokens 1 && npm run sell -- --tokens 1 --min-out 0 && npm run simulate:graduation && npm run migrate:liquidity && npm run claim:fees"
  }
}
```

`.env.example`：

```text
XLAYER_RPC_URL=
XLAYER_CHAIN_ID=196
ANVIL_RPC_URL=http://127.0.0.1:8545
PRIVATE_KEY=
TEAM_MULTISIG=
UNISWAP_V4_POOL_MANAGER=
UNISWAP_V4_POSITION_MANAGER=
MIGRATION_TARGET=
```

## 5. 合约开发顺序

推荐顺序：

```text
1. Curve tests
2. Curve implementation
3. SatpadToken tests
4. SatpadToken implementation
5. Factory validation tests
6. SatpadFactory implementation
7. Hook buy/sell tests
8. SatpadHook implementation
9. Router settlement tests
10. SatpadRouter implementation
11. same-block / selfDeprecated tests
12. graduation migration tests
13. invariant tests
14. TypeScript deploy + CLI scripts
15. XLayer fork tests
16. Slither / gas report / coverage
```

不要先写部署脚本再补曲线和 Hook 不变量。Curve 和 Hook 状态机是协议核心。

## 6. `Curve` 开发要求

固定参数：

```text
K = 21_000_000e18
S = 100e18
feeBps = 30
selfDeprecationBps = 9900
maxBuyOkb = 10e18
```

函数：

```solidity
function marginalPrice(uint256 okbCum, CurveParams memory params) internal pure returns (uint256);
function totalMinted(uint256 okbCum, CurveParams memory params) internal pure returns (uint256);
function okbAtMinted(uint256 minted, CurveParams memory params) internal pure returns (uint256);
function quoteBuy(uint256 okbCum, uint256 grossOkbIn, CurveParams memory params) internal pure returns (BuyQuote memory);
function quoteSell(uint256 okbCum, uint256 tokensIn, CurveParams memory params) internal pure returns (SellQuote memory);
```

实现注意：

- `exp` / `ln` 使用定点数学库。
- near `K` 的反函数必须防 overflow。
- `minted == K` revert。
- fee 不进入 `newOkbCum`。
- 所有 rounding 误差写入测试说明。

## 7. `SatpadFactory` 开发要求

Factory 构造参数：

```solidity
constructor(
    address feeRecipient,
    address migrationTarget
)
```

创建接口：

```solidity
function createToken(
    string calldata name,
    string calldata symbol,
    string calldata metadataURI,
    string calldata socialURI
) external returns (address token, address hook, address router);
```

开发要求：

- Factory 构造时校验 fee recipient 和 migration target 非零。
- XLayer fork 测试中校验 Uniswap 和 migration target 外部地址 code。
- 创建成功后写入 registry。
- emit `TokenCreated`。
- 不收额外部署费。
- 不提供删除 token 功能。

## 8. `SatpadHook` 开发要求

关键接口：

```solidity
function buy(address payer, address recipient, uint256 minTokensOut)
    external
    payable
    onlyRouter
    returns (uint256 tokensOut);

function sell(address seller, address recipient, uint256 tokensIn, uint256 minOkbOut)
    external
    onlyRouter
    returns (uint256 okbOut);

function migrateLiquidity(bytes calldata migrationData)
    external
    returns (address pool, uint256 liquidity);
```

开发要求：

- `okbCum` 是唯一曲线状态。
- buy exact-input OKB。
- sell exact-input token。
- buy 限制 `10 OKB`。
- same-block sell 防护按 user + token 隔离。
- selfDeprecated 后 buy 永久关闭。
- sell 不因 selfDeprecated 关闭。
- migration 只能执行一次。

## 9. `SatpadRouter` 开发要求

Router 作为用户入口：

```solidity
function buy(address token, uint256 minTokensOut, address recipient) external payable returns (uint256);
function sell(address token, uint256 tokensIn, uint256 minOkbOut, address recipient) external returns (uint256);
function quoteBuy(address token, uint256 okbIn) external view returns (BuyQuote memory);
function quoteSell(address token, uint256 tokensIn) external view returns (SellQuote memory);
```

要求：

- token 必须来自 Factory registry。
- recipient zero address revert。
- sell 前拉取 token 或校验 allowance。
- 交易后 Router 不残留 OKB/token。
- quote 直接读取对应 Hook。

## 10. TypeScript CLI 要求

所有 CLI 都必须：

- 校验 chainId。
- 从 deployment JSON 读取地址。
- 校验合约 code 存在。
- 输出 tx hash 和 block number。
- 失败时 exit code 非零。

### `create-token`

输入：

```text
--name
--symbol
--metadata-uri
--social-uri optional
```

输出：

```text
token
hook
router
creator
tx hash
block number
```

### `quote-buy` / `quote-sell`

输出：

```text
gross input/output
fee
effective input or net output
tokens out or OKB out
old okbCum
new okbCum
selfDeprecated projection
```

### `buy` / `sell`

输出：

```text
input amount
min output
tx hash
block number
post okbCum
post totalMinted
post selfDeprecated
```

### `simulate-graduation`

只用于本地或 fork 测试，不应在主网脚本中绕过真实经济流程。

## 11. Anvil 流程

启动：

```bash
anvil --chain-id 31337
```

部署：

```bash
npm run build
npm run deploy:anvil
```

Smoke：

```bash
npm run create-token -- --name Demo --symbol DEMO --metadata-uri ipfs://demo
npm run inspect-token -- --token <address>
npm run quote:buy -- --token <address> --okb 1
npm run buy -- --token <address> --okb 1 --min-out <value>
npm run quote:sell -- --token <address> --tokens <value>
npm run sell -- --token <address> --tokens <value> --min-out <value>
```

检查：

- token/hook/router 都有 code。
- buy 后 `okbCum` 增加。
- sell 后 `okbCum` 减少。
- fee accounting 正确。
- Router 不残留资产。

## 12. XLayer Fork 流程

运行：

```bash
XLAYER_CHAIN_ID=196 forge test --match-path "test/fork/*" --fork-url $XLAYER_RPC_URL -vvv
```

验证：

- chainId 正确。
- `UNISWAP_V4_POOL_MANAGER` 有 code。
- `UNISWAP_V4_POSITION_MANAGER` 有 code。
- Factory 可部署。
- Factory 创建 token 成功。
- 小额 buy/sell 成功。
- migration 路径可执行或明确 revert 原因。

## 13. 部署产物

`deployments/<network>/latest.json`：

```json
{
  "chainId": 31337,
  "commit": "fd46a81",
  "deployedAt": "2026-05-12T00:00:00.000Z",
  "deployer": "0x...",
  "factory": "0x...",
  "feeRecipient": "0x...",
  "uniswapV4PoolManager": "0x...",
  "uniswapV4PositionManager": "0x...",
  "migrationTarget": "0x...",
  "curve": {
    "k": "21000000000000000000000000",
    "s": "100000000000000000000",
    "feeBps": 30,
    "selfDeprecationBps": 9900,
    "maxBuyOkb": "10000000000000000000"
  },
  "createdTokens": []
}
```

部署脚本必须覆盖旧文件，或写入带 timestamp 的历史文件并更新 `latest.json`。

生产部署产物还必须记录 commit hash、deployer、源码验证链接、smoke tx hash 和外部地址来源。

## 14. CI 建议

```bash
forge fmt --check
forge build
forge test
forge test --fuzz-runs 10000
forge test --match-path "test/invariant/*"
slither src --exclude-informational --exclude-low
npm run deploy:anvil
npm run smoke:anvil
```

主网部署前：

```bash
XLAYER_CHAIN_ID=196 forge test --match-path "test/fork/*" --fork-url $XLAYER_RPC_URL
forge test --gas-report
forge coverage
```

## 15. 安全开发规则

必须：

- 使用 SafeERC20。
- 使用 reentrancy protection。
- native OKB transfer failure revert。
- 所有状态变化 emit event。
- 所有外部地址可验证。
- quote 和 execute 共享 Curve。

禁止：

- 任意 mint。
- blacklist。
- transfer tax。
- owner withdraw reserve。
- selfDeprecated reset。
- creator 修改曲线参数。
- 未验证地址硬编码。
- secrets 入库。

## 16. 商业可用迭代规则

每个阶段都必须遵循：

1. 先更新产品/技术/测试文档中受影响的规则。
2. 再写或更新测试。
3. 再改合约、脚本或 TypeScript。
4. 跑对应验证命令。
5. 提交一个阶段 commit。

不能把“本地 mock 跑通”等同于“主网可用”。涉及外部协议的功能必须有 fork test 和部署 runbook。

## 17. 待确认事项

1. 团队 Safe 多签完整地址。
2. XLayer Uniswap v4 PoolManager / PositionManager 地址。
3. LP burn/lock 的具体接口。
4. entropy 是否进入 MVP。
5. metadata URI 最大长度。
