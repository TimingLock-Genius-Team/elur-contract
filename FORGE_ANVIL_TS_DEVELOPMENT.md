# Eulr 合约后端开发文档：Forge + Anvil + TypeScript

## 1. 文档目标

本文档定义 Eulr 合约后端的工程开发方式：

```text
Contracts: Foundry / Forge
Local chain: Anvil
Contract repo scripts: TypeScript + viem
Target chain: XLayer
Protocol: sat1 bonding curve + Factory + per-token Hook/Router
```

当前开发范围不包含客户端应用或产品 backend/indexer。TypeScript 只用于部署、命令行调试、smoke test、地址验证和生成部署产物；产品 backend/indexer 约定使用 Bun.js，并在独立服务实现时补充对应开发文档。

开发过程中必须同步维护：

- `PRODUCT_DOCUMENT.md`
- `PRODUCT_FLOW.md`
- `TECHNICAL_DEVELOPMENT.md`
- `TESTING_GUIDE.md`
- `COMMERCIAL_READINESS.md`
- `DEPLOYMENT_RUNBOOK.md`
- `SECURITY_MODEL.md`
- `FRONTEND_INTEGRATION.md`（当 ABI、前端读写接口或 Bun.js backend/indexer 数据契约变化时）

## 2. 工程目录

下面列出当前真实存在的目录结构。如出现 drift，应以仓库根目录的实际文件为准，并把本文档同步更新。

