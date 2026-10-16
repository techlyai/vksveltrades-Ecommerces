import type { Banner, Category, Product } from './models';

// Explicitly requested display samples. No sellable inventory or fabricated orders.
export function sampleCatalog(categories: Category[]) {
  const names: Record<string, string> = {
    electrical: 'Extension Board', plumbing: 'Basin Tap', paints: 'Interior Emulsion',
    fans: 'Ceiling Fan', switches: 'Modular Switch', wires: 'Copper Wire Roll',
    pipes: 'PVC Pipe', lighting: 'LED Bulb', hardware: 'Combination Spanner',
    cement: 'Cement Bag', other: 'Utility Tool Kit',
  };
  const products: Product[] = categories.map((category) => ({
    id: `sample-${category.id}`, name: `Sample ${names[category.id] || category.name + ' product'}`,
    categoryId: category.id, price: 100, stock: 0, hsn: '', enabled: true,
    short: 'Display sample — not available for purchase',
    description: 'Sample product for previewing the shop. Replace the name, photo, price and stock in Admin before selling.',
    accent: '#b87919',
  }));
  const banners: Banner[] = categories.filter((category) => category.enabled).slice(0, 3).map((category, index) => ({
    id: `sample-banner-${category.id}`, label: 'Sample collection', title: category.name,
    description: 'Explore essentials for your next project. Discover the collection below.',
    categoryId: category.id, accent: '#d7a447', enabled: true, order: index, duration: 3,
    buttonText: 'Explore collection', linkType: 'category', linkValue: category.id,
  }));
  return { products, banners };
}
