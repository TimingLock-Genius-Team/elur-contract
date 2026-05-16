# Eulr 曲线、毕业、迁移与创建参数——机制摘要

面向产品与前端、对外说明、自行核对合约的参与者。本文是**规则说明**，不是收益或价格承诺。链上语义以 `src/`、`PRODUCT_DOCUMENT.md`、`TESTING_GUIDE.md` 为准；Web Docs（`web/src/app/docs/page.tsx`）为简化版，遇歧义以本文与源码为准。

---

## 1. 核心结论速览

| 议题 | 要点 |
|------|------|
| 毕业阈值 | **隐含铸造量** `totalMinted(okbCum) ≥ 99% × K`（默认 `selfDeprecationBps = 9900`），**不是**用 ERC‑20 `totalSupply()` 替代判据。 |
| 毕业时 | 某笔 **buy** 成功后可能置 `selfDeprecated`；之后 **buy 永久关**，**sell 仍开**。 |
| 不可逆 | `selfDeprecated` 一旦为真，**不会因卖出**再撤销。 |
| **K** | Token 侧渐近上限（wei）。创建者**不可改**（来自 `Curve.defaultParams()`）。 |
| **S** | 出现在 **`okbCum / S`**，与 **K** 共同决定价格节奏、隐含供应路径、到达毕业所需的**累计净 OKB**。链上 **`S = curveS × 1e18`**，`curveS` 为创建者可选整数 **1～1000**；**4 参数** `createToken` 不写 `curveS` 时为工厂默认 **`100`**；前端若另行传参（例 **Web 创建页初始 `curveS=25`**）则以实际 calldata 为准。 |
| 「池子」 | **曲线层**：`totalMinted` ↔ `K`（毕业看这层）。**资金层**：Hook **真实 OKB**（迁移/卖出可用的要扣 **`claimableFeeOkb`** 等记账）。两层必须一起看：**进度高 ≠ 人人当下可无损退出**。 |
| 迁移 | 已毕业且未迁移、`migrationTarget` 有代码；**任意地址**可发交易调用 `migrateLiquidity`，**成功仅一次**。非管理员随手开关；不自动执行，全靠链上交易。 |

---

## 2. 单状态与公式（浓缩）

主状态：**`okbCum`**（买入侧扣费后的累计有效净流入）。由此得 `marginalPrice`、`totalMinted`；**勿**用手写进度条或 `totalSupply()` 顶替主逻辑。

隐含铸造：\(\text{minted} = K \bigl(1 - e^{-\text{okbCum}/S}\bigr)\)。 **`S` 越小**，同样净 OKB 下 **`okbCum/S` 越大**，曲线越陡、涨价越快；**`S` 越大**越平缓、走到同样进度一般要堆更多净 OKB。

**到达隐含 99%×K**（理论净累计 OKB，忽略路径手续费细差）：  
\(0.99 K = K(1-e^{-\text{okb}/S}) \Rightarrow \text{okbCum} \approx S \cdot \ln(100) \approx S \cdot 4.605\)（默认 `9900` bps = 恰好 99%×K）。以人类 **`curveS`** 计：**净 OKB（约）≈ `curveS × 4.605`** OKB。

链上尚有 **feeBps、maxBuy、sell 回拽 `okbCum`**，实盘总充值通常会高于上述「净」近似。

**实现**：`src/curve/Curve.sol`、`src/hook/EulrHook.sol`、`src/factory/EulrFactory.sol`。

---

## 3. 创建时用户可设 / 不可设

**可设**（`EulrFactory.createToken`，长度以链上常量为准）：`name`、`symbol`、`metadataURI`、`socialURI`，以及可选 **`curveS ∈ [1, 1000]`** → 仅此覆盖 **`params.s`**。

**不传 `curveS`（4 参数重载）**：使用 **`DEFAULT_CURVE_S_OKB = 100`**。

**创建者不可设**（均由默认参数或工厂部署配置）：**K**、**feeBps**、**selfDeprecationBps**、**maxBuyOkb**、**feeRecipient**、**migrationTarget**、Router/代理等。

---

## 4. `curveS` 与「池子」量级对照（精简表）

链上 **curveS** 最大值 **1000**，**不存在 `curveS = 10000`**；若假想更大 `S`，仅数学上仍会线性抬高「到达阈值的净 OKB」需求、曲线更平。

