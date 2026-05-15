# Anvil Smoke 报告

本报告记录本地 Anvil 上的 `smoke:anvil` 执行结果，用于验证 TypeScript 部署脚本和 CLI 全流程在多个 Anvil signer 下都能正常工作。

报告中刻意不记录私钥，只记录公开测试地址、本地交易哈希、本地区块号，以及实际观察到的状态变化。

## 执行摘要

| 时间 (UTC) | 范围 | 命令形态 | 结果 |
| --- | --- | --- | --- |
| 2026-05-14 12:56:31 - 13:00:00 | package script sweep | `npm run` Anvil 脚本矩阵、`smoke:anvil`、`smoke:anvil:accounts`、Forge `script:*` 单独脚本 | 通过；日志见 `test-logs/package-scripts-anvil-fixes.log` |
| 2026-05-13 12:08:29 - 12:21:14 | account 0-2 | 串行执行 `PRIVATE_KEY=... DEPLOYMENT_NETWORK=anvil ANVIL_RPC_URL=http://127.0.0.1:8545 npm run smoke:anvil` | 通过，退出码 `0`，耗时 `764667 ms` |
| 2026-05-13 12:24:38 - 12:54:09 | 请求覆盖 account 3-19 | 同样串行执行，每次只跑一个 signer | account 3-9 通过；account 10 在 `deploy:anvil` 阶段失败；account 11-19 未执行；退出码 `1`，耗时 `1771095 ms` |

2026-05-14 的复跑中，所有 Anvil package scripts 均通过。

account 3-19 批次是有意串行执行的，因为每一轮 `smoke:anvil` 都会重新部署本地 Factory，并覆盖 `deployments/anvil/latest.json`。每轮内部 RPC 检查都确认 `chainId = 31337`，说明本批次连接的是本地 Anvil，而不是 XLayer 或其他 RPC。

## 覆盖流程

每个成功账户都完整跑完了以下 `smoke:anvil` 链路：

```bash
npm run deploy:anvil
npm run create-token -- --name Demo --symbol DEMO --metadata-uri ipfs://demo
npm run quote:buy -- --okb 1
npm run buy -- --okb 1 --min-out 0 --allow-zero-min-out
npm run quote:sell -- --tokens 1
npm run sell -- --tokens 1 --min-out 0 --allow-zero-min-out
npm run simulate:graduation
npm run migrate:liquidity
npm run claim:fees
```

成功账户的共同状态模式如下：

- `quote:buy` 和 `buy` 使用 `1 OKB`，结果为 `fee = 3000000000000000`、`effectiveOkbIn = 997000000000000000`、`okbCum = 997000000000000000`、`minted = 208329750516144411000000`。
- `quote:sell` 和 `sell` 使用 `1 token`，结果为 `netOkbOut = 4795189440016`、`okbCum = 996995190381705100`、`selfDeprecated = false`。
- `simulate:graduation` 额外执行 `47` 次 buy，最终达到 `okbCum = 469586995190381705100`、`minted = 20808208707071166927000000`、`selfDeprecated = true`。
- `migrate:liquidity` 返回 `liquidityMigrated = true`。
- `claim:fees` 返回 `claimed = 1413000014428854884`，并且 `claimableAfter = 0`。

## 成功账户

