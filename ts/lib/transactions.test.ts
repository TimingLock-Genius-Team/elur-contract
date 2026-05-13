import { strict as assert } from "node:assert";
import test from "node:test";
import { waitForSuccessfulTransactionReceipt } from "./transactions.js";

test("waitForSuccessfulTransactionReceipt returns successful receipts", async () => {
  const receipt = {
    blockNumber: 123n,
    status: "success" as const,
    transactionHash: `0x${"1".repeat(64)}` as const,
  };

  const result = await waitForSuccessfulTransactionReceipt({
    client: {
      waitForTransactionReceipt: async () => receipt,
    },
    hash: receipt.transactionHash,
    label: "create token",
  });

  assert.equal(result, receipt);
});

test("waitForSuccessfulTransactionReceipt rejects reverted receipts", async () => {
  const hash = `0x${"2".repeat(64)}` as const;

  await assert.rejects(
    () => waitForSuccessfulTransactionReceipt({
      client: {
        waitForTransactionReceipt: async () => ({
          blockNumber: 456n,
          status: "reverted",
          transactionHash: hash,
        }),
      },
      hash,
      label: "buy",
    }),
    /buy reverted: 0x2222222222222222222222222222222222222222222222222222222222222222/,
  );
});