| curveS | 到 99%×K 的净 OKB 粗算（≈ ×4.605） | 曲线直觉 | 「池子」体量倾向（若真能走到阈值的社区资金） |
|--------|-------------------------------------|----------|------------------------------------------------|
| **1** | ≈ **4.6 OKB** | 极陡；起步同样净买入更易推进进度 | 易小资金毕业；Hook 累积 OKB **绝对额常偏小** |
| **25** | ≈ **115 OKB** | 介于 1 与 100：**明显陡于**工厂默认 **`curveS=100`**（不传参时）；又**远平于** `curveS=1` | **较低门槛毕业** vs 默认值；常为 **Web 创建流程初始默认**（以实际提交的 `curveS` 为准） |
| **100** | ≈ **460 OKB** | 产品与文档常用基准；工厂 **4 参数 `createToken` 不传 `curveS` 时的链上默认** | 常见 launchpad 尺度 |
| **500** | ≈ **2300 OKB** | 明显更平 | 需更深累计买盘才毕业 |
| **1000** | ≈ **4600 OKB**（合法上限） | 最平；`okbCum=0` 时边际价 **∝ `S/K`**，起步更「贵 token」 | 毕业难度大；潜在储备可更深 |

同一 `okbCum`：**小 `curveS`** → 隐含更接近 `K`、价升更快；**大 `curveS`** → 同样钱进度更慢。对外勿把「快到 99%」说成「实盘储备一定很厚」。

---

## 5. 「池子」两层（重申）

1. **曲线层**：`totalMinted(okbCum)` vs `K`——**毕业阈值**看它；sell 会降低 `okbCum`，**不改变** `selfDeprecated`。  
2. **资金层**：Hook **原生余额 − 手续费记账**——**sell / 迁移**吃这里；会因 **`InsufficientReserve`** 失败。

---

## 6. 毕业（Self-deprecation）

**何时触发**：某一 **buy** 成功后，在该笔的 **`newOkbCum`** 上看 `totalMinted ≥ 阈值`（默认 99%×K）。触发当笔 **仍会完整 mint**；**此后所有 buy** 被拒（Router→Hook：`SelfDeprecatedBuyClosed`）。

**此后**：**sell 照常**（照旧受储备 / 同块限制 / slippage）；**`feeRecipient`** 仍可 **`claimFees`**。**毕业不可逆**，之后 **sell** 只会动 `okbCum`，**不会**关掉 `selfDeprecated`。看展示：毕业看 **`selfDeprecated`**，曲线位置看 **`okbCum`**。

---

## 7. 流动性迁移（一次性）

**谁来调**：**任意账户**可调 `migrateLiquidity`（需已通过毕业等检查）；**`migrationTarget`** 部署 Hook 时写死。**须有人发链上交易**，无自动 cron。

**条件**：已毕业、`liquidityMigrated` 仍为 false、`migrationTarget` 有代码。

**划走什么**：Hook 原生余额 **`balance - claimableFeeOkb`** 随 `migrate` 一并发送（**待认领手续费不计入这一段 `value`**）；若 **`supply < K`**，再 **mint `K - supply`** 转给适配器。**细节**：`migrationData` 由 **`migrationTarget`** 解码执行。

**成功 / 重来**：返回值须 **非零 `pool` 且非零 `liquidity`**，否则整笔回滚——与「先写 `liquidityMigrated = true` 再调用」合在一起仍是一 **原子**：失败则视同未迁移成功。**成功后再调** → `LiquidityAlreadyMigrated`。

**用户理解**：这一步是「把彼时 Hook 可归集的 OKB + 补足 token 交给下游建池」，**不是**对每个持有人曲线「保本刚兑」；二级市场与毕业后 **sell** 仍另行博弈。

---

## 8. 对外文案提示

避免单说「token 供应量到 99%」，宜写 **「曲线隐含铸造量达 K 的 99%」**，并并排提示 **储备与迁移后的二级市场**。

---

## 9. 风险 Disclaimer

毕业与迁移都不是无风险终点；退出顺序、流动性、波动性均影响结果。本文**不构成**保本、回购或涨价承诺。

---

## 10. 符号速查

| 符号 | 含义 |
|------|------|
| `okbCum` | 曲线主状态：扣费后累计有效净 OKB（wei） |
| `K` / `S` | 渐近上限；尺度（链上 \(S=\) `curveS`×1e18） |
| `totalMinted` | 由 `okbCum` 推出的隐含铸造量 |
| `selfDeprecationBps` | 毕业阈值（默认 9900） |
| `selfDeprecated` / `liquidityMigrated` | 毕业关 buy；迁移完成标志 |

---

*参数或合约升级后请同步更新本文。*
