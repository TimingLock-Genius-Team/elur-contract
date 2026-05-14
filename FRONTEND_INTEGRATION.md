# Eulr 前端对接文档

本文档面向 Eulr 前端（参考 `Eulr Prototype.html` PRD）说明如何与合约后端对接。

阅读顺序建议：

1. 本文 §1–§3：了解架构和导出物。
2. 本文 §4：把前端 PRD 的每一页映射到合约调用。
3. 本文 §5–§8：实现细节（读、写、事件、报价、错误）。
4. 本文 §9–§10：链外补全数据与上线注意事项。
5. `PRODUCT_FLOW.md` / `TECHNICAL_DEVELOPMENT.md` / `SECURITY_MODEL.md`：协议规则、不变式、安全边界。

> 命名约定：本文涉及的方法、事件、错误名称全部直接对应 `frontend/abi/` 内导出的 ABI。前端代码中应直接 import 这些 ABI，不要手写。

## 1. 总体架构

Eulr 协议由一个工厂和「每个 token 一组」隔离合约构成：

```text
                       EulrFactory  (单例，部署一次)
                            |
            createToken --->|
                            v
   ┌──────────────────────────────────────────────────┐
   │           Per-Token Trio (每个 token 独立)        │
   │                                                  │
   │   EulrToken (ERC-20)                             │
   │      ↑ mint/burn 只允许 EulrHook                  │
   │                                                  │
   │   EulrHook (bonding curve + fee + 迁移触发)       │
   │      ↑ buy/sell 只允许 EulrRouter                 │
   │                                                  │
   │   EulrRouter (用户交易入口)                       │
   └──────────────────────────────────────────────────┘
                            |
                            | migrateLiquidity (一次性)
                            v
       UniswapV4MintPositionTarget (协议级单例)
       → mint Uniswap v4 LP，LP 接收方固定为 burn address
```

关键事实：

- **`EulrFactory` 是协议级单例**：所有 token 通过它创建，前端用它做 token 列表和元数据读。
- **每个 token 拥有独立的 (Token, Hook, Router)**：前端必须按 token 维度去读 Hook / Router 地址，不能假定单一地址。
- **结算货币是 native OKB**（不是 wrapped）。`buy` 通过 `msg.value` 发送 OKB；`sell` 通过 hook → 用户的 native OKB 回执完成。前端不需要 wrap/unwrap。
- **合约一旦部署不可升级**，且没有管理员。前端不应展示「暂停」「升级」「治理」等概念。

## 2. 导出物：`frontend/abi/`

由 `npm run export:abis` 从 Foundry 编译产物 (`out/`) 和部署记录 (`deployments/<network>/latest.json`) 自动生成。**不要手改**，请改源然后重新生成。

```
frontend/abi/
  EulrFactory.json                  原始 ABI（运行时用）
  EulrHook.json
  EulrRouter.json
  EulrToken.json
  UniswapV4MintPositionTarget.json
  index.ts                          以 `as const satisfies Abi` 内联，供 viem/wagmi 推断类型
  addresses.json                    每个链的 factory / migrationTarget / curve 参数快照
  addresses.ts                      同上的 TS const 导出
  README.md
```

### 用法（viem 示例）

```ts
import { createPublicClient, createWalletClient, http } from "viem";
import { eulrFactoryAbi, eulrHookAbi, eulrRouterAbi, eulrTokenAbi } from "./frontend/abi";
import { eulrDeployments } from "./frontend/abi/addresses";

const chainId = 196; // XLayer
const [deployment] = eulrDeployments.byChainId[String(chainId)] ?? [];
if (!deployment) throw new Error(`No Eulr deployment recorded for chain ${chainId}`);
const factoryAddress = deployment.factory;
```

### 用法（wagmi 示例）

```ts
import { useReadContract } from "wagmi";
import { eulrFactoryAbi } from "./frontend/abi";

const { data: length } = useReadContract({
  address: factoryAddress,
  abi: eulrFactoryAbi,
  functionName: "allTokensLength",
});
```

ABI 都以 `as const` 内联，wagmi/viem 的 `args` 和 `data` 类型会被精确推断。

## 3. 链上数据结构

### 3.1 `EulrFactory.TokenInfo`

```solidity
struct TokenInfo {
  address token;       // EulrToken 合约
  address hook;        // EulrHook 合约
  address router;      // EulrRouter 合约
  address creator;     // 创建者地址（成功 tx 的 msg.sender）
  string  metadataURI; // 创建者提交（图片 / 简介，最多 512 bytes）
  string  socialURI;   // 创建者提交（社交链接，最多 256 bytes）
}
```

