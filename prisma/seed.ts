import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed Estafeten...')

  const filePath = path.join(process.cwd(), 'src/data/seedMenu.estafeten.json')
  const rawData = fs.readFileSync(filePath, 'utf-8')
  const data = JSON.parse(rawData)

  // 1. Tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: data.tenant.slug },
    update: {},
    create: {
      name: data.tenant.name,
      slug: data.tenant.slug,
    },
  })

  console.log(`✅ Tenant creado: ${tenant.name}`)

  // 2. Store
  const store = await prisma.store.create({
    data: {
      tenantId: tenant.id,
      name: data.store.name,
      address: data.store.address,
      city: data.store.city,
      postalCode: data.store.postalCode,
    },
  })

  console.log(`✅ Store creada: ${store.name}`)

  // 3. Categorías y productos
  for (const category of data.categories) {
    const createdCategory = await prisma.category.create({
      data: {
        tenantId: tenant.id,
        name: category.name,
        slug: category.slug,
        sortOrder: category.sortOrder ?? 0,
      },
    })

    for (const product of category.products) {
      await prisma.product.create({
        data: {
          tenantId: tenant.id,
          categoryId: createdCategory.id,
          name: product.name,
          slug: product.slug,
          description: product.description ?? '',
          basePriceCents: product.priceCents,
        },
      })
    }
  }

  console.log('✅ Categorías y productos creados')
  console.log('🎉 Seed completado con éxito')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
