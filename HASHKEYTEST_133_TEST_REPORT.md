# HashKey 测试网 133 测试报告

生成时间：`2026-05-14T12:28:30Z`

最近更新：`2026-05-14T13:15:00Z`

## 摘要

HashKey 测试网 `chainId = 133` 可用于当前测试阶段。Owner 钱包已成功连接网络，并完成测试合约部署、Token 创建、买入、卖出、手续费领取、部署记录检查和多账号并发买卖测试。

本报告刻意不记录任何私钥。

## 日志

- 本地门禁日志：`test-logs/hashkeytest-133-local-gate.log`
- HashKey 133 链上 smoke 日志：`test-logs/hashkeytest-133-live.log`
- HashKey 133 完整多账号日志：`test-logs/hashkeytest-133-accounts-smoke.log`
- HashKey 133 package scripts 矩阵日志：`test-logs/package-scripts-hashkeytest-live.log`
- 指定发射平台 Factory 批量创建日志：`test-logs/hashkeytest-133-factory-6ecc-create-20.log`

## 测试环境

| 项目 | 值 |
| --- | --- |
| 网络 | `hashkeytest` |
| Chain ID | `133` |
| RPC | `https://testnet.hsk.xyz` |
| Owner | `0xd8F391e10223580611A70160d1D42bf55fCc882C` |
| Owner 初始余额 | `68.999999999872461815` native token |
| Owner 结束余额 | `68.990026790474495411` native token |

## 本地门禁结果

本地门禁通过。

覆盖命令：

```bash
forge fmt --check
forge build
forge test --fuzz-runs 10000
forge test --match-path 'test/invariant/*'
npx tsc --noEmit
npm run test:ts
```

关键结果：

- Forge build：通过
- Forge tests with `--fuzz-runs 10000`：通过
- Invariant tests：通过
- TypeScript typecheck：通过
- TypeScript tests：`84` pass，`0` fail

## 链上测试结果

### 部署

`npm run deploy:hashkeytest` 执行成功。

| 合约 / 字段 | 地址 |
| --- | --- |
| Deployer | `0xd8F391e10223580611A70160d1D42bf55fCc882C` |
| Factory | `0x6eCC58ea5d110F162eB46B1739B7F3Ba8eF5FA64` |
| Fee recipient | `0xd8F391e10223580611A70160d1D42bf55fCc882C` |
| 测试 PoolManager 依赖 | `0xFabdBAe290F6B5F722E8bA6f8D53f31E2e25BF18` |
| 测试 PositionManager 依赖 | `0xC9DAFA97f8495920Df973BED9e220E5fd6e9d6f6` |
| 测试 migration target | `0x5b99e66BCabbD1b09B4606A707E6e884E7BC8B1E` |

`npm run doctor:deployment -- --network hashkeytest` 返回 `ok: true`，并确认期望 chain id 为 `133`。

### Token 创建

`npm run create-token` 执行成功。

| 字段 | 值 |
| --- | --- |
| Token | `0xC3FA78ae7af8CF19035710ef06E7438b9a97D643` |
| Hook | `0x3b4Ad919B4adA7425ACDA6D908Eb3eF348427b7a` |
| Router | `0xBcAab59f865Df62168a006DA3f0c4a44B294CF80` |
| 创建交易 | `0xf00f8dcbfe4bc925e8c9335ecd23a4ac21d70a89c9e56489dbb7061a04a1c314` |
| 创建区块 | `27787496` |

初始 inspect 确认：

- `okbCum = 0`
- `claimableFeeOkb = 0`
- `totalSupply = 0`
- `selfDeprecated = false`
- `liquidityMigrated = false`

### 买入流程

`0.01` native token 的报价结果：

- `grossOkbIn = 10000000000000000`
- `fee = 30000000000000`
- `effectiveOkbIn = 9970000000000000`
- `tokensOut = 2093595632523486000000`

买入执行成功：

- 交易：`0x43f83a5d9f9b9d00ba096665d5a056263cca92333ac5c7ce0027f9b8997c912c`
- 区块：`27787503`
- `okbCum = 9970000000000000`
- `minted = 2093595632523486000000`
- `selfDeprecated = false`

### 卖出流程

`1` token 的报价结果：

