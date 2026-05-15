# Test Wallets

This document records the current test wallet batch for local/fork testing. Private keys are intentionally redacted here. Keep full private keys only in a local ignored file or a password manager, and never commit them to git.

Suggested local-only format:

```text
address<TAB>privateKey<TAB>label<TAB>allocation
```

## Batch: WhitelistUser1939-WhitelistUser2000

## HashKey Testnet Usage

- Network label: `hashkeytest` (temporary testing-only network)
- Chain ID: `133`
- Owner wallet: `WhitelistUser1939` (`0xd8F391e10223580611A70160d1D42bf55fCc882C`)
- Test wallets: `WhitelistUser1940` through `WhitelistUser2000`

Use the first wallet's private key only in local `.env` as `HASHKEYTEST_OWNER_PRIVATE_KEY`. Store the rest of the private keys in `.secrets/hashkeytest-wallets.tsv` or a password manager. The `.secrets/` directory is gitignored.

Local `.env` example:

```bash
HASHKEYTEST_RPC_URL=
HASHKEYTEST_CHAIN_ID=133
HASHKEYTEST_OWNER_ADDRESS=0xd8F391e10223580611A70160d1D42bf55fCc882C
HASHKEYTEST_OWNER_PRIVATE_KEY=<private-key-for-WhitelistUser1939>
HASHKEYTEST_TEST_WALLETS_FILE=.secrets/hashkeytest-wallets.tsv
DEPLOYMENT_NETWORK=hashkeytest
```

Note: `DEPLOYMENT_NETWORK=hashkeytest` is supported only for the current testing phase. Remove the HashKey testnet config, deployment records, and test wallet references before final production launch if they are no longer needed.

Deploy the test contracts with:

```bash
npm run deploy:hashkeytest
```