`metadataURI` 和 `socialURI` 由前端在 `createToken` 时上传至 IPFS（或任何只读存储），合约只保留 URI 字符串，**不解析内容**。建议格式见 §4.3。

### 3.2 `EulrHook.CurveState`

```solidity
struct CurveState {
  uint256 okbCum;             // 累计净注入 OKB（不含 fee），单位 1e18
  uint256 totalMinted;        // 当前已 mint 数量（含已 burn 抵扣），单位 1e18
  uint256 currentPrice;       // 当前边际价格 = (S/K) * exp(okbCum / S)，单位 1e18 OKB / token
  uint256 claimableFeeOkb;    // 累积未领取手续费（仅 feeRecipient 可领），单位 1e18
  bool    selfDeprecated;     // 是否已达到 self-deprecation（默认为 minted >= 99% * K）
  bool    liquidityMigrated;  // 流动性是否已迁移到 Uniswap v4
}
```

`progressPct = totalMinted / K` 即前端展示的「曲线进度」。

### 3.3 `BuyQuote` / `SellQuote`

```solidity
struct BuyQuote {
  uint256 grossOkbIn;     // 用户支付的总 OKB（= msg.value）
  uint256 fee;            // 手续费部分（0.3%）
  uint256 effectiveOkbIn; // 进入曲线的 OKB = gross - fee
  uint256 oldOkbCum;
  uint256 newOkbCum;
  uint256 oldMinted;
  uint256 newMinted;
  uint256 tokensOut;      // 用户应当收到的 token 数（含 18 位小数）
}

struct SellQuote {
  uint256 tokensIn;       // 用户提交 burn 的 token 数
  uint256 grossOkbOut;    // 曲线返还的 OKB（不含 fee 扣减）
  uint256 fee;            // 手续费部分（从 gross 扣）
  uint256 netOkbOut;      // 用户实际收到的 OKB = gross - fee
  uint256 oldOkbCum;
  uint256 newOkbCum;
  uint256 oldMinted;
  uint256 newMinted;
}
```

### 3.4 `CurveParams`（曲线常量，所有 token 共享）

```solidity
struct CurveParams {
  uint256 k;                  // 21_000_000e18
  uint256 s;                  // 100e18
  uint16  feeBps;             // 30 (= 0.30%)
  uint16  selfDeprecationBps; // 9900 (= 99% of k)
  uint256 maxBuyOkb;          // 10e18 (= 10 OKB / tx 单次买入上限)
}
```

前端可通过 `factory.curveParams()` 或 `hook.getCurveParams()` 读，也可直接使用 `addresses.json` 中的 `curve` 快照（链上和快照值必须一致）。

## 4. 前端 PRD 页面映射

下面把 `Eulr Prototype.html` 中每个页面映射到具体合约调用。所有「金额展示」前端字段使用 `<value>e18` BigInt，必要时通过 `formatUnits(value, 18)` 转字符串。

### 4.1 Explore 页 (`/`)

PRD 数据需求：token 卡片列表 + 顶部「Tokens live / 24h volume / Graduated / Total trades」统计条。

| PRD 字段 | 数据来源 |
| --- | --- |
| `tokens live` | `factory.allTokensLength()`（精确） |
| `address`, `name`, `symbol`, `creator`, `metadataURI`, `socialURI` | `factory.getTokenInfo(token)` 或 `TokenCreated` 事件 |
| `priceOkb`, `okbCum`, `supply (minted)`, `progressPct`, `graduated` | `hook.curveState()`（每个 token 一次） |
| `holders` | **链外索引**（聚合 ERC-20 `Transfer` 事件） |
| `volume24hUsd`, `priceChange24h`, `sparkline` | **链外索引**（聚合 `Bought` / `Sold` 事件 + USD 价格源） |
| `marketCapUsd` | `currentPrice × totalMinted × OKB_USD` |

#### 4.1.1 分页拉取 token 列表

```ts
const offset = page * pageSize;
const tokens = await publicClient.readContract({
  address: factoryAddress,
  abi: eulrFactoryAbi,
  functionName: "getTokens",
  args: [BigInt(offset), BigInt(pageSize)],
}); // returns: readonly `0x${string}`[]
```

#### 4.1.2 批量读取曲线状态

24 个卡片 = 24 次 `curveState()` 调用。**强烈建议使用 Multicall3** 一次性 RPC：

```ts
// 伪代码：把 (hookAddress, curveState) 编码成单个 multicall
import { multicall } from "viem/actions";
const calls = hookAddresses.map((hook) => ({
  address: hook,
  abi: eulrHookAbi,
  functionName: "curveState" as const,
}));
const states = await publicClient.multicall({ contracts: calls });
```

#### 4.1.3 实时刷新（"Live" 指示灯）

