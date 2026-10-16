export function paymentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    UNPAID: 'Unpaid', PENDING_VERIFICATION: 'Pending verification', PAID: 'Paid',
    FAILED: 'Failed', CANCELLED: 'Cancelled', REFUNDED: 'Refunded',
    Pending: 'Unpaid', Processing: 'Pending verification',
  };
  return labels[status] || status;
}
