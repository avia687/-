import { PrismaClient, ProductStatus, Role, SupplierProvider } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const slug = 'demo-store';
  const existing = await prisma.tenant.findUnique({ where: { slug } });
  if (existing) {
    // eslint-disable-next-line no-console
    console.log('Seed already applied (tenant "demo-store" exists). Skipping.');
    return;
  }

  const tenant = await prisma.tenant.create({
    data: { name: 'Demo Store', slug },
  });

  const passwordHash = await argon2.hash('password123');
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: 'owner@demo.com',
      passwordHash,
      name: 'Demo Owner',
      role: Role.STORE_OWNER,
    },
  });

  const supplier = await prisma.supplier.create({
    data: { tenantId: tenant.id, name: 'Demo Manual Supplier', provider: SupplierProvider.MANUAL },
  });

  await prisma.product.create({
    data: {
      tenantId: tenant.id,
      supplierId: supplier.id,
      title: 'Wireless Earbuds Pro',
      description: 'Noise-cancelling true wireless earbuds.',
      status: ProductStatus.ACTIVE,
      basePriceCents: 2999,
      currency: 'USD',
      variants: {
        create: [
          {
            sku: 'EB-PRO-BLK',
            title: 'Black',
            priceCents: 2999,
            costCents: 1200,
            inventory: { create: { quantity: 500 } },
          },
          {
            sku: 'EB-PRO-WHT',
            title: 'White',
            priceCents: 2999,
            costCents: 1200,
            inventory: { create: { quantity: 300 } },
          },
        ],
      },
    },
  });

  // eslint-disable-next-line no-console
  console.log('Seed complete.');
  console.log('  Tenant:   Demo Store (slug: demo-store)');
  console.log('  Login:    owner@demo.com / password123');
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