```text
eulr-contract/
  foundry.toml
  remappings.txt
  package.json
  tsconfig.json
  .env.example

  src/
    factory/
      EulrFactory.sol
    token/
      EulrToken.sol
    curve/
      Curve.sol
      CurveTypes.sol
    hook/
      EulrHook.sol
    router/
      EulrRouter.sol
    migration/
      BaseUniswapV4MigrationTarget.sol
      MigrationData.sol
      UniswapV4MintPositionTarget.sol
      UniswapV4PoolKey.sol
    interfaces/
      IEulrFactory.sol
      IEulrHook.sol
      IEulrRouter.sol
      IEulrToken.sol
      IMigrationTarget.sol
    libraries/
      NativeOkbTransfer.sol
      ReentrancyGuard.sol
    mocks/
      LocalExternalDependency.sol
      LocalMigrationTarget.sol

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
    invariant/
    fork/
      XLayerAddressFork.t.sol
    handlers/

  script/
    CheckChain.s.sol
    EulrScriptBase.s.sol
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
    ClaimFees.s.sol
    VerifyXLayerAddresses.s.sol

  ts/
    config/
      chains.ts
      env.ts
      params.ts
      artifacts.ts
      deployments.ts
      migration-target-deployments.ts
    deploy/
      00-check-chain.ts
      00-deploy-uniswap-v4-mint-position-target.ts
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
      claim-fees.ts
      doctor-deployment.ts
      doctor-migration-target.ts
      doctor-xlayer-readiness.ts
      preflight-xlayer.ts
      preflight-xlayer-readiness.ts
      xlayer-deployment-gate.ts
      smoke-anvil-accounts.ts
      check-lcov-coverage.ts
    lib/
      anvil-smoke-accounts.ts
      args.ts
      artifacts.ts
      clients.ts
      contracts.ts
      deployment-doctor.ts
      deployments.ts
      json.ts
      lcov-coverage.ts
      live-run-guard.ts
      migration-data.ts
      migration-target-deployment.ts
      preflight.ts
      redaction.ts
      transactions.ts
      units.ts
      xlayer-deployment-gate.ts
      xlayer-readiness-consistency.ts
      *.test.ts

  deployments/
    anvil/latest.json
    xlayer/latest.json
    xlayer/uniswap-v4-mint-position-target.json

  README.md
  CHANGELOG.md
  PRODUCT_DOCUMENT.md
  PRODUCT_FLOW.md
  TECHNICAL_DEVELOPMENT.md
  TESTING_GUIDE.md
  FORGE_ANVIL_TS_DEVELOPMENT.md
  COMMERCIAL_READINESS.md
  DEPLOYMENT_RUNBOOK.md
  SECURITY_MODEL.md
  ANVIL_SMOKE_REPORT.md
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

`package.json` scripts 以仓库根目录的 `package.json` 为准。当前主要分组（如果与本文档脱节，以 `package.json` 为唯一来源）：

- 本地链：`anvil`、`build`、`test`、`test:ts`、`test:fuzz`、`test:invariant`、`test:fork:local`、`test:fork:xlayer`。
- 覆盖率：`coverage`、`coverage:lcov`、`coverage:95`（基于 lcov 报告校验 line coverage ≥ 95%）。
- 静态分析与 CI：`slither`、`ci`（包含 fmt/build/fuzz/invariant/fork/tsc/test:ts/coverage:95/slither）。
- Forge scripts：`script:check-chain`、`script:deploy-local`、`script:deploy-xlayer`、`script:create-token`、`script:inspect-token`、`script:quote-buy`、`script:buy`、`script:quote-sell`、`script:sell`、`script:simulate-graduation`、`script:migrate-liquidity`、`script:claim-fees`、`script:verify-xlayer-addresses`。
- TypeScript 部署 / 门禁：`deploy:anvil`、`deploy:migration-target`、`preflight:xlayer`、`preflight:xlayer:readiness`、`gate:xlayer`、`doctor:deployment`、`doctor:migration-target`、`doctor:xlayer-readiness`。
- TypeScript CLI：`create-token`、`inspect-token`、`quote:buy`、`buy`、`quote:sell`、`sell`、`simulate:graduation`、`migrate:liquidity`、`claim:fees`。
- Smoke：`smoke:anvil`（单 signer 全链路）、`smoke:anvil:accounts`（多 Anvil signer 串行回归）。

`.env.example` 以仓库根目录的 `.env.example` 为准。当前包含三类变量：

- 网络与签名：`XLAYER_RPC_URL`、`XLAYER_CHAIN_ID`、`ANVIL_RPC_URL`、`PRIVATE_KEY`、`DEPLOYMENT_NETWORK`、`GIT_COMMIT`、`DEPLOYED_AT`、`EXPECTED_CHAIN_ID`。
- 协议外部依赖：`TEAM_MULTISIG`、`UNISWAP_V4_POOL_MANAGER`、`UNISWAP_V4_POSITION_MANAGER`、`LP_RECIPIENT`、`MIGRATION_TARGET`。
- Uniswap v4 迁移参数：`XLAYER_V4_HOOKS`、`XLAYER_V4_POOL_FEE`、`XLAYER_V4_TICK_SPACING`、`XLAYER_V4_TICK_LOWER`、`XLAYER_V4_TICK_UPPER`、`XLAYER_V4_MIGRATION_LIQUIDITY`、`XLAYER_V4_HOOK_DATA`、`MIGRATION_DEADLINE_SECONDS`。
- Forge / CLI 调试参数：`FACTORY`、`TOKEN`、`TOKEN_NAME`、`TOKEN_SYMBOL`、`METADATA_URI`、`SOCIAL_URI`、`RECIPIENT`、`OKB_IN`、`TOKENS_IN`、`MIN_TOKENS_OUT`、`MIN_OKB_OUT`、`ALLOW_ZERO_MIN_OUT`、`GRADUATION_BUY_SIZE`。

新增 / 删除环境变量时必须同步更新 `.env.example`、`DEPLOYMENT_RUNBOOK.md` §1 和 `ts/lib/preflight.ts` 中的校验集合。

## 5. 合约开发顺序

推荐顺序：

```text
1. Curve tests
2. Curve implementation
3. EulrToken tests
4. EulrToken implementation
5. Factory validation tests
6. EulrFactory implementation
7. Hook buy/sell tests
8. EulrHook implementation
9. Router settlement tests
10. EulrRouter implementation
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

## 7. `EulrFactory` 开发要求

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

function getTokens(uint256 offset, uint256 limit) external view returns (address[] memory tokens);
```

开发要求：

- Factory 构造时校验 fee recipient 和 migration target 非零。
- XLayer fork 测试中校验 Uniswap 和 migration target 外部地址 code。
- 创建成功后写入 registry。
- emit `TokenCreated`，其中 creator 必须 indexed，便于按创建者过滤。
- `getTokens(offset, limit)` 按创建顺序分页返回 token 地址，服务无索引器的 token 列表页。
- 不收额外部署费。
- `metadataURI` 最多 512 bytes，`socialURI` 最多 256 bytes。
- 不提供删除 token 功能。

## 8. `EulrHook` 开发要求

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

function curveState() external view returns (CurveState memory);
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
- `curveState()` 聚合返回前端详情页核心状态，但不得保存第二套曲线状态。

## 9. `EulrRouter` 开发要求

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

每个 PR 必须运行：

```bash
npm run ci
```

`npm run ci` 展开为：

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

补充本地验证：

```bash
npm run deploy:anvil
npm run smoke:anvil
```

主网部署前还需要：

```bash
npm run gate:xlayer
forge test --match-path "test/fork/*" --fork-url $XLAYER_RPC_URL -vvv
forge test --gas-report
npm run coverage
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
