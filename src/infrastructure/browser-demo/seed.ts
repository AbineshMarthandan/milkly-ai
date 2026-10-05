import type { Bill, Category, Customer, Product, Role, Route, Sequence, SettingsDocument, User, Vendor } from '@/domain/models';
import { DEFAULT_APP_SETTINGS, SETTINGS_KEYS } from '@/domain/models/settings';
import { buildBillVendors } from '@/domain/services/billing/billDocument';
import { calculateTotals, summarizeVendors } from '@/domain/services/billing/calculations';
import { buildCatalog } from '@/domain/services/billing/catalog';
import { addDays, toLocalIsoDate } from '@/domain/services/dates';
import { BILL_NUMBER_FORMAT, ID_FORMATS, formatSequenceId } from '@/domain/services/ids';
import { SCHEMA_VERSION } from '../google-sheets/schemas/sheetSchemas';
import type { Collections, Document } from './LocalDatabase';

/** Deterministic PRNG so every fresh demo looks the same. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEMO_USERS: Array<{ email: string; displayName: string; role: Role }> = [
  { email: 'tech.admin@milkly.example', displayName: 'Priya (Tech Admin)', role: 'TECH_ADMIN' },
  { email: 'super.admin@milkly.example', displayName: 'Karthik (Super Admin)', role: 'SUPER_ADMIN' },
  { email: 'admin@milkly.example', displayName: 'Meena (Admin)', role: 'ADMIN' },
];

export function createDemoSeed(): Collections {
  const random = mulberry32(20261005);
  const today = toLocalIsoDate();
  const seededAt = new Date(`${addDays(today, -30)}T06:00:00Z`).toISOString();
  const techAdminId = formatSequenceId(ID_FORMATS.user, 1);
  const base = { isActive: true, version: 1, createdAt: seededAt, createdBy: techAdminId, updatedAt: seededAt, updatedBy: techAdminId };
  const id = (entity: keyof typeof ID_FORMATS, n: number) => formatSequenceId(ID_FORMATS[entity], n);

  const users: User[] = DEMO_USERS.map((user, index) => ({ ...base, _id: id('user', index + 1), ...user, lastLoginAt: null }));

  const vendorNames = ['Aavin', 'Milkymist', 'Heritage'];
  const vendors: Vendor[] = vendorNames.map((vendorName, index) => ({
    ...base,
    _id: id('vendor', index + 1),
    vendorId: id('vendor', index + 1),
    vendorName,
    priority: index + 1,
  }));

  const categorySpec: Array<[number, string]> = [
    [0, 'Milk'], [0, 'Curd'], [0, 'Butter'], [0, 'Buttermilk'], [0, 'Ghee'],
    [1, 'Milk'], [1, 'Curd'], [1, 'Paneer'],
    [2, 'Milk'], [2, 'Curd'], [2, 'Lassi'],
  ];
  const priorityWithinVendor = new Map<number, number>();
  const categories: Category[] = categorySpec.map(([vendorIndex, categoryName], index) => {
    const priority = (priorityWithinVendor.get(vendorIndex) ?? 0) + 1;
    priorityWithinVendor.set(vendorIndex, priority);
    return { ...base, _id: id('category', index + 1), vendorId: vendors[vendorIndex]._id, categoryName, priority };
  });

  // [categoryIndex, name, unit, purchase, mrp, selling]
  const productSpec: Array<[number, string, string, number, number, number]> = [
    [0, 'Milk', '1 L', 38, 40, 39],
    [0, 'Toned Milk', '500 ml', 21, 24, 23],
    [0, 'Standardised Milk', '500 ml', 23.5, 26, 25],
    [0, 'Full Cream Milk', '1 L', 58, 64, 62],
    [1, 'Curd', '500 g', 26, 30, 28.5],
    [1, 'Curd', '200 g', 12, 14, 13],
    [2, 'Butter', '100 g', 48, 55, 53],
    [3, 'Buttermilk', '200 ml', 12, 15, 14],
    [4, 'Ghee', '200 ml', 125, 140, 136],
    [5, 'Milk', '1 L', 37, 42, 40],
    [5, 'Milk', '500 ml', 20, 22, 21.5],
    [6, 'Curd', '400 g', 32, 38, 36],
    [7, 'Paneer', '200 g', 78, 90, 86],
    [8, 'Toned Milk', '500 ml', 22, 25, 24],
    [9, 'Curd', '500 g', 30, 35, 33],
    [10, 'Sweet Lassi', '200 ml', 16, 20, 19],
  ];
  const priorityWithinCategory = new Map<number, number>();
  const products: Product[] = productSpec.map(([categoryIndex, productName, unit, purchasePrice, mrp, sellingPrice], index) => {
    const priority = (priorityWithinCategory.get(categoryIndex) ?? 0) + 1;
    priorityWithinCategory.set(categoryIndex, priority);
    const category = categories[categoryIndex];
    return {
      ...base,
      _id: id('product', index + 1),
      vendorId: category.vendorId,
      categoryId: category._id,
      productName,
      unit,
      purchasePrice,
      mrp,
      sellingPrice,
      priority,
    };
  });

  const routes: Route[] = ['Route A', 'Route B', 'Route C'].map((routeName, index) => ({
    ...base,
    _id: id('route', index + 1),
    routeName,
    routeCode: `R-${String.fromCharCode(65 + index)}`,
    priority: index + 1,
  }));

  // [routeIndex, storeName, contact, phone, address, vendorIndexes]
  const customerSpec: Array<[number, string, string, string, string, number[]]> = [
    [0, 'Sri Murugan Stores', 'Murugan', '98400 11223', '12, Gandhi Road, Anna Nagar', []],
    [0, 'Lakshmi Provisions', 'Lakshmi', '98400 22334', '45, Market Street', []],
    [0, 'Annai Supermarket', 'Selvi', '98400 33445', '7, Temple Road', []],
    [0, 'Kumaran Bakery', 'Kumar', '98400 44556', '3, Bus Stand Road', [0, 1]],
    [1, 'Selvam Traders', 'Selvam', '98410 55667', '88, Main Bazaar', []],
    [1, 'Green Leaf Mart', 'Arun', '98410 66778', '21, Lake View Road', []],
    [1, 'Bharathi Stores', 'Bharathi', '98410 77889', '9, School Street', [0]],
    [2, 'City Café', 'Ravi', '98420 88990', '1, Cross Cut Road', [1]],
    [2, 'Royal Sweets', 'Imran', '98420 99001', '56, Big Bazaar Street', []],
    [2, 'Fresh Daily Mart', 'Deepa', '98420 10112', '14, Railway Feeder Road', []],
  ];
  const priorityWithinRoute = new Map<number, number>();
  const customers: Customer[] = customerSpec.map(([routeIndex, storeName, contactPerson, phone, address, vendorIndexes], index) => {
    const priority = (priorityWithinRoute.get(routeIndex) ?? 0) + 1;
    priorityWithinRoute.set(routeIndex, priority);
    return {
      ...base,
      _id: id('customer', index + 1),
      customerId: id('customer', index + 1),
      routeId: routes[routeIndex]._id,
      storeName,
      contactPerson,
      phone,
      address,
      priority,
      vendorIds: vendorIndexes.map((vendorIndex) => vendors[vendorIndex]._id),
    };
  });

  // ~3 weeks of history so the dashboard and reports have something to show.
  const bills: Bill[] = [];
  for (let day = 20; day >= 0; day -= 1) {
    const billDate = addDays(today, -day);
    const dailyCustomers = customers.filter(() => random() < (day === 0 ? 0.35 : 0.6));
    for (const customer of dailyCustomers) {
      const route = routes.find((candidate) => candidate._id === customer.routeId)!;
      const catalog = buildCatalog({ vendors, categories, products, customer });
      const quantities: Record<string, number> = {};
      for (const vendor of catalog) {
        for (const category of vendor.categories) {
          for (const product of category.products) {
            if (random() < 0.45) quantities[product.productId] = 1 + Math.floor(random() * (product.mrp < 30 ? 30 : 8));
          }
        }
      }
      const vendorGroups = buildBillVendors(catalog, quantities);
      if (!vendorGroups.length) continue;
      const number = bills.length + 1;
      const actor = users[number % 3 === 0 ? 2 : number % 3 === 1 ? 1 : 0];
      const at = new Date(`${billDate}T${String(7 + (number % 5)).padStart(2, '0')}:${String((number * 7) % 60).padStart(2, '0')}:00`).toISOString();
      bills.push({
        ...base,
        _id: formatSequenceId(ID_FORMATS.bill, number),
        billNumber: formatSequenceId(BILL_NUMBER_FORMAT, number),
        billDate,
        status: 'finalized',
        routeId: route._id,
        customerId: customer._id,
        routeSnapshot: { routeId: route._id, routeName: route.routeName, routeCode: route.routeCode },
        customerSnapshot: {
          customerId: customer._id,
          storeName: customer.storeName,
          contactPerson: customer.contactPerson,
          phone: customer.phone,
          address: customer.address,
          routeId: customer.routeId,
        },
        vendors: vendorGroups,
        vendorIds: vendorGroups.map((vendor) => vendor.vendorId),
        vendorSummary: summarizeVendors(vendorGroups),
        notes: '',
        itemsRevision: `seed${number}`,
        finalizedAt: at,
        finalizedBy: actor._id,
        finalizedByName: actor.displayName,
        createdByName: actor.displayName,
        cancelledAt: null,
        cancelledBy: null,
        cancelReason: '',
        createdAt: at,
        createdBy: actor._id,
        updatedAt: at,
        updatedBy: actor._id,
        ...calculateTotals(vendorGroups),
      });
    }
  }

  const counters: Record<keyof typeof ID_FORMATS, number> = {
    vendor: vendors.length,
    category: categories.length,
    product: products.length,
    route: routes.length,
    customer: customers.length,
    bill: bills.length,
    user: users.length,
  };
  const sequences: Sequence[] = Object.entries(counters).map(([entity, lastNumber]) => ({
    ...base,
    _id: entity as Sequence['_id'],
    prefix: ID_FORMATS[entity as Sequence['_id']].prefix,
    padding: 6,
    lastNumber,
  }));

  const settingsDoc = <T>(key: string, data: T): SettingsDocument<T> => ({
    _id: key,
    data,
    version: 1,
    createdAt: seededAt,
    createdBy: techAdminId,
    updatedAt: seededAt,
    updatedBy: techAdminId,
  });
  const settings = [
    settingsDoc(SETTINGS_KEYS.app, {
      ...DEFAULT_APP_SETTINGS,
      businessName: 'Milkly Dairy Distributors',
      businessAddress: '24, Dairy Colony Main Road, Chennai 600040',
      phone: '+91 98400 12345',
      taxId: '33ABCDE1234F1Z5',
    }),
    settingsDoc(SETTINGS_KEYS.database, { schemaVersion: SCHEMA_VERSION, initializedAt: seededAt, initializedBy: techAdminId }),
  ];

  const asDocs = (items: object[]) => items as Document[];
  return {
    users: asDocs(users),
    vendors: asDocs(vendors),
    categories: asDocs(categories),
    products: asDocs(products),
    routes: asDocs(routes),
    customers: asDocs(customers),
    bills: asDocs(bills),
    sequences: asDocs(sequences),
    settings: asDocs(settings),
  };
}