| Address | Private Key | Label | Allocation |
| --- | --- | --- | --- |
| `0xd8F391e10223580611A70160d1D42bf55fCc882C` | `[REDACTED]` | `WhitelistUser1939` | `0` |
| `0xA7fA8631AA20f33530Ef00BE13EC212F390B5E45` | `[REDACTED]` | `WhitelistUser1940` | `0` |
| `0xd965B931A62D47e17b76CC641bD41f1dbf9f3Fab` | `[REDACTED]` | `WhitelistUser1941` | `0` |
| `0xCdCB76C7f15024292A96f00ceD8C2FfeAC90D967` | `[REDACTED]` | `WhitelistUser1942` | `0` |
| `0x1773cF027F2671676BB2AC30328AA45c91CE61d6` | `[REDACTED]` | `WhitelistUser1943` | `0` |
| `0xcB64b07C15372617527747d992eb73BE1DF9BBf6` | `[REDACTED]` | `WhitelistUser1944` | `0` |
| `0x12c5cE54D312DEe3A62D24b41fA0E46605bCA199` | `[REDACTED]` | `WhitelistUser1945` | `0` |
| `0x1EBe4972D243B44C27dC7A41137E323A8F11845C` | `[REDACTED]` | `WhitelistUser1946` | `0` |
| `0xfcDb4D0A0bD3184357d417515F37EC14B517Bfe3` | `[REDACTED]` | `WhitelistUser1947` | `0` |
| `0xaF372c6d8bB7328768D744c0317FC2d0234393E9` | `[REDACTED]` | `WhitelistUser1948` | `0` |
| `0x404AE9ac2e6987f82774CfDa72F7aB4Bc7Ce6b79` | `[REDACTED]` | `WhitelistUser1949` | `0` |
| `0xBa22653a2d83178dD4B0c2f9086b5F77Ab041bbc` | `[REDACTED]` | `WhitelistUser1950` | `0` |
| `0xdF37B38A7CcB4d18072310302717A64a4Fb410A6` | `[REDACTED]` | `WhitelistUser1951` | `0` |
| `0x05Fd13C1Cba0f1f0200b3380774f56dC66470a67` | `[REDACTED]` | `WhitelistUser1952` | `0` |
| `0x28b9B7A5aDc164C47066665D29d7FF0d7300E2d7` | `[REDACTED]` | `WhitelistUser1953` | `0` |
| `0x2aE96E3972073dAA89976A64B04b78dcd114B579` | `[REDACTED]` | `WhitelistUser1954` | `0` |
| `0x71d7F2d6C28b8c616f6074fce85594522e694aa4` | `[REDACTED]` | `WhitelistUser1955` | `0` |
| `0x98fa65af9C7853E3E84eD3954124aC15cF179287` | `[REDACTED]` | `WhitelistUser1956` | `0` |
| `0xDDacD1689B61002f36A7eb1A5B765FECf3d8db9C` | `[REDACTED]` | `WhitelistUser1957` | `0` |
| `0x88Fe35EcaC314eFd291fA033F7AEE9F619b311d7` | `[REDACTED]` | `WhitelistUser1958` | `0` |
| `0xB323cE5280aF9f5194876188beb27cA50A5836b6` | `[REDACTED]` | `WhitelistUser1959` | `0` |
| `0xE5BD02A365F8a1D00D3f20edF8b2612b198f25ea` | `[REDACTED]` | `WhitelistUser1960` | `0` |
| `0x6C69506B8dA77952c77b9B6993E43693C48cEe5f` | `[REDACTED]` | `WhitelistUser1961` | `0` |
| `0x5B189e43BF159FD8965de419DC37163d0Ce6Ea25` | `[REDACTED]` | `WhitelistUser1962` | `0` |
| `0xA05d93adD0E3E6a372De7D7637C7e8D36c6ADfaE` | `[REDACTED]` | `WhitelistUser1963` | `0` |
| `0x58BE39276ab4f6fb40919e94b266C3Fb2373cE11` | `[REDACTED]` | `WhitelistUser1964` | `0` |
| `0xCD2f2F33dD1DDc6231b3C1cd2dB4FcA8d0962c8D` | `[REDACTED]` | `WhitelistUser1965` | `0` |
| `0x6D72EA03B4a863464CB7095bBa718e540C781CA7` | `[REDACTED]` | `WhitelistUser1966` | `0` |
| `0x6ea97c4e5D7DD98Eb2725e436ed6F8303f758c4e` | `[REDACTED]` | `WhitelistUser1967` | `0` |
| `0x7978DaF9a14d693783eecc00697CAe543859Cc48` | `[REDACTED]` | `WhitelistUser1968` | `0` |
| `0x9c85f79a73aB0677982f0617C99EB6fb51E07f53` | `[REDACTED]` | `WhitelistUser1969` | `0` |
| `0xba8D80fF75F764417BA9B4A43D8EE9fF44D014e9` | `[REDACTED]` | `WhitelistUser1970` | `0` |
| `0x751a45160ACF6151FB1a1789177e605CB6314eB3` | `[REDACTED]` | `WhitelistUser1971` | `0` |
| `0xcC8A936CCfECE46d5249379B33cD81747b7Fa195` | `[REDACTED]` | `WhitelistUser1972` | `0` |
| `0xC4C38cc03bc4189F047f35dc041208ae7FdA93da` | `[REDACTED]` | `WhitelistUser1973` | `0` |
| `0xf9e413996c5889Fa3518011d0A4ff5F3904D387E` | `[REDACTED]` | `WhitelistUser1974` | `0` |
| `0xeDab68aa67E9ac0BD423d255E7dafB9cfADaD3F7` | `[REDACTED]` | `WhitelistUser1975` | `0` |
| `0xE6108A0837a8c5e28D6F44A0068168fFb68030FF` | `[REDACTED]` | `WhitelistUser1976` | `0` |
| `0x05B3AA6059592972c5Bf54b9e3339AE4Df0d6b04` | `[REDACTED]` | `WhitelistUser1977` | `0` |
| `0x8d05010BF712d7D843306cF8F3a0de0cfD4a2C08` | `[REDACTED]` | `WhitelistUser1978` | `0` |
| `0xd566D0E332211D5d0d8e1BEFD21BD6BA0d829f3f` | `[REDACTED]` | `WhitelistUser1979` | `0` |
| `0xEc9AE44Cb8b140006880231ad41828b74585D064` | `[REDACTED]` | `WhitelistUser1980` | `0` |
| `0x96753c4d48fdCACbaD4cE5da9D890a55BE778a56` | `[REDACTED]` | `WhitelistUser1981` | `0` |
| `0xae86b70D0Ae5d0CaF0cc6c996133F1fCE2287940` | `[REDACTED]` | `WhitelistUser1982` | `0` |
| `0xa6416bAe581c444f1Bb978fC1e5c656d138e6eeE` | `[REDACTED]` | `WhitelistUser1983` | `0` |
| `0x225086917f926dA70ee06a7C101CC180C4C8853D` | `[REDACTED]` | `WhitelistUser1984` | `0` |
| `0xF5feaf15a63514CfEaCdB9a5fd91EF32d997bDa0` | `[REDACTED]` | `WhitelistUser1985` | `0` |
| `0x80AC5F0b47BB8092e3dada0BEa178011950967e6` | `[REDACTED]` | `WhitelistUser1986` | `0` |
| `0x48Ea4647b26c53894E1A506a2eed37e8C6fF9A76` | `[REDACTED]` | `WhitelistUser1987` | `0` |
| `0x157891d11fa3908E908CE19d693282e0F201Fdbc` | `[REDACTED]` | `WhitelistUser1988` | `0` |
| `0xA2C5Dfb2e6fAd04D1995Ba6Bf0c3158D7E6414ad` | `[REDACTED]` | `WhitelistUser1989` | `0` |
| `0xAa33904F7635813958a3d16C33384241bA954100` | `[REDACTED]` | `WhitelistUser1990` | `0` |
| `0xa3e30C134574cfbdB542d5A700bC14b18059F4a3` | `[REDACTED]` | `WhitelistUser1991` | `0` |
| `0x167f0D2A7F3E0388C09c22Bf6b33fe940Bc6E51A` | `[REDACTED]` | `WhitelistUser1992` | `0` |
| `0x220694795606362d6058AB39b7849700F00bb643` | `[REDACTED]` | `WhitelistUser1993` | `0` |
| `0x014B0a031941026b91691023C7f1548150F5A6Ad` | `[REDACTED]` | `WhitelistUser1994` | `0` |
| `0x089bd01466F37aF69A961A7d8484eddA673418D4` | `[REDACTED]` | `WhitelistUser1995` | `0` |
| `0x709F95970DB461fA674b278aEaB2181AfA07b6Db` | `[REDACTED]` | `WhitelistUser1996` | `0` |
| `0x1EE4F3B799714440bB2AA549048927E4472dC340` | `[REDACTED]` | `WhitelistUser1997` | `0` |
| `0x3b2384B755ffA891ee71d61b51ea2812EbbA4fDB` | `[REDACTED]` | `WhitelistUser1998` | `0` |
| `0x93De94B0D0d4E3eC09b12E6DdE8EB9dfeFDb5086` | `[REDACTED]` | `WhitelistUser1999` | `0` |
| `0x074BDeD25223f12F2b8e4d6e7EBb049E33B36298` | `[REDACTED]` | `WhitelistUser2000` | `0` |
