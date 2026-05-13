export type DiagnosticResult = {
  errors: string[];
  warnings: string[];
};

export function redactKnownSecrets(message: string, secrets: Array<string | undefined>): string {
  return secrets
    .filter((secret): secret is string => typeof secret === "string" && secret.length > 0)
    .reduce((redacted, secret) => redacted.replaceAll(secret, "$RPC_URL"), message);
}

export function redactDiagnostics<T extends DiagnosticResult>(result: T, secrets: Array<string | undefined>): T {
  return {
    ...result,
    errors: result.errors.map((error) => redactKnownSecrets(error, secrets)),
    warnings: result.warnings.map((warning) => redactKnownSecrets(warning, secrets)),
  };
}