- `tokensIn = 1000000000000000000`
- `grossOkbOut = 4762379435200`
- `fee = 14287138305`
- `netOkbOut = 4748092296895`

卖出执行成功：

- Approve 交易：`0x456ecaefe4656684dc788c676cdd264d0eab3accc040294dab92f6aa5f85665c`
- Sell 交易：`0xb75d8ae2e1ba5e3c1bbec38e4a1f9059fdd7737565a2e72e3d0be05955983f11`
- 区块：`27787510`
- `okbCum = 9965237620564800`
- `minted = 2092595632523256000000`
- `selfDeprecated = false`

### 手续费领取

手续费领取成功：

- 领取金额：`30014287138305`
- Claim 交易：`0xc402de504be9864595a870b6c1d85f3cb5e214aebd5980b69de67064021d8a1f`
- 区块：`27787516`
- `claimableAfter = 0`

### 最终状态

最终 inspect：

- `okbCum = 9965237620564800`
- `claimableFeeOkb = 0`
- `totalSupply = 2092595632523486000000`
- `minted = 2092595632523256000000`
- `selfDeprecated = false`
- `liquidityMigrated = false`

`totalSupply` 与曲线推导的 `minted` 之间存在极小差异，这是舍入 dust，符合当前曲线状态模型。

## Package Scripts 复测更新

初始报告之后，又在 `2026-05-14` 执行了一轮 package scripts 矩阵测试。

HashKey 133 已通过的脚本：

- `deploy:hashkeytest`
- `create-token -- --name HashKeySmoke --symbol HKSMOKE --metadata-uri ipfs://hashkey-smoke`
- `quote:buy -- --okb 0.001`
- `buy -- --okb 0.001 --min-out 0 --allow-zero-min-out`
- `quote:sell -- --tokens 1`
- `sell -- --tokens 1 --min-out 0 --allow-zero-min-out`
- `claim:fees`
- `smoke:hashkeytest:accounts -- --limit 2 --concurrency 2 --fund --buy-okb 0.001 --sell-tokens 1`

该轮部署地址已经被后续透明代理重部署替换。当前 backend / ABI 对接使用的
HashKey 133 真实部署地址为：

- Factory proxy：`0x726B98099fCA8a1778EAC863Bac1232A9753a55A`
- Factory ProxyAdmin：`0x40Fb77DEB510584D878b73E676dC62c2EaebBc87`
- Factory implementation：`0xB1F5802db3bD3e66A19eAb72bFd65260F931A59F`
- Router implementation：`0x3035c5428062B6f42cA1248baAF8Fa48338f1D7b`
- Latest smoke Token：`0xA068D9A8b5b7002DBa6f47829fbd1C9c1E908C87`
- Latest smoke Hook：`0xA5b6EdaBe886e982F8017bc55BD81dd91FAcC693`
- Latest smoke Router：`0x5A74ceE0039C01465337984eC951e2bFB1300Ea4`

完整多账号 HashKey 测试也已通过：

- 账号数量：`61`
- 并发数：`5`
- 每个账号流程：`buy -> approve -> sell`
- 失败账号数：`0`

HashKey migration-target 脚本在当前临时环境中未通过：

- `deploy:migration-target` 失败原因：HashKey 133 未配置 `UNISWAP_V4_POOL_MANAGER`。
- `doctor:migration-target -- --network hashkeytest` 失败原因：`deployments/hashkeytest/uniswap-v4-mint-position-target.json` 不存在。

这符合当前 HashKey 临时 smoke 环境的预期，不改变此前建议：真实 graduation / migration 需要在单独的真实 Uniswap v4 配置下测试。

## 发射平台批量创建更新

用户指定发射平台 Factory：

- Factory：`0x6eCC58ea5d110F162eB46B1739B7F3Ba8eF5FA64`

该 Factory 在 HashKey 133 上确认有合约代码，并可正常读取：

- 创建前 `allTokensLength = 1`
- 批量创建后 `allTokensLength = 21`
- 本次新增 Token 数量：`20`

本次创建没有使用 `deployments/hashkeytest/latest.json`，因为该文件已被后续测试部署覆盖到当前透明代理 Factory `0x726B98099fCA8a1778EAC863Bac1232A9753a55A`。批量创建直接调用用户指定的 Factory，避免创建到错误 Factory。