订阅 `Bought` / `Sold`：每个 token 的 hook 是单独地址，所以建议监听协议级范围（所有 hook 都派生自工厂），通过事件 topic 过滤：

```ts
const unwatch = publicClient.watchContractEvent({
  abi: eulrHookAbi,
  eventName: "Bought",
  onLogs: (logs) => {
    for (const log of logs) {
      const { token, grossOkbIn, tokensOut, newOkbCum } = log.args;
      // 把对应卡片标为 flash-bg 动画，刷新 priceOkb / okbCum / progressPct
    }
  },
});
```

> 注意：`watchContractEvent` 不绑定 address 时会监听全网；生产实现请把候选地址收集为 `address: hookAddresses[]`，或者用后端索引器推送，前端订阅 websocket。

#### 4.1.4 各 tab 的本地排序

PRD 的 `Trending` / `New` / `Graduating soon` / `All` 均为客户端排序：

- `Trending`: 按 `volume24hUsd`（链外字段）降序。
- `New`: 按 `createdAt`（`TokenCreated` 事件 `blockNumber → timestamp`）降序。
- `Graduating soon`: 过滤 `progressPct ∈ [70, 99)` 后按 `progressPct` 降序。
- `All`: 默认按 `createdAt` 降序，可由用户切换。

`graduated` 标志通过 `curveState().selfDeprecated || progressPct >= 99` 判定，前端展示「🎓 Graduated」徽标。

### 4.2 Token 详情页 (`/token/[address]`)

PRD 主要区块：

1. 顶部 token header（avatar / 名称 / symbol / graduated badge / 地址 / creator / 社交按钮 / 进度条）
2. 6 张统计卡（Price / Market cap / Supply minted / 24h Volume / Holders / OKB reserve）
3. 价格图（含可选的「Theoretical curve」叠加）
4. Trades / Holders / About 选项卡
5. 右侧粘性 Buy/Sell 面板

#### 4.2.1 一次性聚合读

```ts
const [tokenInfo, state, params] = await Promise.all([
  publicClient.readContract({
    address: factoryAddress, abi: eulrFactoryAbi,
    functionName: "getTokenInfo", args: [tokenAddress],
  }),
  publicClient.readContract({
    address: hookAddress, abi: eulrHookAbi, functionName: "curveState",
  }),
  publicClient.readContract({
    address: hookAddress, abi: eulrHookAbi, functionName: "getCurveParams",
  }),
]);
```

或单次 Multicall：把三个 readContract 编码成同一批。

#### 4.2.2 统计卡映射

| PRD 卡片 | 公式 |
| --- | --- |
| Price | `state.currentPrice / 1e18` OKB（USD 见 §9） |
| Market cap | `state.currentPrice × state.totalMinted / 1e36 × OKB_USD` |
| Supply minted | `state.totalMinted / 1e18`，进度 `= totalMinted / k` |
| 24h Volume | 链外索引 |
| Holders | 链外索引（ERC-20 `Transfer` 唯一 `to` 计数减去归零账户） |
| OKB reserve | `state.okbCum / 1e18` OKB |

#### 4.2.3 价格图

链上不存储历史价格。前端的「Theoretical curve」（曲线虚线）可以纯客户端计算：

```ts
// 给定一段 okbCum 区间画曲线，前端按 §3.4 的 K/S 常量计算
function marginalPrice(okbCum: number, k: number, s: number): number {
  return (s / k) * Math.exp(okbCum / s);
}
```

实际价格（实线）需要把 `Bought` / `Sold` 事件按区块时间聚合到所选时间档（1m / 5m / 1h / 1d）。每个事件的 `newOkbCum` 字段足以在事后任意时刻反推当时的 `currentPrice`，前端不必额外查询。

#### 4.2.3.1 详情页图表数据来源

详情页图表按数据性质分层：

| 图表 / 模块 | 前端数据来源 | 说明 |
| --- | --- | --- |
| 当前价格、当前 supply、OKB reserve、progress | `hook.curveState()` | 页面打开和交易后刷新；可用 multicall 与 token metadata 一起读 |
| 理论 price curve | 前端用 `K` / `S` 采样计算 | 不依赖历史事件，也不需要 backend 存曲线点 |
| 理论 issuance curve | 前端用 `minted(okb) = K * (1 - exp(-okb / S))` 采样计算 | 用于展示发行量随 reserve 增长的理论轨迹 |
| 实际价格历史 | backend/indexer 聚合 `Bought` / `Sold` | 用事件 `newOkbCum + block.timestamp` 反推每个 bucket 的价格 |
| 实际 supply / reserve 历史 | backend/indexer 聚合 `Bought` / `Sold` | `newOkbCum` 反推 `totalMinted`，同时作为历史 reserve |
| 24h volume、price change、sparkline | backend/indexer | 按时间窗口和 bucket 聚合 |
| Trades 表 | backend/indexer 或短窗口 RPC logs | 生产建议走 backend，避免浏览器扫历史 logs |
| Holders 表 | backend/indexer 聚合 `Transfer` | 合约不暴露 holder 列表 |