| 账户 | Deployer / fee recipient | Token | Hook | Create token | Buy | Sell | Migrate | Claim fees |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `0x165658211AAF1dA7C373670ed3ba8EcdC74AC1B0` | `0xFD9B5cDB3dD174299325CC8C66d46C8Cf4aEb5bE` | `0xe38a5b5d3db93a8a670b3a375d0cffe9b2b7b48f96cb0b970814120120de0c4c` @ `1110` | `0x0bbd8feb49b288123393fb99f0687399328f74faa8f649a0061e44ee18e34f69` @ `1111` | `0xb72fe2fec09324ce9c2e746c3873a97be0c3db44843a49c6ea7d167dde33df14` @ `1113` | `0x4a9f9f23f459ccaba5a2d6b58d85f05b75f8f0bc4d32f1d06b8f3b3e39e8e3f0` @ `1161` | `0xf336f029621eaaa81cabc93fac0e7b54f981bad4ab796d0d987bc1f962b33c05` @ `1162` |
| 1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `0x27D668603c635f85A667149a8b10ad4729F75A34` | `0x842D45B5d47789923CCF642cbc033B8fB828423C` | `0x8d070afe3e2f0fb95f6b76b70166d7c60738df8f584f86489745c8c79c68373d` @ `1167` | `0x7b0ef0ca4e045797f37a08e3941a730858d15bf59da5ec5e487d42da4584d42a` @ `1168` | `0x4ede16ee9df137fb9eec2a8869c663de5769c481fa4aef806708a5daca0df62a` @ `1170` | `0xbe42b4137b400a375a4a6d45240537c014d1d94e34f8e57ce7a963737115970c` @ `1218` | `0x098454fe8c6cc335f1440961527feac76c1d38d2f50a9e71218766a6414ac08d` @ `1219` |
| 2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | `0xaAaD3C072138f8523FF9890B5c994E332529D1B1` | `0xA8f18530825c89Fb0EEfcC8f2D3EDD6cA6fc3Fb9` | `0x4d28db2b938ac1f4f3fe46a5212c862b772ead9117d16b921c2e5385ca6743e0` @ `1224` | `0xd8e0d9977d2445b306d4b563a8f332f9e4a9a4a1ee871450318793370498f880` @ `1225` | `0x34eea9b87d2163ed0c7fb5814cead1d51f4e5fc50f07e5eaa0ae7128ee494705` @ `1227` | `0x16ff6350951592e01346c3d2bb931d7198a64350e67d39ed05c6be34ec22b2ad` @ `1275` | `0x2990eaee681ba6b7d2acdcbd9605cf9264420b7c6b13ff22adc86f5d04dac008` @ `1276` |
| 3 | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` | `0xa88F8047B5E165AF6d6dfC3d526dD338d981faf8` | `0x6295D523E65a3357Ad1e93244DC24CA7E11E0e53` | `0xece42ac5a523992ab39445e18b1f8feb5173afa764a53bd5823a248a1db9c1dd` @ `1281` | `0x656051371f3c662254287d60dd90b6a3d41c5a38b57723912be165a4a691b9c6` @ `1282` | `0x773d81e2d2738d08c4d79c1a9716ae1b3692e422a5413f6a8b21a0a5fc3a6db1` @ `1284` | `0xb22497c7ce759080b17611115c9164db5ec03234b868db9169ca292b2545808c` @ `1332` | `0x104c6920cd018dbab5dd700982f9489b9925d769504172f655d4c2f09fd63fc2` @ `1333` |
| 4 | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` | `0xdA510e6c845e9bd3ee023d660f353b0aEf7b7dC0` | `0x2228b3d33E4F2d2Dea41C2e8Fb3c357Da1BCC616` | `0x670aaa431314310cbfdcfa6941173cd74b8f0a9af3fbb6d6f8a29410da7868ed` @ `1338` | `0xed77bde135c8fb9a3fae016f18f1e8562d05629b455efdcdb5a893c5437c08a9` @ `1339` | `0x7230b0cc1c0111a8340f6baeeecd51f3e94880dec70a9aeeff18a2f6c9421e60` @ `1341` | `0x57b81670db17cb07f4ea9d4610a5f6a6e8d8bef204ab22f391846603b95e0f1a` @ `1389` | `0xb82a586f324e12d35d27f7357ebf460a325d0e495faf083ff825dac4d9640020` @ `1390` |
| 5 | `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` | `0x7d8EB7dE1c752487caBd3246cDA6302154572A63` | `0x79FDcB1D342e6928612491928602346cf8f16485` | `0x41d060123d100a81e7f4f6bdab7011d2fa19d88eac951a083be1234cba7d1407` @ `1395` | `0xbe25ee7f6133266855ba2336a5af9e93a02c879f7c08db67c513160ac6de5738` @ `1396` | `0xbef87b4952a87163a9e5318372354949da16d7e64cafefd76c906497543c78dc` @ `1398` | `0x9fd3b75ce836be33f9e0da0adbce977f50f0b99f90c9974acfbe7e4a69bcd1f4` @ `1446` | `0xbf0129d14ba616abb7e1cbe19121938a797f08f9eb5a7381081c96b67368894f` @ `1447` |
| 6 | `0x976EA74026E726554dB657fA54763abd0C3a0aa9` | `0xC440E74541CF54591246255Ce4B82BEB0379892c` | `0xc68466Ec864F4c1487ab548D3240a4D1a59f64F0` | `0x9be270a4e3538c44a1ed925814cb136df0f612033f4ad8dd420ac57604033ff7` @ `1452` | `0xf193696ae8f47a363446666a04d02980326d163d1ce54ecd32fea9e2ce289a81` @ `1453` | `0x74624fd02d85843c83c477eab8d86e996360cde120befc1ede3b68faa9c1b74b` @ `1455` | `0xb71a28f993178728bcd253957e66aa1df2733116ed408fca0f784b1b227d64a3` @ `1503` | `0x0a3ae8b2ff9a06cdf054978f8b86f585b534c981aa0834e8c90002cb0df1e7ac` @ `1504` |
| 7 | `0x14dC79964da2C08b23698B3D3cc7Ca32193d9955` | `0x408E5BC89C90d7E26B6c730b9824D35d613Db3d8` | `0x5c5356Eb47e3fa04bCDeFE8Ec03164BBdE33cb85` | `0xdef3a0d3af73e52025e60b3adc4c62d7ce981f288e7ef612f261dc0b390fdd34` @ `1509` | `0xf014c14ec36a2228fe1dfdba3d306357decd7546c1808c774ee360af1bd4fe54` @ `1510` | `0xf4816755034e5f4c426ba8bad16f28d66cec942c282e15dbd4123cb2278702d2` @ `1512` | `0x5f597dea7a5b13409ddc4ae98f5497b765e7106b8b59f9c1c1937356e339adc7` @ `1560` | `0x5ab948cd139de3ff27831c764f215b877b1d4b16f1dffb64d76ffefac184e2e9` @ `1561` |
| 8 | `0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f` | `0x5C9d9b94893d8532a82e587CDB423419a6d0f896` | `0xb4c0E4D74FB607cfDEf508683CB394C08ad6ec0E` | `0x7e52a74d49f5f1148768a6bd89def3f20c286df36aa3518df7f612523a8b6a86` @ `1566` | `0xc041bcdd36727c6e76c7f205a8ee0383c562cb171ef9464f1772003667fe8f96` @ `1567` | `0xb050bc81cc664c2d1156b74f10e769ecb64abe6e6f217a8712b703d0e6733265` @ `1569` | `0xb640e555eb743569c5946820e3c4d9829e00ff15947113833d2871d9b8fdc26c` @ `1617` | `0x8744435b963a26d56bb86894ca48bec9492c1b41f95d16178f124fc314aedcf6` @ `1618` |
| 9 | `0xa0Ee7A142d267C1f36714E4a8F75612F20a79720` | `0xc19Bc969cfc40DfF49605AedefC69a74c5Aef69E` | `0xb406262CE03F4dD507Ca8B67649E7eE1a52Aa047` | `0x1fe735c4372c1b43ec9461c420c65ab6c92643c11e6eca27ef4d3ebb78262419` @ `1623` | `0x07461facb72b7ea8181f57995bb7657e0f9f77b917fe2a36a066659ef69427a1` @ `1624` | `0x1e5cc8e45f5d8d4bc25a7c9c6e7309a033dcb1f27346f8375c541c091f037b7b` @ `1626` | `0x4bdec89115500c98819252d06cae0a9f71f185e86559fd140e43dbdb1e81787f` @ `1674` | `0x7b321529b393946558fa0062d1e331100e883f927e0111fe21e31d40ff53cbb8` @ `1675` |