新增 Token：

| 序号 | Name | Symbol | Token | Hook | Router |
| --- | --- | --- | --- | --- | --- |
| 1 | `Alpha Launch 01` | `ALP01` | `0xdfCBCB1636f841d50215F9528393bE0D95f2b6F7` | `0x8CC3BDAaecfAcEb5F28763ABF785bB74B8BFAc9D` | `0x2C59cd26F186cE1C629545aF779609b68bf465b3` |
| 2 | `Beta Launch 02` | `BET02` | `0xAa9978c78C78c86d3667b70088c0Ef15E942232C` | `0x6C768716CFB93Cc509Cf7712dD2d6071764D3e26` | `0x0fd674247D637c39E16edff748a5f20B98bE36C6` |
| 3 | `Gamma Launch 03` | `GAM03` | `0xc96e36289C5547729c10423CfD9c9eff80858126` | `0x6E46762da3eb1535Ce795f2D3AE10a3adC669b29` | `0xEE448e55cd85EEcd7FCE362D508De0B82a41eA4f` |
| 4 | `Delta Launch 04` | `DEL04` | `0xAa638804fc9a02d1106b9B6A7B6B976c62829855` | `0x270574Fa6729A3F9907639D19ED7C73117C56EeD` | `0x03af4d060B760B29600e254AE9ed8DB83C2B8D18` |
| 5 | `Nova Launch 05` | `NOV05` | `0xAaCb648631F02608772066c267dB200653346cfc` | `0x107793a0aB871ead1aaa4f4a1C745cF932D53484` | `0xbADf1956084084524d545835fabA59c75790a3B8` |
| 6 | `Orbit Launch 06` | `ORB06` | `0x4A59298cc3ACdeD1907a672EF576676C3AD1e57B` | `0x47A9Fa84b1E3A934995fEC6b8541C0A5e1100BEe` | `0x5594263bdB1C701Ed396f3253804ee281D6eb5D4` |
| 7 | `Pulse Launch 07` | `PUL07` | `0x8262bA6B964117Ed168A797027676fA84291723a` | `0x089e33894F9437b251AA08885A71F4c32eF63D8A` | `0xB8B814b98b686DC8a6082cB797c524b7B42f74E2` |
| 8 | `Spark Launch 08` | `SPK08` | `0xDeD272aA8d3d2C4D96984F83082fFbA3D0e1A03D` | `0xB5a375a09E32E2eb27eB876D94d66EcCCcfA4bD5` | `0x9A04632855C4C297ad4a26bEE09c46C1139aBcD1` |
| 9 | `Vector Launch 09` | `VEC09` | `0xe5cA121Dc4Be5dc821b424A5bf86f468a178Fe83` | `0xf08772D4f62641b5dEDC77430AbBBb951D29698B` | `0x5c39209E7625dd16bF703A1B8c1E3cA30CA87C64` |
| 10 | `Zenith Launch 10` | `ZEN10` | `0x3d885792208615f42F906B4DE7882d4C143ce68b` | `0xe25E09ddc0D62Ae0F31D642468Cc5Eec246a1490` | `0x513bF912670f2FA130A1FFCd5Dda3e09Ac9c4DCB` |
| 11 | `Apex Launch 11` | `APX11` | `0xA2003a65c2d3c42B640288f4579f4f6EFFF73E50` | `0xa3301A1870182C3bBE1ed13436b34d639E3aD2D3` | `0xDc73E8C37636F42D8cf0D86e8d0fa487533cA388` |
| 12 | `Beacon Launch 12` | `BCN12` | `0x98e4CbfE3a5c69297f7c04710Dba65B4E84fBF5b` | `0x83579D00f7D4A9Aa3A896bBE7C42f1960cba689b` | `0xf187d2dBa29a5C3d1ED8f115E850BbDf9B5Ba96F` |
| 13 | `Comet Launch 13` | `CMT13` | `0x8F0dd74504c52453756E5914c886DD04C9e2c59c` | `0x6Db453d34AB8f71AFA2466D83350643e66D4b910` | `0x9305CC4d42FFe44C9599232Ca6e56bE231e47343` |
| 14 | `Drift Launch 14` | `DRF14` | `0xa5C4cDc9D07fAc069E5e31B963eB62C30abfa76C` | `0xF4c229aD4BB282652881D98b397cd6A69F25272e` | `0x7De5C262BA1527F5054D31Db0B4D4c9c359511b3` |
| 15 | `Echo Launch 15` | `ECO15` | `0xCfA9837d5305E271432036CF0FBCd97e74E175B5` | `0x91cd05223A3D566Ba8137A257894e9c6E0414E9E` | `0xA80c3dC1317f1722095c562202bba0Abc7dD9ed5` |
| 16 | `Flux Launch 16` | `FLX16` | `0x007804cddbE43C1566E007374E89759B15f317a2` | `0x3e1fB8F9DA46F2Bd41fbcF6EF04d9f9D66E86a64` | `0x5ee01B356fd78a9D2e4cFB85637d3B4ff6281182` |
| 17 | `Glide Launch 17` | `GLD17` | `0xBA4f6897625f89e518636272A7a02fa314094d31` | `0x080Cf42A14e15D85abC5Aa37141dBd80cb12E0d5` | `0xfABaa70F1036B6B1383a24546F6f987397396609` |
| 18 | `Helix Launch 18` | `HLX18` | `0x59A749F01c90a169CF2C2A49B1c06fEe16e7ef85` | `0x8e78F11EF34E9ab4bF6eaBD3CD698c87E08a5e94` | `0xBBF1233541Fe92a47B8BAe969BFF3f80F181A421` |
| 19 | `Ion Launch 19` | `ION19` | `0xa05561640aD93939815ac5A44b443123d416f6d9` | `0x789def3A2213C9643F11A5cF8762A0CA55C2f41D` | `0x7c4Fa7775B9234FF1Bde1577dd50Fd28dfC2fBF2` |
| 20 | `Jade Launch 20` | `JAD20` | `0xDA5d262069D62b728A019fe67fDc7A2Eb5507DDd` | `0xf1c091a0c7757Ad35b8eB6f23312e25424B2E610` | `0x93598cb462049962079A693516e691185243444B` |