前端推荐把图表 API 设计成：

```text
GET /api/tokens/:address/summary
GET /api/tokens/:address/chart?range=24h&interval=5m
GET /api/tokens/:address/trades?limit=50&cursor=...
GET /api/tokens/:address/holders?limit=50&cursor=...
```

`summary` 返回当前 UI 展示所需的聚合字段，例如 `holders`、`volume24hOkb`、`volume24hUsd`、`priceChange24h`、`sparkline`。当前价格、supply、reserve 仍以最新 `curveState()` 为准；如果 backend 也返回这些字段，只作为缓存展示，交易报价和 slippage 计算必须重新读链上或调用 `quoteBuy` / `quoteSell`。

合约当前不需要为这些图表新增字段或事件。`TokenCreated`、`Bought`、`Sold` 和 ERC-20 `Transfer` 已足够恢复 token 列表、成交历史、历史价格、历史 supply、volume 和 holder balances。

#### 4.2.4 Trades tab

直接渲染 `Bought` / `Sold` 事件：

```solidity
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
```

PRD 表格列：

- `Time` → `block.timestamp`（索引器补充）
- `Type` → `Bought` 显示 buy，`Sold` 显示 sell
- `OKB` → `Bought`: `grossOkbIn`；`Sold`: `netOkbOut`
- `<Symbol>` → `tokensOut` / `tokensIn`
- `Trader` → `user`（payer）；展示需要支持 `user != recipient` 的情况，PRD 当前未区分，可在 hover tooltip 显示 recipient
- 外链 → 交易区块浏览器（XLayer 浏览器或 OKLink）

#### 4.2.5 Holders tab

链上不暴露 holder 列表；必须使用链外索引器（按 `EulrToken` 地址聚合 `Transfer` 事件，维护 balanceOf 表）。`isCreator` 标记可通过 `tokenInfo.creator` 匹配；`isYou` 通过用户钱包地址匹配。

#### 4.2.6 About tab

直接展示 §3.4 的曲线参数（前端常量或读取 `getCurveParams`），合约地址通过 AddressChip。

#### 4.2.7 Buy/Sell 面板

详见 §6 与 §7。

### 4.3 Create Token 向导 (`/create`)

PRD 字段 → 合约入参：

| PRD 字段 | 合约入参 / 处理 |
| --- | --- |
| `name`（最多 32） | `createToken(name, …)` |
| `symbol`（最多 8，A-Z/0-9，自动大写） | `createToken(_, symbol, …)` |
| `description`（最多 280） | 合并到 `metadataURI` JSON |
| `image` 文件 | 上传至 IPFS，返回 CID 写入 `metadataURI` JSON |
| `twitter` / `telegram` / `website` | 合并到 `socialURI` JSON |
| `acknowledged` 勾选 | 仅前端校验，链上无字段 |

#### 4.3.1 建议的 `metadataURI` / `socialURI` 内容格式

`metadataURI` 和 `socialURI` 在协议层是不透明字符串。建议前端约定如下 schema（最大 512 / 256 bytes），方便所有 Eulr 客户端互通：

```jsonc
// metadataURI -> "ipfs://bafy.../meta.json" 指向：
{
  "name": "PEPE 2099",
  "symbol": "PEPE",
  "description": "A frog token from the future…",
  "image": "ipfs://bafy.../image.png"
}

// socialURI -> "ipfs://bafy.../socials.json" 指向：
{
  "twitter": "https://x.com/pepe2099",
  "telegram": "https://t.me/pepe2099",
  "website": "https://pepe2099.xyz"
}
```

如果不想用 IPFS，可以直接传短链或空串。`512 bytes` 足够装一条 URL 或一个最小 JSON 字符串。

#### 4.3.2 调用 createToken

```ts
const hash = await walletClient.writeContract({
  address: factoryAddress,
  abi: eulrFactoryAbi,
  functionName: "createToken",
  args: [name, symbol, metadataURI, socialURI],
});
const receipt = await publicClient.waitForTransactionReceipt({ hash });
// 从 logs 解析 TokenCreated 事件，得到 token/hook/router
```

事件结构：

```solidity
event TokenCreated(
  address indexed token,
  address indexed hook,
  address router,
  address indexed creator,
  string  metadataURI,
  string  socialURI
);
```

前端拿到 `token` 地址后即可跳转到 `/token/{token}`。

