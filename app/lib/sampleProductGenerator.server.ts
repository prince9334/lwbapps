import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import db from "../db.server";

// ─── Ring sizes (US standard 4–13 half-sizes) ────────────────────────────────
const HIS_SIZES = [
  "8", "8.5", "9", "9.5", "10", "10.5", "11", "11.5", "12", "12.5", "13",
];
const HER_SIZES = [
  "4", "4.5", "5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9",
];

export async function createSampleJewelryProduct(
  admin: AdminApiContext,
  shopId: string,
) {
  // ── 1. Create Shopify product ────────────────────────────────────────────────
  const createMutation = `
    mutation productCreate($input: ProductInput!) {
      productCreate(input: $input) {
        product { id title }
        userErrors { field message }
      }
    }
  `;

  const input = {
    title: "0.10 Carat 4mm Matching Heart His & Hers Diamond Wedding Band Set",
    descriptionHtml: `
      <strong>Fully configurable matching wedding band set.</strong><br/>
      Choose your metal color, material (10K–Platinum), stone, finish, and ring sizes
      for both partners — with optional engraving. Price is calculated live based on
      your selections.
    `,
    vendor: "Product Configurator Demo",
    productType: "Jewelry",
    tags: ["demo", "wedding-band", "configurator"],
    status: "ACTIVE",
    productOptions: [{ name: "Title", values: [{ name: "Default Title" }] }],
  };

  const res = await admin.graphql(createMutation, { variables: { input } });
  const { data } = await res.json();

  if (data?.productCreate?.userErrors?.length > 0) {
    throw new Error(data.productCreate.userErrors[0].message);
  }

  const shopifyProduct = data.productCreate.product;
  const shopifyProductId = shopifyProduct.id.replace("gid://shopify/Product/", "");

  // ── 2. Create our DB product record ──────────────────────────────────────────
  const product = await db.product.create({
    data: {
      shopId,
      shopifyProductId,
      title: shopifyProduct.title,
      basePrice: 1345,
      status: "active",
      engravingRate: 10,
    },
  });

  // ── 3. Create Section: "Ring Customization" ────────────────────────────────
  const section = await db.section.create({
    data: {
      productId: product.id,
      label: "Ring Customization",
      visibility: "visible",
      columns: 2,
      rows: 5,
      sortOrder: 0,
    },
  });

  // ── 4a. COLOR — color_swatch ──────────────────────────────────────────────
  const colorField = await db.field.create({
    data: {
      sectionId: section.id,
      type: "color_swatch",
      title: "Color",
      fieldCode: "COLOR",
      price: 0,
      required: true,
      defaultValue: "White",
      sortOrder: 0,
    },
  });
  for (const [i, c] of [
    { label: "White",  value: "White",  colorHex: "#E8E8E8", priceModifier: 0,  isDefault: true  },
    { label: "Yellow", value: "Yellow", colorHex: "#D4AF37", priceModifier: 50, isDefault: false },
    { label: "Rose",   value: "Rose",   colorHex: "#B76E79", priceModifier: 50, isDefault: false },
  ].entries()) {
    await db.fieldValue.create({ data: { fieldId: colorField.id, sortOrder: i, ...c } });
  }

  // ── 4b. MATERIAL — radio ──────────────────────────────────────────────────
  const materialField = await db.field.create({
    data: {
      sectionId: section.id,
      type: "radio",
      title: "Material",
      fieldCode: "MATERIAL",
      price: 0,
      required: true,
      defaultValue: "10K",
      sortOrder: 1,
    },
  });
  for (const [i, m] of [
    { label: "10K",          value: "10K",         priceModifier: 0,   isDefault: true  },
    { label: "14K",          value: "14K",         priceModifier: 200, isDefault: false },
    { label: "18K",          value: "18K",         priceModifier: 450, isDefault: false },
    { label: "550 Platinum", value: "550Platinum", priceModifier: 900, isDefault: false },
  ].entries()) {
    await db.fieldValue.create({ data: { fieldId: materialField.id, sortOrder: i, ...m } });
  }

  // ── 4c. STONE — image_swatch ──────────────────────────────────────────────
  const stoneField = await db.field.create({
    data: {
      sectionId: section.id,
      type: "image_swatch",
      title: "Stone",
      fieldCode: "STONE",
      price: 0,
      required: false,
      defaultValue: "Diamond",
      sortOrder: 2,
    },
  });
  await db.fieldValue.create({
    data: {
      fieldId: stoneField.id,
      label: "Diamond",
      value: "Diamond",
      priceModifier: 0,
      imageUrl: "https://cdn.shopify.com/s/files/1/0262/4071/2726/files/diamond-icon.png",
      isDefault: true,
      sortOrder: 0,
    },
  });

  // ── 4d. FINISHING — image_swatch ──────────────────────────────────────────
  const finishField = await db.field.create({
    data: {
      sectionId: section.id,
      type: "image_swatch",
      title: "Finishing",
      fieldCode: "FINISH",
      price: 0,
      required: false,
      defaultValue: "Matte",
      sortOrder: 3,
    },
  });
  for (const [i, f] of [
    { label: "Matte",    value: "Matte",    priceModifier: 0,  isDefault: true,  colorHex: "#C0C0C0" },
    { label: "Satin",    value: "Satin",    priceModifier: 25, isDefault: false, colorHex: "#A8A8A8" },
    { label: "Polish",   value: "Polish",   priceModifier: 25, isDefault: false, colorHex: "#888888" },
    { label: "Hammered", value: "Hammered", priceModifier: 50, isDefault: false, colorHex: "#707070" },
    { label: "Milgrain", value: "Milgrain", priceModifier: 75, isDefault: false, colorHex: "#585858" },
  ].entries()) {
    await db.fieldValue.create({ data: { fieldId: finishField.id, sortOrder: i, ...f } });
  }

  // ── 4e. HIS SIZE — dropdown ───────────────────────────────────────────────
  const hisSizeField = await db.field.create({
    data: {
      sectionId: section.id,
      type: "dropdown",
      title: "His Size",
      fieldCode: "HIS_SIZE",
      price: 0,
      required: true,
      sortOrder: 4,
    },
  });
  for (const [i, size] of HIS_SIZES.entries()) {
    await db.fieldValue.create({
      data: { fieldId: hisSizeField.id, label: size, value: size, priceModifier: 0, isDefault: i === 0, sortOrder: i },
    });
  }

  // ── 4f. HIS ENGRAVING — text input ────────────────────────────────────────
  await db.field.create({
    data: {
      sectionId: section.id,
      type: "input",
      title: "His Engraving",
      fieldCode: "HIS_ENGRAVING",
      price: 10,
      priceType: "fixed",
      required: false,
      maxLength: 40,
      tooltip: "Up to 40 characters. Price is $10 per character.",
      sortOrder: 5,
    },
  });

  // ── 4g. HER SIZE — dropdown ───────────────────────────────────────────────
  const herSizeField = await db.field.create({
    data: {
      sectionId: section.id,
      type: "dropdown",
      title: "Her Size",
      fieldCode: "HER_SIZE",
      price: 0,
      required: true,
      sortOrder: 6,
    },
  });
  for (const [i, size] of HER_SIZES.entries()) {
    await db.fieldValue.create({
      data: { fieldId: herSizeField.id, label: size, value: size, priceModifier: 0, isDefault: i === 0, sortOrder: i },
    });
  }

  // ── 4h. HER ENGRAVING — text input ────────────────────────────────────────
  await db.field.create({
    data: {
      sectionId: section.id,
      type: "input",
      title: "Her Engraving",
      fieldCode: "HER_ENGRAVING",
      price: 10,
      priceType: "fixed",
      required: false,
      maxLength: 40,
      tooltip: "Up to 40 characters. Price is $10 per character.",
      sortOrder: 7,
    },
  });

  // ── 5. Pricing calculation ────────────────────────────────────────────────
  await db.calculation.create({
    data: {
      productId: product.id,
      name: "Engraving Cost",
      formula: "(len(his_engraving) + len(her_engraving)) * 10",
      variables: JSON.stringify(["his_engraving", "her_engraving"]),
    },
  });

  return product;
}