## Graduation 与 Migration 继续测试

用户要求继续执行此前未跑的完整 graduation 与 migration。测试已在 HashKey 133 上完成，日志见：

- `test-logs/hashkeytest-133-graduation-migration.log`

本次测试使用指定发射平台 Factory：

- Factory：`0x6eCC58ea5d110F162eB46B1739B7F3Ba8eF5FA64`

测试前确认该 Factory 的 migration target：

- Migration target：`0x5b99e66BCabbD1b09B4606A707E6e884E7BC8B1E`
- Target 类型：`LocalMigrationTarget`
- Target pool：`0x000000000000000000000000000000000000bEEF`
- Target liquidity：`1000000000000000000`

注意：本次 migration 是当前 HashKey 测试部署中的完整迁移路径测试，但 migration target 是 `LocalMigrationTarget`，不是生产级真实 Uniswap v4 PositionManager 迁移。

### Graduation 测试 Token

| 字段 | 值 |
| --- | --- |
| Name | `Grad Test 1321` |
| Symbol | `GRD133` |
| Token | `0xaF8A5Bd9F1D08DB702734F7E79Ea54290cb76cb3` |
| Hook | `0x55e9d03dc34A420c35E87D82790257f6ae99eA30` |
| Router | `0x10E09De181812597FB90557BF0Eb97707fD954f3` |
| Create tx | `0xc565d1474e1fcc44227be8f6a5493ec8b77d5c668dad0242094a5198b2ec771b` |
| Create block | `27789129` |

### Graduation 买入结果

使用 `47` 个测试钱包分摊买入，每个钱包买入 `10` native token。

| 项目 | 值 |
| --- | --- |
| 买入次数 | `47` |
| 单次 gross buy input | `10000000000000000000` |
| 总 gross buy input | `470000000000000000000` |
| 最终 `okbCum` | `468590000000000000000` |
| 最终 `totalMinted` | `20806286993326451421000000` |
| 最终 `claimableFeeOkb` | `1410000000000000000` |
| `selfDeprecated` | `true` |
| `liquidityMigrated`（迁移前） | `false` |