#### 4.3.3 校验和错误

| 失败场景 | 合约错误 |
| --- | --- |
| `name` 空 | `EmptyName` |
| `name` 超过 32 bytes | `NameTooLong` |
| `symbol` 空 | `EmptySymbol` |
| `symbol` 超过 8 bytes | `SymbolTooLong` |
| `metadataURI` > 512 bytes | `MetadataURITooLong` |
| `socialURI` > 256 bytes | `SocialURITooLong` |

PRD 已在 Step1 做了 30 字 / 8 字限制和正则；后端校验是兜底，错误信息映射见 §8。

### 4.4 Portfolio 页 (`/portfolio`)

PRD 数据需求：

- Header：用户 OKB 余额（来自钱包 RPC，不在合约里）
- 总值卡片
- Holdings 表格
- History 表格

#### 4.4.1 Holdings

链上不维护用户的 token 持仓清单。两种实现路径：

1. **链外索引**（推荐）：后端订阅 `EulrToken.Transfer`，按 `to` 维护用户→{token: balance} 表。Portfolio 拉一次 `GET /api/portfolio/:address`。
2. **纯前端**（仅小用户）：从本地缓存的「已交互 token 列表」（首次访问 explore 或 token 页时记录）发起多个 `token.balanceOf(user)` 调用。

每行所需字段：

| PRD 列 | 数据来源 |
| --- | --- |
| token avatar/name/symbol | `factory.getTokenInfo(token)` + `metadataURI` 解析 |
| `balance` | `token.balanceOf(user)` |
| `avgCost` | **链外索引**，需要从用户历史 buy/sell 计算 |
| `price` | `hook.currentPrice()` |
| `value` | `balance × price × OKB_USD` |
| `PnL` | `value − costBasis` |

#### 4.4.2 History

直接订阅 `Bought` 和 `Sold` 事件中 `indexed user == 用户地址` 的所有 log，按时间倒序展示。

## 5. 链上读操作汇总

| 用途 | 调用 |
| --- | --- |
| token 总数 | `factory.allTokensLength() → uint256` |
| token 分页 | `factory.getTokens(offset, limit) → address[]` |
| token 元数据 | `factory.getTokenInfo(token) → TokenInfo` |
| 校验地址是否 Eulr token | `factory.isToken(token) → bool` |
| 协议曲线参数 | `factory.curveParams() → CurveParams`（或 `hook.getCurveParams()`） |
| 当前快照 | `hook.curveState() → CurveState` |
| 单字段（gas 更省） | `hook.okbCum()` / `hook.totalMinted()` / `hook.currentPrice()` / `hook.selfDeprecated()` / `hook.liquidityMigrated()` |
| 报价 | `hook.quoteBuy(okbIn)` / `hook.quoteSell(tokensIn)` 或同名 `router.*` |
| 用户余额 | `token.balanceOf(user)` |
| 用户对 router 的授权 | `token.allowance(user, router)` |
| 同块限制（卖出冷却） | `hook.lastBuyBlock(user)` |
| 待领手续费 | `hook.claimableFeeOkb()`（运营页用） |

注：所有 `address` 字段返回 checksum 格式；前端比较时统一 `getAddress(addr)` 后再比较。

## 6. 链上写操作

### 6.1 Buy

```ts
const quote = await publicClient.readContract({
  address: hookAddress, abi: eulrHookAbi,
  functionName: "quoteBuy", args: [grossOkbIn],
}); // { tokensOut, fee, newOkbCum, ... }

// 用户允许的最小输出（建议默认 0.5% 滑点）
const minTokensOut = (quote.tokensOut * 995n) / 1000n;

const hash = await walletClient.writeContract({
  address: routerAddress,
  abi: eulrRouterAbi,
  functionName: "buy",
  args: [tokenAddress, minTokensOut, recipient],
  value: grossOkbIn, // native OKB
});
```

约束：

- `grossOkbIn` ≤ `curveParams.maxBuyOkb`（默认 10 OKB），超过即 `GrossOkbInTooLarge`。
- `grossOkbIn` > 0，否则 `GrossOkbInZero`。
- 报价精确，但用户提交和上链之间状态可能变化 → 必须给 `minTokensOut`。**禁止生产 UI 默认 `minTokensOut = 0`**（与 CLI 一致：拒绝 `--min-out 0` 除非显式 `--allow-zero-min-out`）。
- token 已 graduate 后买入会 `SelfDeprecatedBuyClosed`，PRD 在已毕业 token 上隐藏 Buy tab，改为「Trade on Uniswap」CTA。

### 6.2 Sell

Sell 是两步：先 `approve`，再 `router.sell`。

