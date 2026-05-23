export const artifacts = {
  factory: "EulrFactory.sol/EulrFactory.json",
  hook: "EulrHook.sol/EulrHook.json",
  proxyAdmin: "ProxyAdmin.sol/ProxyAdmin.json",
  router: "EulrRouter.sol/EulrRouter.json",
  transparentUpgradeableProxy: "TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json",
  localExternalDependency: "LocalExternalDependency.sol/LocalExternalDependency.json",
  localMigrationTarget: "LocalMigrationTarget.sol/LocalMigrationTarget.json",
  uniswapV4MintPositionTarget: "UniswapV4MintPositionTarget.sol/UniswapV4MintPositionTarget.json",
  v4SellTaxHook: "EulrV4SellTaxHook.sol/EulrV4SellTaxHook.json",
  v4SellTaxHookDeployer: "EulrV4SellTaxHookDeployer.sol/EulrV4SellTaxHookDeployer.json",
} as const;
