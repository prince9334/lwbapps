import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding jewelry data...");

  // Seed Metals
  const metals = [
    { material: "10K", density: 0.88, pricePerGram: 30 },
    { material: "14K", density: 1.00, pricePerGram: 35 },
    { material: "18K", density: 1.14, pricePerGram: 40 },
    { material: "Platinum", density: 1.75, pricePerGram: 60 },
  ];

  for (const m of metals) {
    await prisma.metal.upsert({
      where: { material: m.material },
      update: m,
      create: m,
    });
  }

  // Seed Stone Prices
  const stones = [
    { minCarat: 0.1, maxCarat: 0.2, pricePerCarat: 200 },
    { minCarat: 0.2, maxCarat: 0.5, pricePerCarat: 350 },
    { minCarat: 0.5, maxCarat: 1.0, pricePerCarat: 600 },
  ];

  // Clear and re-seed stone prices (no unique constraint on range)
  await prisma.stonePrice.deleteMany();
  for (const s of stones) {
    await prisma.stonePrice.create({ data: s });
  }

  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
