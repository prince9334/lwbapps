
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log("Testing DB connection (ESM)...");
  try {
    const products = await prisma.product.findMany({ take: 1 });
    console.log("Products found:", products.length);
    
    // Check if jewelry models exist
    try {
        const metals = await prisma.metal.findMany();
        console.log("Metals found:", metals.length);
    } catch (e) {
        console.error("Metal table error:", e.message);
    }

    try {
        const configVariants = await prisma.configurationVariant.findMany({ take: 1 });
        console.log("ConfigurationVariants found:", configVariants.length);
    } catch (e) {
        console.error("ConfigurationVariant table error:", e.message);
    }

  } catch (e) {
    console.error("CRITICAL DB ERROR:", e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
