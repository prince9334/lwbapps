import { json, type LoaderFunctionArgs } from "@remix-run/node";
import db from "../db.server";

// Public endpoint — no admin auth needed (called by storefront widget)
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const raw_product_id = url.searchParams.get("productId");

  // Log the request for debugging
  console.log(`[API Trace] Request for product: ${raw_product_id}`);
  
  await db.log.create({
    data: {
      level: "info",
      message: `API request for product config: ${raw_product_id}`,
      details: JSON.stringify({
        url: request.url,
        headers: Object.fromEntries(request.headers.entries()),
      }),
    }
  });

  if (!raw_product_id) {
    return json({ error: "product_id required" }, { status: 400 });
  }

  // Handle Shopify global IDs (gid://shopify/Product/12345) by stripping prefix
  const product_id = raw_product_id.replace("gid://shopify/Product/", "");

  // Look for product by shopifyProductId (the most common case for storefront lookups)
  const product = await db.product.findFirst({
    where: {
      shopifyProductId: product_id
    },
    include: {
      attributes: {
        include: {
          values: { orderBy: { sortOrder: "asc" } },
        },
        orderBy: { sortOrder: "asc" },
      },
      pricingRules: { where: { isActive: true } },
    },
  });

  if (!product) {
    // Second attempt: lookup by our internal ID
    const productById = await db.product.findUnique({
      where: { id: product_id },
      include: {
        attributes: {
          include: {
            values: { orderBy: { sortOrder: "asc" } },
          },
          orderBy: { sortOrder: "asc" },
        },
        pricingRules: { where: { isActive: true } },
      },
    });

    if (!productById) {
      console.log(`[API Trace] Product not found for ID: ${product_id}`);
      return json({ 
        error: "Product not found", 
        requested_id: product_id,
        trace: "checked shopifyProductId and internal id"
      }, { 
        status: 404,
        headers: corsHeaders
      });
    }
    
    console.log(`[API Trace] Product found by internal ID: ${productById.title}`);
    return json(serializeProduct(productById), { headers: corsHeaders });
  }

  console.log(`[API Trace] Product found by shopifyProductId: ${product.title}`);
  return json(serializeProduct(product), { headers: corsHeaders });
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=60",
};

function serializeProduct(product: any) {
  return {
    id: product.id,
    shopifyProductId: product.shopifyProductId,
    title: product.title,
    basePrice: product.basePrice,
    engravingRate: product.engravingRate,
    attributes: product.attributes.map((attr: any) => ({
      id: attr.id,
      name: attr.name,
      type: attr.type,
      displayType: attr.displayType,
      isRequired: attr.isRequired,
      sortOrder: attr.sortOrder,
      values: attr.values.map((v: any) => ({
        id: v.id,
        value: v.value,
        label: v.label,
        priceModifier: v.priceModifier,
        imageUrl: v.imageUrl,
        skuModifier: v.skuModifier,
        sortOrder: v.sortOrder,
      })),
    })),
    pricingRules: product.pricingRules.map((r: any) => ({
      id: r.id,
      conditions: r.conditions,
      priceModifier: r.priceModifier,
      ruleType: r.ruleType,
    })),
  };
}
