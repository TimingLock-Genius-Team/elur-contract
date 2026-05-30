export const artifacts = {
  factory: "EulrFactory.sol/EulrFactory.json",
  hook: "EulrHook.sol/EulrHook.json",
  proxyAdmin: "ProxyAdmin.sol/ProxyAdmin.json",
  router: "EulrRouter.sol/EulrRouter.json",
  transparentUpgradeableProxy:
    "TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json",
  localExternalDependency:
    "LocalExternalDependency.sol/LocalExternalDependency.json",
  localMigrationTarget: "LocalMigrationTarget.sol/LocalMigrationTarget.json",
  uniswapV4MintPositionTarget:
    "UniswapV4MintPositionTarget.sol/UniswapV4MintPositionTarget.json",
  eulrHookRegistry: "EulrHookRegistry.sol/EulrHookRegistry.json",
  eulrDirectV4LaunchFactory:
    "EulrDirectV4LaunchFactory.sol/EulrDirectV4LaunchFactory.json",
} as const;