## 失败：Account 10

account 3-9 完成后，批次继续进入 account 10。失败发生在 `deploy:anvil` 的第一次广播交易阶段，也就是 Factory 部署完成之前：

```text
TransactionExecutionError: The total cost (gas * gas fee + value) of executing this transaction exceeds the balance of the account.
from: 0xBcd4042DE499D14e55001CcbB24a551F3b954096
Details: Insufficient funds for gas * price + value
RPC: http://127.0.0.1:8545
```

因为循环使用了 `set -e`，account 10 失败后整个批次立即停止。因此本轮没有执行 account 11-19 的任何 smoke 步骤。

结论：在当前 Anvil 节点状态下，account 0-9 都表现为已充值的本地 Anvil signer。account 10 没有足够 native balance 支付部署 gas，因此这个结果不指向 create、buy、sell、graduation、migration 或 fee claim 逻辑的协议/CLI 回归，而是说明当前活跃 Anvil 进程的已充值账户范围没有覆盖到 account 10。

## 覆盖说明

- 已验证已充值 Anvil account 0-9 的完整流程。
- 已验证 account 0-9 下流程不依赖固定 deployer 或固定 fee recipient。
- 已验证在串行执行时，重复本地部署和重复覆盖 `deployments/anvil/latest.json` 可以正常工作。
- 已验证 fee claim 会按账户路由到对应 signer 作为 `recipient`，并且 `claimableAfter = 0`。
- 本轮未验证 account 10-19，因为 account 10 余额不足，导致循环在 account 11-19 启动前停止。

