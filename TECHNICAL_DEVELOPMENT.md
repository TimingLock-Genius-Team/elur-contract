# SATPAD 合约后端技术文档

## 1. 技术目标

本文档只描述 SATPAD 合约后端的技术实现。当前不开发客户端、页面、图表、钱包连接或独立索引服务。

合约后端目标：

- 在 XLayer 主网上提供无许可代币创建工厂。
- 每个代币拥有独立 ERC-20、Hook、Router。
- 使用 sat1 指数 bonding curve。
- 只用 `okbCum` 作为曲线主状态。
- 支持 OKB buy、token sell、毕业迁移、LP burn/lock。
- 输出完整 ABI、事件和部署产物，供第三方客户端或脚本使用。

商业可用版本还必须满足 `COMMERCIAL_READINESS.md`、`DEPLOYMENT_RUNBOOK.md` 和 `SECURITY_MODEL.md` 中的门禁。本文档描述技术设计，不能替代 fork 验证、源码验证和安全审计。

## 2. 系统架构

```text
Creator
  -> SatpadFactory
      -> SatpadToken
      -> SatpadHook
      -> SatpadRouter

Trader
  -> SatpadRouter
      -> SatpadHook
          -> Curve
          -> SatpadToken

Graduation Caller
  -> SatpadHook.migrateLiquidity()
      -> Uniswap v4
      -> LP burn/lock
```

核心合约：

```text
SatpadFactory
SatpadToken
SatpadHook
SatpadRouter
Curve
```

外部依赖：

```text
XLayer native OKB
Uniswap v4 PoolManager / PositionManager（必须在 XLayer 验证）
Migration target（真实 Uniswap v4 + LP burn/lock 适配器，必须在 XLayer fork 验证）
PRBMath fixed-point math
```

## 3. 曲线数学

sat1 曲线：

```text
price(okb)  = (S / K) * e^(okb / S)
minted(okb) = K * (1 - e^(-okb / S))
```

反函数：

```text
okbAtMinted(q) = -S * ln(1 - q / K)
```

固定参数：

```text
K = 21_000_000e18
S = 100e18
feeBps = 30
selfDeprecationBps = 9900
maxBuyOkb = 10e18
```

毕业净投入：

```text
okbAtMinted(0.99 * K) = -100 * ln(0.01) = 460.517 OKB
```

Solidity 实现要求：

- 使用可靠定点数学库实现 `exp` / `ln`。
- 明确 token decimals 和 OKB decimals 都按 18 位处理。
- `minted >= K` 的反函数必须 revert。
- near-threshold rounding 必须有测试定义。
- quote 和 execute 必须使用同一套函数。

## 4. 单状态设计

`SatpadHook` 的唯一曲线状态：

```solidity
uint256 public okbCum;
```

从 `okbCum` 推导：

```solidity
uint256 minted = Curve.totalMinted(okbCum, params);
uint256 price = Curve.marginalPrice(okbCum, params);
bool graduated = minted >= (K * 9900 / 10000);
```

禁止把以下值作为曲线判断状态：

- 手动维护的 minted。
- 手动维护的 graduation progress。
- 单独的 curve supply checkpoint。

`SatpadToken.totalSupply()` 只作为 ERC-20 实际供应，不作为曲线主状态。若 rounding 导致供应与曲线推导值有 dust，必须在测试中定义上限。

## 5. `Curve` Library

职责：

- 不存储状态。
- 提供价格、供应、反函数、quote。
- 统一处理 fee、rounding 和边界。

建议类型：

```solidity
struct CurveParams {
    uint256 k;
    uint256 s;
    uint16 feeBps;
    uint16 selfDeprecationBps;
    uint256 maxBuyOkb;
}

struct BuyQuote {
    uint256 grossOkbIn;
    uint256 fee;
    uint256 effectiveOkbIn;
    uint256 oldOkbCum;
    uint256 newOkbCum;
    uint256 oldMinted;
    uint256 newMinted;
    uint256 tokensOut;
}

struct SellQuote {
    uint256 tokensIn;
    uint256 grossOkbOut;
    uint256 fee;
    uint256 netOkbOut;
    uint256 oldOkbCum;
    uint256 newOkbCum;
    uint256 oldMinted;
    uint256 newMinted;
}
```

建议函数：

