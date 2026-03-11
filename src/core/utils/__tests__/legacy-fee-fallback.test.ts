import { describe, expect, it } from 'bun:test';
import { isEip1559NotSupportedError, toLegacyFeeRequest } from '../legacy-fee-fallback';

describe('core/utils/legacy-fee-fallback', () => {
  it('detects EIP-1559 unsupported errors from RPC code/message', () => {
    const error = {
      code: -32602,
      message:
        'Invalid transaction params: params specify an EIP-1559 transaction but the current network does not support EIP-1559',
    };

    expect(isEip1559NotSupportedError(error)).toBe(true);
  });

  it('detects nested EIP-1559 unsupported errors via cause', () => {
    const error = {
      message: 'TransactionExecutionError',
      cause: {
        code: -32602,
        message:
          'Invalid transaction params: params specify an EIP-1559 transaction but the current network does not support EIP-1559',
      },
    };

    expect(isEip1559NotSupportedError(error)).toBe(true);
  });

  it('does not match unrelated errors', () => {
    const error = {
      code: -32000,
      message: 'execution reverted',
    };

    expect(isEip1559NotSupportedError(error)).toBe(false);
  });

  it('converts EIP-1559 request to legacy fee request', () => {
    const request = {
      to: '0x1111111111111111111111111111111111111111',
      data: '0x1234',
      maxFeePerGas: 123n,
      maxPriorityFeePerGas: 2n,
      type: 'eip1559',
    };

    const legacy = toLegacyFeeRequest(request);
    expect(legacy).not.toBeNull();
    expect(legacy?.gasPrice).toBe(123n);
    expect('maxFeePerGas' in (legacy ?? {})).toBe(false);
    expect('maxPriorityFeePerGas' in (legacy ?? {})).toBe(false);
    expect('type' in (legacy ?? {})).toBe(false);
  });

  it('returns null when request is not EIP-1559 shaped', () => {
    const request = {
      to: '0x1111111111111111111111111111111111111111',
      gasPrice: 5n,
    };

    expect(toLegacyFeeRequest(request)).toBeNull();
  });
});
