import type { Order } from '../../lib/types';
import { formatOrderMoney, orderGstLabel } from '../../lib/checkout-pricing';

export function CheckoutTotals({ totals }: { totals: Pick<Order, 'subtotal' | 'discount' | 'discountPercent' | 'delivery' | 'gst' | 'total' | 'gstRate' | 'gstInclusive'> }) {
  return <>
    <div><span>Subtotal</span><b>{formatOrderMoney(totals.subtotal)}</b></div>
    <div className="discount"><span>Discount{totals.discountPercent !== undefined ? ` (${totals.discountPercent}%)` : ''}</span><b>{totals.discount > 0 ? '−' : ''}{formatOrderMoney(totals.discount)}</b></div>
    <div><span>Delivery</span><b>{totals.delivery ? formatOrderMoney(totals.delivery) : 'FREE'}</b></div>
    <div><span>{orderGstLabel(totals)}</span><b>{formatOrderMoney(totals.gst)}</b></div>
    <div className="grand"><span>Final payable amount</span><b>{formatOrderMoney(totals.total)}</b></div>
  </>;
}
