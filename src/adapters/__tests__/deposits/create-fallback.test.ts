import { describe, expect, it } from 'bun:test';

import { createDepositsResource as createEthersDepositsResource } from '../../ethers/resources/deposits';
import { createDepositsResource as createViemDepositsResource } from '../../viem/resources/deposits';
import {
  ADAPTER_TEST_ADDRESSES,
  createEthersHarness,
  createViemHarness,
  makeDepositContext,
  setBridgehubBaseCost,
} from '../adapter-harness.ts';
import { ETH_ADDRESS } from '../../../core/constants.ts';
import type { Address, Hex } from '../../../core/types/primitives.ts';

const TX_HASH = `0x${'ab'.repeat(32)}` as Hex;

const MOCK_ASSET_ID = `0x${'11'.repeat(32)}` as Hex;
const MOCK_WETH = '0x9999999999999999999999999999999999999999' as Address;

const tokensResource = {
  async resolve(token: Address) {
    return {
      kind: 'eth',
      l1: token,
      l2: ETH_ADDRESS,
      assetId: MOCK_ASSET_ID,
      originChainId: 1n,
      isChainEthBased: true,
      baseTokenAssetId: MOCK_ASSET_ID,
      wethL1: MOCK_WETH,
      wethL2: MOCK_WETH,
    };
  },
  async l1TokenFromAssetId() {
    return ETH_ADDRESS;
  },
} as const;

function eip1559UnsupportedError() {
  const err = new Error(
    'Invalid transaction params: params specify an EIP-1559 transaction but the current network does not support EIP-1559',
  ) as Error & { code: number };
  err.code = -32602;
  return err;
}

describe('adapters/deposits/create fallback', () => {
  it('ethers retries sendTransaction with legacy fees when EIP-1559 is unsupported', async () => {
    const harness = createEthersHarness();
    const quoteCtx = makeDepositContext(harness, { l2GasLimit: 600_000n });
    setBridgehubBaseCost(harness, quoteCtx, 2_000n);

    (harness.l1 as any).getTransactionCount = async () => 7;
    (harness.signer as any).populateTransaction = async (tx: Record<string, unknown>) => tx;

    const sent: Array<Record<string, unknown>> = [];
    (harness.signer as any).sendTransaction = async (tx: Record<string, unknown>) => {
      sent.push(tx);
      if (sent.length === 1) {
        throw eip1559UnsupportedError();
      }
      return {
        hash: TX_HASH,
        wait: async () => ({ status: 1 }),
      };
    };

    const deposits = createEthersDepositsResource(harness.client, tokensResource as any);

    const handle = await deposits.create({
      token: ETH_ADDRESS,
      amount: 1n,
      to: ADAPTER_TEST_ADDRESSES.signer,
      l2GasLimit: 600_000n,
    });

    expect(handle.l1TxHash).toBe(TX_HASH);
    expect(sent.length).toBe(2);

    expect(sent[0].maxFeePerGas).toBeDefined();
    expect(sent[0].maxPriorityFeePerGas).toBeDefined();

    expect(sent[1].gasPrice).toBe(sent[0].maxFeePerGas);
    expect(sent[1].maxFeePerGas).toBeUndefined();
    expect(sent[1].maxPriorityFeePerGas).toBeUndefined();
    expect(sent[1].type).toBeUndefined();
  });

  it('viem retries writeContract with legacy fees when EIP-1559 is unsupported', async () => {
    const harness = createViemHarness();
    (harness.client as any).account = { address: ADAPTER_TEST_ADDRESSES.signer };
    (harness.l1Wallet as any).account = { address: ADAPTER_TEST_ADDRESSES.signer };

    const quoteCtx = makeDepositContext(harness, { l2GasLimit: 600_000n });
    setBridgehubBaseCost(harness, quoteCtx, 2_000n);

    (harness.l1 as any).getTransactionCount = async () => 11;
    (harness.l1 as any).waitForTransactionReceipt = async () => ({
      status: 'success',
      logs: [],
      transactionHash: TX_HASH,
    });

    const sent: Array<Record<string, unknown>> = [];
    (harness.l1Wallet as any).writeContract = async (req: Record<string, unknown>) => {
      sent.push(req);
      if (sent.length === 1) {
        throw eip1559UnsupportedError();
      }
      return TX_HASH;
    };

    (harness.l1 as any).estimateContractGas = async () => 120_000n;

    const deposits = createViemDepositsResource(harness.client, tokensResource as any);

    const handle = await deposits.create({
      token: ETH_ADDRESS,
      amount: 1n,
      to: ADAPTER_TEST_ADDRESSES.signer,
      l2GasLimit: 600_000n,
    });

    expect(handle.l1TxHash).toBe(TX_HASH);
    expect(sent.length).toBe(2);

    expect(sent[0].maxFeePerGas).toBeDefined();
    expect(sent[0].maxPriorityFeePerGas).toBeDefined();

    expect(sent[1].gasPrice).toBe(sent[0].maxFeePerGas);
    expect(sent[1].maxFeePerGas).toBeUndefined();
    expect(sent[1].maxPriorityFeePerGas).toBeUndefined();
    expect(sent[1].type).toBeUndefined();
  });

  it('viem does not retry when the initial send error is unrelated', async () => {
    const harness = createViemHarness();
    (harness.client as any).account = { address: ADAPTER_TEST_ADDRESSES.signer };
    (harness.l1Wallet as any).account = { address: ADAPTER_TEST_ADDRESSES.signer };

    const quoteCtx = makeDepositContext(harness, { l2GasLimit: 600_000n });
    setBridgehubBaseCost(harness, quoteCtx, 2_000n);

    (harness.l1 as any).getTransactionCount = async () => 3;
    (harness.l1 as any).estimateContractGas = async () => 120_000n;
    (harness.l1 as any).waitForTransactionReceipt = async () => ({
      status: 'success',
      logs: [],
      transactionHash: TX_HASH,
    });

    let sendCalls = 0;
    (harness.l1Wallet as any).writeContract = async () => {
      sendCalls += 1;
      throw new Error('some other RPC failure');
    };

    const deposits = createViemDepositsResource(harness.client, tokensResource as any);

    let caught: unknown;
    try {
      await deposits.create({
        token: ETH_ADDRESS,
        amount: 1n,
        to: ADAPTER_TEST_ADDRESSES.signer,
        l2GasLimit: 600_000n,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    expect(sendCalls).toBe(1);
  });
});