```ts
// 1. 检查 allowance
const allowance = await publicClient.readContract({
  address: tokenAddress, abi: eulrTokenAbi,
  functionName: "allowance", args: [user, routerAddress],
});

// 2. 不足时 approve（建议一次性授权 type(uint256).max 以省 gas，
//    但若 PRD 倾向显式精确授权也可逐次 approve(tokensIn)）
if (allowance < tokensIn) {
  const approveHash = await walletClient.writeContract({
    address: tokenAddress, abi: eulrTokenAbi,
    functionName: "approve", args: [routerAddress, tokensIn],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });
}

// 3. 报价并设置 minOut
const quote = await publicClient.readContract({
  address: hookAddress, abi: eulrHookAbi,
  functionName: "quoteSell", args: [tokensIn],
});
const minOkbOut = (quote.netOkbOut * 995n) / 1000n;

// 4. 卖出
const hash = await walletClient.writeContract({
  address: routerAddress,
  abi: eulrRouterAbi,
  functionName: "sell",
  args: [tokenAddress, tokensIn, minOkbOut, recipient],
});
```

注意事项：

- `router.sell` 内部调用 `token.transferFrom(user, hook, tokensIn)`，没授权会 `InsufficientAllowance`。
- **同区块限制**：合约禁止 `lastBuyBlock[seller] == block.number` 的卖出（防止三明治套利）。前端如果在用户 buy 后立即提示卖出，必须等下一区块。错误是 `SameBlockSell`。
- `tokensIn > balance` 在 `transferFrom` 阶段 revert（`InsufficientAllowance` 或 `InsufficientBalance`，取决于授权大小）。
- 滑点保护：参考 `minOkbOut`，**禁止默认 0**。

### 6.3 Graduated token 的「Trade on Uniswap」

`hook.liquidityMigrated == true` 时，PRD 显示 "Minting ended" 卡片和 "Trade on Uniswap" CTA。前端需要构造 Uniswap v4 的 swap 入口 URL：

- pool key 必须使用 `addresses.json` 中的 `uniswapV4PoolManager` 和迁移时使用的参数（`poolFee`, `tickSpacing`, `hooks`, `currency0`, `currency1`）。
- 这些参数从 `MigrationData` 解码或由 `UniswapV4MintPositionTarget.expected*` 视图函数读取：
  - `expectedPoolFee()` / `expectedTickSpacing()` / `expectedHooks()` / `expectedTickLower()` / `expectedTickUpper()` / `expectedHookDataHash()`
- LP 接收方固定为 `0x000000000000000000000000000000000000dEaD`（链上已强制），前端可以在 About tab 显式声明「LP 已永久销毁」。

### 6.4 创建 token

见 §4.3。

### 6.5 运营专用：claim fees

普通用户钱包无法调用，只有 `feeRecipient`（部署时确定）可以触发：

```solidity
function claimFees(address recipient) external returns (uint256 amount);
```

不属于前端 PRD 的常规页面，但运营仪表盘可以读 `hook.claimableFeeOkb()`，通过 multicall 求和所有 hook 得到协议总待领手续费。

### 6.6 运营/任意调用者：migrate liquidity

任何地址都可以在 token 达到 self-deprecation 阈值后触发：

```solidity
function migrateLiquidity(bytes calldata migrationData)
  external returns (address pool, uint256 liquidity);
```

`migrationData` 是 ABI 编码的 `MigrationData.Params`（见 `src/migration/MigrationData.sol`）。前端如果需要做「自动 graduation」按钮，建议直接走后端服务调用 `ts/cli/migrate-liquidity.ts` 的逻辑而不是浏览器内构造。

## 7. 报价、滑点与价格冲击（Price Impact）

PRD 的「Price impact」徽章逻辑（`<1%` 绿 / `1%–5%` 黄 / `>5%` 红 + 大额单二次确认弹窗）应在前端用以下公式计算：

```ts
const quote = await readContract(/* quoteBuy or quoteSell */);
const oldPrice = currentPrice; // 来自 curveState
const newPrice = marginalPrice(quote.newOkbCum, k, s); // §4.2.3 公式

const impact = (newPrice - oldPrice) / oldPrice; // buy
// sell: impact = (oldPrice - newPrice) / oldPrice
```

阈值（沿用 PRD）：

- `>= 5%` 必须弹出 ConfirmModal，要求用户再次确认。
- 单笔 `grossOkbIn >= 5 OKB`（即接近 `maxBuyOkb / 2`）也建议弹窗，避免误操作。

**Eulr 的 curve 不会有「无限滑点」陷阱**：`maxBuyOkb = 10 OKB` 上限把任何一笔买入的最大 impact 自然限制；常规挂单时 0.5% 默认滑点已经足够。但前端仍必须给 `minOut`，因为他人可能在你之前抢上同一区块。

