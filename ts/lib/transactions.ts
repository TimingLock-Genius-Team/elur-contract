export type TransactionReceiptStatus = "success" | "reverted";

export type TransactionReceipt = {
  status: TransactionReceiptStatus;
  transactionHash: `0x${string}`;
};

export type TransactionReceiptClient<Receipt extends TransactionReceipt> = {
  waitForTransactionReceipt: (args: { hash: `0x${string}` }) => Promise<Receipt>;
};

export async function waitForSuccessfulTransactionReceipt<Receipt extends TransactionReceipt>(options: {
  client: TransactionReceiptClient<Receipt>;
  hash: `0x${string}`;
  label: string;
}): Promise<Receipt> {
  const receipt = await options.client.waitForTransactionReceipt({ hash: options.hash });
  if (receipt.status !== "success") {
    throw new Error(`${options.label} reverted: ${receipt.transactionHash}`);
  }

  return receipt;
}