## 建议下一步

如果要继续覆盖 account 10-19，需要先在当前 Anvil 节点上给这些账户充值，或者启动带足够已充值账户数量的 Anvil，然后只串行重跑剩余范围。

示例：

```bash
anvil --chain-id 31337 --accounts 20
```

或者在重跑前，通过 Anvil RPC 方法给剩余地址充值：

```bash
cast rpc anvil_setBalance 0xBcd4042DE499D14e55001CcbB24a551F3b954096 0x56BC75E2D63100000
```

之后用专用多 signer CLI 串行重跑：

```bash
npm run smoke:anvil:accounts
```

`smoke:anvil:accounts` 内部串行处理每个 signer 并复用本地 deployment JSON，因此不再需要手写 shell 循环；同时也禁止与其它 `smoke:anvil` 调用并发执行，避免覆盖 `deployments/anvil/latest.json`。

## 可能出现的问题

### Anvil 账户余额不足

现象：`deploy:anvil` 或后续交易广播时报 `Insufficient funds for gas * price + value`。

原因：当前活跃 Anvil 进程不一定给 account 0-19 全部预充值。本次 account 10 首次失败就是这个原因，不是 Factory、Router、Hook 或 migration 逻辑错误。

处理：

```bash
cast rpc anvil_setBalance <account-address> 0x21e19e0c9bab2400000 --rpc-url http://127.0.0.1:8545
```

或者重启 Anvil 时指定足够账户数：

```bash
anvil --chain-id 31337 --accounts 20
```

### 私钥和地址不匹配

现象：日志里的 `from` 地址不是预期 Anvil account，或者明明填写了 account 1/2 却从陌生地址发交易。

原因：私钥拷贝错误会派生出另一个地址，该地址通常没有本地余额。本轮早期尝试中就出现过此类问题。

处理：重跑前用 `cast wallet address --private-key <key>` 校验私钥派生地址，必须和报告里的 account 地址一致。

### 并发执行导致 deployment JSON 被覆盖

现象：`quote:buy`、`buy`、`sell` 操作的 token/hook 与前一步创建的地址不一致，或后续 CLI 读取到另一轮 signer 刚写入的 token。

原因：每轮 `smoke:anvil` 都会覆盖 `deployments/anvil/latest.json`。多个 smoke 并发运行时，后启动的部署会覆盖先启动流程的上下文。

处理：多账户 smoke 必须串行执行。不要同时跑多个 `npm run smoke:anvil`。

### 使用 `--min-out 0` 的误解

现象：本地 smoke 全部带 `--allow-zero-min-out`，容易误以为生产也可以零滑点保护。

原因：本地 smoke 为了确定性验证链路，允许 `min-out = 0`；生产交易不应这样执行。

处理：生产或真实用户 CLI 必须设置非零 `minTokensOut` / `minOkbOut`，并保留 CLI 默认拒绝零 min-out 的保护。

### Anvil 本地 migration 不等于真实 XLayer migration

