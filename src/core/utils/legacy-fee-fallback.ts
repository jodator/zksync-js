type ErrorNode = {
  code?: unknown;
  shortMessage?: unknown;
  message?: unknown;
  cause?: unknown;
};

type FeeRequestLike = Record<string, unknown> & {
  gasPrice?: unknown;
  maxFeePerGas?: unknown;
  maxPriorityFeePerGas?: unknown;
  type?: unknown;
};

function errorChain(error: unknown, maxDepth = 5): ErrorNode[] {
  const chain: ErrorNode[] = [];
  let node = error as ErrorNode | undefined;

  for (let i = 0; i < maxDepth && node; i++) {
    chain.push(node);
    node = node.cause as ErrorNode | undefined;
  }

  return chain;
}

function toMessage(node: ErrorNode): string {
  const parts: string[] = [];
  if (typeof node.shortMessage === 'string' && node.shortMessage.length > 0) {
    parts.push(node.shortMessage);
  }
  if (typeof node.message === 'string' && node.message.length > 0) {
    parts.push(node.message);
  }
  return parts.join(' ').toLowerCase();
}

export function isEip1559NotSupportedError(error: unknown): boolean {
  const chain = errorChain(error);

  for (const node of chain) {
    const message = toMessage(node);
    const code = node.code;
    const hasEip1559 = message.includes('eip-1559');
    const saysNotSupported =
      message.includes('does not support') ||
      message.includes("doesn't support") ||
      message.includes('not support');

    if (code === -32602 && hasEip1559 && saysNotSupported) {
      return true;
    }

    if (hasEip1559 && saysNotSupported) {
      return true;
    }
  }

  return false;
}

export function toLegacyFeeRequest<T extends FeeRequestLike>(request: T): T | null {
  const hasEip1559Fields = request.maxFeePerGas != null || request.maxPriorityFeePerGas != null;
  if (!hasEip1559Fields) {
    return null;
  }

  const gasPrice = request.gasPrice ?? request.maxFeePerGas;
  if (gasPrice == null) {
    return null;
  }

  const legacyRequest: FeeRequestLike = {
    ...request,
    gasPrice,
  };

  delete legacyRequest.maxFeePerGas;
  delete legacyRequest.maxPriorityFeePerGas;
  delete legacyRequest.type;

  return legacyRequest as T;
}
