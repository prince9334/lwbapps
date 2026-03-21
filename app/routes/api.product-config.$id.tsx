import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import db from "../db.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=60",
};

// OPTIONS (CORS preflight)
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
};

// GET /api/product-config/:id (matches CDN script's call pattern)
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const productIdRaw = (params as any).id || "";
  const productId = productIdRaw.replace("gid://shopify/Product/", "").trim();

  if (!productId) {
    return json({ error: "productId required" }, { status: 400, headers: corsHeaders });
  }

  const product = await db.product.findFirst({
    where: {
      OR: [
        { shopifyProductId: productId },
        { id: productId },
      ],
    },
    include: {
      attributes: {
        include: { values: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
      pricingRules: { where: { isActive: true } },
    },
  });

  if (!product) {
    return json(
      { error: "Product not found", requested_id: productId },
      { status: 404, headers: corsHeaders }
    );
  }

  return json(serializeProduct(product), { headers: corsHeaders });
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
