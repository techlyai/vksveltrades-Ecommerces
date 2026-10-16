export function planOrderCleanup(records) {
  const orders = records.filter((row) => row.kind === 'orders').map((row) => row.payload);
  const candidates = orders.filter((order) => order.payment.method === 'UPI'
    && !order.payment.reference && !order.submittedAt
    && ['Pending', 'Expired', 'Failed', 'Cancelled', 'UNPAID', 'FAILED', 'CANCELLED'].includes(order.payment.status)
    && ['Order Placed', 'Pending Payment', 'Cancelled'].includes(order.status));
  const products = structuredClone(records.filter((row) => row.kind === 'products').map((row) => row.payload));
  for (const order of candidates.filter((order) => order.status !== 'Cancelled')) {
    for (const item of order.items) {
      const product = products.find((product) => product.id === item.productId);
      const variant = product?.variants?.find((variant) => variant.id === item.variantId);
      if (item.variantId && product && !variant) throw new Error('Cleanup refused: a reserved product variant is missing; review inventory manually.');
      if (variant) variant.stock += item.quantity;
      else if (product) product.stock += item.quantity;
    }
  }
  return { orders, candidates, products,
    lastOrderNumber: Math.max(1000, ...orders.map((order) => Number(order.id.replace(/\D/g, '')) || 1000)) };
}