## 8. 错误映射

合约错误是 `error` selector，钱包通常显示为「execution reverted: 0xNNNNNNNN」。前端建议用 viem 的 `decodeErrorResult` + 一个统一的中文/英文映射表。

| 错误（selector） | 触发场景 | 建议提示 |
| --- | --- | --- |
| `EmptyName` / `NameTooLong` | createToken 输入不合规 | "请输入 1–32 字的代币名称" |
| `EmptySymbol` / `SymbolTooLong` | createToken 输入不合规 | "Symbol 必须 1–8 个字母/数字" |
| `MetadataURITooLong` / `SocialURITooLong` | URI 超长 | "Metadata 链接过长，请改用 IPFS CID" |
| `UnknownToken` | factory 收到非 Eulr token | "该地址不是 Eulr 代币" |
| `InvalidToken` | router 收到错配 token | "Router 与 token 不匹配，请刷新页面" |
| `SlippageExceeded` | 报价后被抢跑 | "价格已变动，请重新报价" |
| `SelfDeprecatedBuyClosed` | 已毕业 token 还在 buy | "该代币已毕业，请到 Uniswap 交易" |
| `SameBlockSell` | 同区块卖出 | "请等待下一区块后再卖出" |
| `InsufficientReserve` | 不应该发生（不变式保证） | "网络异常，请稍后重试" |
| `GrossOkbInZero` / `TokensInZero` | 输入 0 | "请输入大于 0 的数量" |
| `GrossOkbInTooLarge` | 单笔 > 10 OKB | "单笔买入上限 10 OKB" |
| `MintedOutOfRange` | sell 数量超过总 mint | "余额不足或数量异常" |
| `InsufficientBalance` (EulrToken) | sell 时余额不足 | "余额不足" |
| `InsufficientAllowance` (EulrToken) | 未授权 router | "请先授权 Router" |
| `ReentrantCall` | 不应该发生 | "网络异常" |
| `NotSelfDeprecated` / `LiquidityAlreadyMigrated` / `MigrationTargetMissing` / `InvalidMigrationResult` | migrate 流程异常 | 运营页用，不暴露给普通用户 |

完整列表请直接看 `frontend/abi/*.json` 中的 `"type": "error"` 条目。

## 9. 链外补全数据

下列字段必须由后端索引器/价格 oracle 提供，链上没有：

生产 backend/indexer 约定使用 **Bun.js** 实现 API、事件消费和聚合任务。本仓库现有 Node/npm TypeScript CLI 只用于合约部署、smoke、ABI 导出和本地调试；前端不要把这些 CLI 当作生产 indexer。

| 字段 | 来源 | 备注 |
| --- | --- | --- |
| `OKB_USD` | 价格 oracle（CoinGecko / OKX API / Chainlink） | PRD 全站统一一个值；建议 1 分钟更新一次 |
| `priceUsd`, `marketCapUsd` | 计算 = 链上 `priceOkb` × `OKB_USD` × `decimals` | 仅展示，不参与交易 |
| `volume24hUsd` | 索引 `Bought.grossOkbIn` + `Sold.grossOkbOut`，按 24h 窗口求和 × `OKB_USD` | |
| `priceChange24h` | 当前 `currentPrice` 与 24h 前 `currentPrice` 的差 | 24h 前价格可由 24h 前最近一次 `Bought` / `Sold` 事件的 `newOkbCum` 反推 |
| `sparkline` | 24 个时间桶的 `currentPrice` 序列 | 用事件聚合 |
| `holders` | 维护 `EulrToken.Transfer` 状态表，统计 `balanceOf > 0` 的地址数 | 注意排除 `address(0)`、`migrationTarget`、burn address |
| `avgCost` / `costBasis` / `realizedPnL` | 用户视角下从其 buy/sell 历史 FIFO 计算 | Portfolio 专用 |
| `tx hash` 区块浏览器链接 | 拼接 `https://www.oklink.com/oktc/tx/<hash>` 或类似 | 链 ID 196 对应 XLayer |

参考索引器表结构（PostgreSQL）：

```sql
-- token 表：从 TokenCreated 事件
tokens(address pk, name, symbol, creator, metadata_uri, social_uri, created_block, created_ts)

-- trade 表：合并 Bought / Sold
trades(tx_hash pk, log_index pk, token, user, recipient, type ENUM('buy','sell'),
       gross_okb, fee_okb, tokens, new_okb_cum, block, ts)

-- balance 表：从 EulrToken.Transfer
balances(token, holder, balance, last_block) -- PRIMARY KEY (token, holder)

-- snapshot 视图：每 10 分钟物化
token_state(token, current_price_okb, total_minted, okb_cum, holders, volume_24h, last_price_24h)
```