```solidity
function marginalPrice(uint256 okbCum, CurveParams memory params) internal pure returns (uint256);
function totalMinted(uint256 okbCum, CurveParams memory params) internal pure returns (uint256);
function okbAtMinted(uint256 minted, CurveParams memory params) internal pure returns (uint256);
function quoteBuy(uint256 okbCum, uint256 grossOkbIn, CurveParams memory params) internal pure returns (BuyQuote memory);
function quoteSell(uint256 okbCum, uint256 tokensIn, CurveParams memory params) internal pure returns (SellQuote memory);
function isSelfDeprecated(uint256 okbCum, CurveParams memory params) internal pure returns (bool);
```

## 6. `SatpadFactory`

职责：

- 对外开放 `createToken`。
- 校验创建参数。
- 直接部署独立 Token、Hook、Router。
- 固定曲线参数。
- 记录 token 列表。
- 发出 `TokenCreated` 事件。

建议状态：

```solidity
address public immutable feeRecipient;
address public immutable migrationTarget;

address[] public allTokens;
mapping(address token => TokenInfo) public tokenInfo;
```

建议接口：

```solidity
function createToken(
    string calldata name,
    string calldata symbol,
    string calldata metadataURI,
    string calldata socialURI
) external returns (address token, address hook, address router);

function allTokensLength() external view returns (uint256);
function getTokenInfo(address token) external view returns (TokenInfo memory);
```

校验：

- name 非空且不超过 32 字符。
- symbol 非空且不超过 8 字符。
- metadata URI 可为空且不超过 512 bytes。
- social URI 可为空且不超过 256 bytes。
- fee recipient、migration target 均非零。

Factory 不应具备：

- 删除 token。
- 修改已部署 token 曲线。
- 代表用户提取储备。
- 任意暂停全部 token。

## 7. `SatpadToken`

职责：

- 标准 ERC-20。
- 只允许绑定 Hook mint/burn。
- 暴露 name、symbol、decimals。

建议接口：

```solidity
function mint(address to, uint256 amount) external onlyHook;
function burn(address from, uint256 amount) external onlyHook;
function hook() external view returns (address);
```

禁止：

- owner arbitrary mint。
- blacklist。
- transfer tax。
- 修改用户余额。
- 代理升级后门，除非另行设计并审计。

## 8. `SatpadHook`

职责：

- 保存 `okbCum`。
- 执行 buy / sell 经济逻辑。
- 管理 same-block sell 防护。
- 触发 self-deprecation。
- 执行毕业迁移。

建议状态：

```solidity
SatpadToken public immutable token;
address public immutable router;
address public immutable feeRecipient;
address public immutable factory;

CurveParams public curveParams;
uint256 public okbCum;
bool public selfDeprecated;
bool public liquidityMigrated;

mapping(address user => uint256 blockNumber) public lastBuyBlock;
```

核心接口：

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

function quoteBuy(uint256 okbIn) external view returns (BuyQuote memory);
function quoteSell(uint256 tokensIn) external view returns (SellQuote memory);
function migrateLiquidity(bytes calldata migrationData) external returns (address pool, uint256 liquidity);
```

### Buy 状态流

```text
1. 校验 router、msg.value、maxBuy、selfDeprecated。
2. Curve.quoteBuy(okbCum, msg.value, params)。
3. 校验 tokensOut >= minTokensOut。
4. okbCum = quote.newOkbCum。
5. lastBuyBlock[payer] = block.number。
6. `claimableFeeOkb += fee`。
7. token.mint(recipient, tokensOut)。
8. 如果达到阈值，selfDeprecated = true。
9. emit Bought / SelfDeprecated。
```

### Sell 状态流

```text
1. 校验 router、tokensIn、same-block sell。
2. Router 已把 token 转入或已授权 Hook burn。
3. Curve.quoteSell(okbCum, tokensIn, params)。
4. 校验 netOkbOut >= minOkbOut。
5. 校验 Hook 曲线储备足够支付。
6. okbCum = quote.newOkbCum。
7. token.burn(seller, tokensIn) 或 burn 已转入 token。
8. `claimableFeeOkb += fee`。
9. recipient 收到 netOkbOut。
10. emit Sold。
```

### Graduation 状态流

```text
1. 校验 selfDeprecated == true。
2. 校验 liquidityMigrated == false。
3. 计算可迁移 OKB 和 token。
4. 调用 Uniswap v4 初始化或添加流动性。
5. burn/lock LP。
6. liquidityMigrated = true。
7. emit LiquidityMigrated / LiquidityBurned。
```

## 9. `SatpadRouter`

职责：

- 提供用户稳定入口。
- 处理 native OKB。
- 处理 ERC-20 allowance / transfer。
- 做 slippage 参数传递。
- 保证交易结束后不残留用户资产。

建议接口：

```solidity
function buy(address token, uint256 minTokensOut, address recipient)
    external
    payable
    returns (uint256 tokensOut);

