import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

export async function GET() {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: 'estafeten' },
      select: { id: true, name: true, slug: true },
    });
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const catCount = await prisma.category.count({ where: { tenantId: tenant.id } });
    const prodCount = await prisma.product.count({ where: { tenantId: tenant.id } });

    return NextResponse.json({
      ok: true,
      tenant: tenant.name,
      categories: catCount,
      products: prodCount,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