现象：本地 `liquidityMigrated = true`，但 XLayer fork 或生产环境仍可能失败。

原因：本地 Anvil 使用 mock PoolManager、PositionManager 和 migration target；真实 XLayer 需要真实 Uniswap v4 地址、真实 PositionManager 行为、LP owner / burn / lock 证明。

处理：上线前必须继续跑 `npm run gate:xlayer` 和真实 fork migration 测试。本地 smoke 只证明本地脚本和合约闭环。

### 长时间 `simulate:graduation`

现象：流程停在 `simulate:graduation` 看起来像卡住。

原因：该脚本会循环执行 10 OKB buy，直到达到 self-deprecation 阈值。本轮正常情况下每个账户需要 47 次 buy，耗时明显长于普通 quote/buy/sell。

处理：观察日志是否继续出块或最终输出 `buys = 47`、`selfDeprecated = true`。如果长时间无新区块，再检查 Anvil RPC 和子进程。

### 运行时 warning

现象：日志中反复出现 Node.js `DEP0205` warning。

原因：当前 `tsx`/Node 组合触发 `module.register()` deprecation warning。

处理：该 warning 不影响本次交易结果。后续可升级 `tsx` 或调整 Node 运行方式减少噪音。

## 优化建议

### 多账户 smoke 已落地：`npm run smoke:anvil:accounts`

本报告早期建议的"专用多账户 smoke 脚本"已经落地为 `ts/cli/smoke-anvil-accounts.ts`，对应 npm script：

```bash
npm run smoke:anvil:accounts
```

该 CLI 只在 `DEPLOYMENT_NETWORK=anvil` 且 `chainId = 31337` 时允许使用。新的 smoke 复跑应优先使用该脚本，而不是手写 shell 循环。

### 仍需注意的脚本边界

单独运行 Forge `script:*` 时，`FACTORY`、`TOKEN`、`RECIPIENT`、`TEAM_MULTISIG` 仍来自当前 shell / `.env`。如果要单独跑这些脚本，需要显式设置 Anvil 本地值。

仍需要持续改进的能力：

- 每轮开始前检查余额，不足时提示或自动调用 `anvil_setBalance`，避免 account 10+ 这类未充值地址在 `deploy:anvil` 阶段失败。
- 每轮结束后输出结构化 JSON summary，让 `ANVIL_SMOKE_REPORT.md` 可以自动生成而不再依赖人工整理。

### 将 smoke 报告自动化

当前报告是人工从终端日志整理。建议后续让 smoke 脚本输出机器可读 JSONL：

```text
accountIndex, accountAddress, factory, token, hook, router, buyTx, sellTx, migrated, claimed, status
```

这样可以自动生成 `ANVIL_SMOKE_REPORT.md`，减少手工复制交易哈希和区块号的错误。

### 把账户余额检查前置

在部署前先批量读取 account 余额：

```bash
cast balance <account-address> --rpc-url http://127.0.0.1:8545
```

余额低于部署和 graduation 所需阈值时提前失败，不要等到 `deploy:anvil` 中途失败。对 account 10-19 这类未预充值地址，最好在 smoke 开始前统一 `anvil_setBalance`。

### 固化 95% 覆盖率门禁

当前已经新增 `npm run coverage:95`，建议 CI 合并门禁也执行它。该门禁验证 line coverage 不低于 95%，本次结果为：

- Line coverage：`95.89%`
- Statement coverage：`96.00%`
- Function coverage：`100.00%`
- Branch coverage：`80.49%`

如果后续要求 branch coverage 也达到 95%，需要继续补 `EulrHook`、`EulrRouter` 和 migration 路径的业务异常 / reentrancy 场景测试；不需要重复测试 OpenZeppelin 内部实现。

### 区分本地 smoke、coverage 和 XLayer gate

建议把测试命令分为三层：

- 本地快速回归：`forge test`、`npm run test:ts`。
- 覆盖率门禁：`npm run coverage:95`。
- 上线前门禁：`npm run gate:xlayer`、Anvil 多账户 smoke、真实 fork migration。

这样可以避免每次开发都跑最慢的全量链路，同时保证合并和上线前有足够覆盖。