function sell(address token, uint256 tokensIn, uint256 minOkbOut, address recipient)
    external
    returns (uint256 okbOut);

function quoteBuy(address token, uint256 okbIn) external view returns (BuyQuote memory);
function quoteSell(address token, uint256 tokensIn) external view returns (SellQuote memory);
```

Router 必须从 Factory 读取 token 对应 Hook，避免用户传入任意 Hook。

## 10. Fee 模型

Hook 记录 `claimableFeeOkb`，team multisig 主动 claim。

优点：

- buy / sell 不依赖 fee recipient 接收逻辑。
- fee 不进入 `okbCum`，也不会被迁移进 LP。

风险：

- 需要额外状态和 claim 权限测试。

当前实现采用累计 claim。只有 `feeRecipient` 能调用 `claimFees(recipient)`，且 claim 只能提取 `claimableFeeOkb`。

## 11. 事件

```solidity
event TokenCreated(
    address indexed token,
    address indexed hook,
    address indexed router,
    address creator,
    string metadataURI,
    string socialURI
);

event Bought(
    address indexed token,
    address indexed user,
    address indexed recipient,
    uint256 grossOkbIn,
    uint256 fee,
    uint256 tokensOut,
    uint256 oldOkbCum,
    uint256 newOkbCum
);

event Sold(
    address indexed token,
    address indexed user,
    address indexed recipient,
    uint256 tokensIn,
    uint256 grossOkbOut,
    uint256 fee,
    uint256 netOkbOut,
    uint256 oldOkbCum,
    uint256 newOkbCum
);

event FeesClaimed(address indexed recipient, uint256 amount);

event SelfDeprecated(address indexed token, uint256 okbCum, uint256 minted);
event LiquidityMigrated(address indexed token, address indexed pool, uint256 okbAmount, uint256 tokenAmount);
event LiquidityBurned(address indexed token, address indexed pool, uint256 liquidity);
```

事件必须覆盖第三方读取协议状态所需的最小数据。

## 12. 部署流程

### 本地

```text
1. 部署或 mock 外部依赖。
2. 部署 SatpadFactory。
3. 使用 Factory 创建测试 token。
4. buy 小额 OKB。
5. sell 小额 token。
6. 模拟达到毕业阈值。
7. 执行 liquidity migration。
8. 输出 deployment JSON。
```

### XLayer

```text
1. 验证 chainId。
2. 验证 Uniswap v4 地址有 code。
3. 验证 migration target 地址有 code。
4. 运行 fork tests。
5. 部署 Factory。
6. 验证 Factory 源码。
7. 创建测试 token。
8. 小额 buy / sell smoke test。
9. 保存部署产物。
```

部署产物：

```json
{
  "chainId": 196,
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
  }
}
```

`chainId` 必须以 XLayer 实际配置为准，部署脚本不能假设。

## 13. 安全要求

必须：

- Checks-Effects-Interactions。
- Reentrancy protection。
- SafeERC20。
- native OKB transfer failure revert。
- slippage checks。
- factory token registry validation。
- quote / execute shared math。
- no trapped assets in Router。

禁止：

- 任意 mint。
- blacklist。
- transfer tax。
- reserve withdraw。
- creator 修改曲线参数。
- selfDeprecated reset。
- 未验证地址硬编码。
- private key / RPC secret 入库。

## 14. 商业可用技术缺口

当前实现已覆盖本地 MVP，但主网商业部署前必须完成：

- 将 migration target 替换为真实 Uniswap v4 + LP burn/lock 适配器。
- 补齐 `test/fork/*` 中对真实 XLayer 外部地址和 migration path 的验证。
- 部署脚本必须在 XLayer 上校验所有外部依赖 code。
- deployment JSON 必须记录 chain id、commit、factory、fee recipient、Uniswap、migration target 和 curve params。
- 源码验证命令必须成为 runbook 的一部分。
- 审计前冻结接口和事件格式。

## 15. 待确认事项

商业部署前必须确认：

1. 团队 Safe 多签完整地址。
2. XLayer Uniswap v4 PoolManager / PositionManager 完整地址。
3. LP burn/lock 的具体接口。
4. entropy 是否进入 MVP。
