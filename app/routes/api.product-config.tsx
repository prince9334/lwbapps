// api.product-config.tsx — Legacy product config endpoint (updated for DPO schema)
import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import db from "../db.server";
import { calculateDPOPrice } from "../lib/pricingEngine.server";
import { evaluateRules } from "../lib/ruleEngine.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=60",
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method === "POST") {
    const body = await request.json();
    const { product_id, selections } = body as {
      product_id: string;
      selections: Record<string, string | number | string[]>;
    };

    if (!product_id || !selections) {
      return json({ error: "product_id and selections are required" }, { status: 400, headers: corsHeaders });
    }

    const product = await db.product.findFirst({
      where: { OR: [{ id: product_id }, { shopifyProductId: product_id.replace("gid://shopify/Product/", "") }] },
      include: {
        sections: {
          include: { fields: { include: { values: true, rules: true } } },
        },
        calculations: true,
      },
    });

    if (!product) return json({ error: "Product not found" }, { status: 404, headers: corsHeaders });

    const allFields = product.sections.flatMap((s: any) => s.fields);
    const allRules = allFields.flatMap((f: any) => f.rules);
    const allFieldIds = allFields.map((f: any) => f.id);
    const ruleResult = evaluateRules(allRules, selections, allFieldIds);

    const result = calculateDPOPrice(
      {
        basePrice: product.basePrice,
        engravingRate: product.engravingRate,
        fields: allFields.map((f: any) => ({ id: f.id, type: f.type, title: f.title, price: f.price, priceType: f.priceType, values: f.values.map((v: any) => ({ value: v.value, priceModifier: v.priceModifier, priceType: v.priceType })) })),
        calculations: product.calculations.map((c: any) => ({ id: c.id, name: c.name, formula: c.formula, variables: (() => { try { return JSON.parse(c.variables || "[]"); } catch { return []; } })() })),
      },
      selections,
      ruleResult.visibleFields
    );

    return json({ price: result.finalPrice, breakdown: result.breakdown }, { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  return json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
};

export const loader = async ({ request, params }: LoaderFunctionArgs & { params: { id?: string } }) => {
  const url = new URL(request.url);
  const rawId =
    url.searchParams.get("productId") ||
    url.searchParams.get("product_id") ||
    (params as any).id || "";
  const productId = rawId.replace("gid://shopify/Product/", "").trim();

  if (!productId) return json({ error: "productId required" }, { status: 400, headers: corsHeaders });

  const product = await db.product.findFirst({
    where: { OR: [{ shopifyProductId: productId }, { id: productId }] },
    include: {
      sections: {
        orderBy: { sortOrder: "asc" },
        include: { fields: { orderBy: { sortOrder: "asc" }, include: { values: { orderBy: { sortOrder: "asc" } } } } },
      },
    },
  });

  if (!product) return json({ error: "Product not found", requested_id: productId }, { status: 404, headers: corsHeaders });

  return json({
    id: product.id,
    shopifyProductId: product.shopifyProductId,
    title: product.title,
    basePrice: product.basePrice,
    engravingRate: product.engravingRate,
    sections: product.sections.map((s: any) => ({
      id: s.id,
      label: s.label,
      columns: s.columns,
      rows: s.rows,
      fields: s.fields.map((f: any) => ({
        id: f.id,
        type: f.type,
        title: f.title,
        required: f.required,
        values: f.values.map((v: any) => ({ value: v.value, label: v.label, priceModifier: v.priceModifier })),
      })),
    })),
  }, { headers: corsHeaders });
};
