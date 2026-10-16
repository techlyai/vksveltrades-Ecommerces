import type { Category } from './models';

// The shop owner's requested departments, installed once; never demo stock.
export const shopCategories: Category[] = [
  { id: 'electrical', name: 'Electrical Items', icon: 'bolt', enabled: true },
  { id: 'plumbing', name: 'Plumbing Items', icon: 'tap', enabled: true },
  { id: 'paints', name: 'Paints', icon: 'roller', enabled: true },
  { id: 'fans', name: 'Fans', icon: 'fan', enabled: true },
  { id: 'switches', name: 'Switches', icon: 'switch', enabled: true },
  { id: 'wires', name: 'Wires & Cables', icon: 'coil', enabled: true },
  { id: 'pipes', name: 'Pipes & Fittings', icon: 'pipe', enabled: true },
  { id: 'lighting', name: 'Lighting', icon: 'bulb', enabled: true },
  { id: 'hardware', name: 'Hardware', icon: 'wrench', enabled: true },
  { id: 'cement', name: 'Cement & Construction', icon: 'brick', enabled: true },
  { id: 'other', name: 'Other Products', icon: 'box', enabled: true },
];
