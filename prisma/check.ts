import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const products = await prisma.product.findMany({ select: { id: true, title: true, shopifyProductId: true } });
  console.log("PRODUCTS:", JSON.stringify(products, null, 2));
}
main().finally(() => prisma.$disconnect());