推荐 API 契约：

```text
GET /api/tokens/:address/summary
```

返回详情页顶部和统计卡所需的聚合字段：

```json
{
  "token": "0x...",
  "holders": 1234,
  "volume24hOkb": "4200000000000000000",
  "volume24hUsd": "8440.00",
  "priceChange24hPct": "12.34",
  "sparkline": [
    { "ts": 1715600000, "priceOkb": "1000000000000" }
  ]
}
```

```text
GET /api/tokens/:address/chart?range=24h&interval=5m
```

返回图表点。每个点应由 `Bought` / `Sold` 的 `newOkbCum` 和对应区块时间聚合得到：

```json
{
  "range": "24h",
  "interval": "5m",
  "points": [
    {
      "ts": 1715600000,
      "okbCum": "1000000000000000000",
      "priceOkb": "5260000000000",
      "totalMinted": "20800000000000000000000",
      "volumeOkb": "300000000000000000"
    }
  ]
}
```

```text
GET /api/tokens/:address/trades?limit=50&cursor=...
GET /api/tokens/:address/holders?limit=50&cursor=...
GET /api/portfolio/:wallet
```

`trades` 直接来自 `Bought` / `Sold`；`holders` 和 portfolio holdings 来自 `Transfer` 聚合后的 balance 表；portfolio 的 `avgCost`、`costBasis`、`realizedPnL` 由用户维度 trade history 计算。

如果 indexer 暂未上线，前端可以只展示链上当前状态和理论曲线；`holders`、`volume24h`、`priceChange24h`、历史图、portfolio cost basis 必须显示为 `-` / loading，不要显示为 `0`。

## 10. 链与环境配置

| 项目 | Anvil（dev） | XLayer（prod） |
| --- | --- | --- |
| `chainId` | 31337 | 196 |
| 货币 | OKB (18 dec, 但 Anvil 实际是 ETH) | OKB native |
| RPC 环境变量 | `ANVIL_RPC_URL` | `XLAYER_RPC_URL` |
| Factory | `addresses.json` 中 `byNetwork.anvil.factory` | `addresses.json` 中 `byNetwork.xlayer.factory`（部署后填入） |
| Migration Target | 同上 `migrationTarget` | 同上 |
| 区块浏览器 | 无 | `https://www.oklink.com/x-layer` |

前端连接 XLayer 钱包配置：

```ts
import { defineChain } from "viem";
export const xlayer = defineChain({
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_XLAYER_RPC_URL!] } },
  blockExplorers: { default: { name: "OKLink", url: "https://www.oklink.com/x-layer" } },
});
```

PRD 的「Wrong network」横幅触发条件：`walletClient.chain.id !== expectedChainId`。

## 11. 上线前清单

- [ ] `npm run export:abis` 在每次合约或部署变更后自动跑（建议放在 CI 的 build 步骤）。
- [ ] 部署 XLayer 后把 `deployments/xlayer/latest.json` commit，再跑一次 `export:abis`，前端拉到 `addresses.json` 才会含 XLayer 条目。
- [ ] 前端要做 `factory.isToken(token)` 校验，防止用户用钓鱼地址绕过 UI。
- [ ] Buy/Sell 默认滑点必须非 0（与 CLI 一致），单笔超 5 OKB 弹二次确认。
- [ ] 已毕业 token 不允许通过前端调 `router.buy`，UI 显示 "Trade on Uniswap"。
- [ ] 网络非 XLayer 时禁用所有写按钮，显示 "Wrong network — switch to X Layer"。
- [ ] Multicall3 在 XLayer 上的地址：见 `lib/forge-std`（`Multicall3 = 0xcA11bde05977b3631167028862bE2a173976CA11`，跨链通用）。
- [ ] Portfolio / Explore 的 "holders" / "volume24h" 等链外字段在索引器未就绪时必须降级为「—」，不可显示 0。

## 12. 参考资料

- `frontend/abi/` — 当前 ABI + 地址快照（本文同源）
- `PRODUCT_DOCUMENT.md` — 协议规则与边界
- `PRODUCT_FLOW.md` — 完整链上流程（创建 / 买 / 卖 / 毕业 / 迁移）
- `TECHNICAL_DEVELOPMENT.md` — 架构、接口、不变式
- `SECURITY_MODEL.md` — 信任边界、攻击面
- `DEPLOYMENT_RUNBOOK.md` — 本地 / fork / XLayer 部署
- `ts/cli/buy.ts` / `ts/cli/sell.ts` / `ts/cli/create-token.ts` — CLI 参考实现，前端可以照搬调用模式