第 `47` 次买入后成功触发 graduation：

- 买入账号：`WhitelistUser1986`
- 买入交易：`0x765713147f35af0cb89a13eef5330620c2caf09cd9dd7387cc4c4a99fe1d447a`
- 区块：`27789266`
- `selfDeprecated = true`

### Migration 结果

`migrateLiquidity` 执行成功。

| 项目 | 值 |
| --- | --- |
| Migrate tx | `0xd62ea03f8a2a7d66803555358bb05340062096f187444e00e820b17797975a61` |
| Migrate block | `27789269` |
| Hook 迁移前余额 | `470000000000000000000` |
| 迁移后 `liquidityMigrated` | `true` |
| 迁移到 target 的 OKB 数量 | `468590000000000000000` |
| 迁移到 target 的 token 数量 | `193713006673548579000000` |
| Target lastToken | `0xaF8A5Bd9F1D08DB702734F7E79Ea54290cb76cb3` |

迁移后 Hook 状态：

- `okbCum = 468590000000000000000`
- `totalMinted = 20806286993326451421000000`
- `claimableFeeOkb = 1410000000000000000`
- `selfDeprecated = true`
- `liquidityMigrated = true`

### 手续费领取结果

迁移后继续执行 fee claim，领取成功。

| 项目 | 值 |
| --- | --- |
| Claim tx | `0xda2097f6a92bcdc6d850bbf85a1d54c7b7f0071d32ec3e106ad04148d133b006` |
| Claim block | `27789273` |
| Claimed | `1410000000000000000` |
| `claimableAfter` | `0` |

### 结论

HashKey 133 上的完整链路已验证：

- 创建 graduation 专用 Token：通过
- 47 个测试钱包分摊买入：通过
- 达到 `selfDeprecated = true`：通过
- 调用 `migrateLiquidity`：通过
- `liquidityMigrated = true`：通过
- migration target 收到迁移记录：通过
- 迁移后领取费用：通过

剩余限制：这次证明的是 HashKey 测试环境中的完整 graduation + 当前 migration target 迁移闭环，不是生产级真实 Uniswap v4 migration。生产级真实迁移还需要 HashKey 133 上存在真实可用的 Uniswap v4 PoolManager / PositionManager，并配置 `UNISWAP_V4_POOL_MANAGER`、`UNISWAP_V4_POSITION_MANAGER`、`LP_RECIPIENT` 和 migration pool 参数后再单独执行。

## 仍在的问题

1. HashKey 133 当前部署使用的是本地测试 `LocalMigrationTarget`，不是生产级真实 Uniswap v4 PositionManager 迁移目标。因此本报告只能证明 HashKey 测试环境中的 graduation + migration 闭环，不能证明真实 Uniswap v4 migration 已经通过。
2. 真实 Uniswap v4 migration 仍未执行。后续需要在 HashKey 133 上配置真实可用的 `UNISWAP_V4_POOL_MANAGER`、`UNISWAP_V4_POSITION_MANAGER`、`LP_RECIPIENT` 和 migration pool 参数后单独测试。
3. 单独运行 Forge `script:*` 脚本时，仍会读取当前 shell / `.env` 中的 `FACTORY`、`TOKEN`、`RECIPIENT`、`TEAM_MULTISIG` 等变量。测试 Anvil 单独脚本时应显式导出 Anvil 本地值，或使用已经验证过的 `smoke:anvil` / `smoke:anvil:accounts` 流程。

## 未执行范围

HashKey 133 上已继续执行完整 graduation 和当前 migration target 的迁移测试。真实 Uniswap v4 migration 仍未执行，原因是当前 HashKey 测试部署使用的是 `LocalMigrationTarget`，不是生产级真实 Uniswap v4 PositionManager 迁移目标。

## 建议

继续把 `hashkeytest` 支持标记为临时测试用途。最终生产发布前，如果不再需要 HashKey 测试网，应删除或加开关隔离：

- `deploy:hashkeytest`
- `.env.example` 中的 `HASHKEYTEST_*` 字段
- `TEST_WALLETS.md`
- `deployments/hashkeytest/*`

不要提交 `.env` 或 `.secrets/`。
