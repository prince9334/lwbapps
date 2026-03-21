// api.calculate-price.tsx — Legacy price calculation endpoint (updated for DPO schema)
import { json, type ActionFunctionArgs } from "@remix-run/node";
import db from "../db.server";
import { calculateDPOPrice } from "../lib/pricingEngine.server";
import { evaluateRules } from "../lib/ruleEngine.server";

const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json();
  const { product_id, selections } = body as {
    product_id: string;
    selections: Record<string, string | number | string[]>;
  };

  if (!product_id || !selections) {
    return json({ error: "product_id and selections are required" }, { status: 400 });
  }

  const product = await db.product.findFirst({
    where: { OR: [{ id: product_id }, { shopifyProductId: product_id }] },
    include: {
      sections: {
        include: {
          fields: {
            include: { values: true, rules: true },
          },
        },
      },
      calculations: true,
    },
  });

  if (!product) {
    return json({ error: "Product not found" }, { status: 404 });
  }

  const allFields = product.sections.flatMap((s: any) => s.fields);
  const allRules = allFields.flatMap((f: any) => f.rules);
  const allFieldIds = allFields.map((f: any) => f.id);
  const ruleResult = evaluateRules(allRules, selections, allFieldIds);

  const result = calculateDPOPrice(
    {
      basePrice: product.basePrice,
      engravingRate: product.engravingRate,
      fields: allFields.map((f: any) => ({
        id: f.id,
        type: f.type,
        title: f.title,
        price: f.price,
        priceType: f.priceType,
        values: f.values.map((v: any) => ({
          value: v.value,
          priceModifier: v.priceModifier,
          priceType: v.priceType,
        })),
      })),
      calculations: product.calculations.map((c: any) => ({
        id: c.id,
        name: c.name,
        formula: c.formula,
        variables: (() => { try { return JSON.parse(c.variables || "[]"); } catch { return []; } })(),
      })),
    },
    selections,
    ruleResult.visibleFields
  );

  return json(
    { price: result.finalPrice, breakdown: result.breakdown },
    { headers: CORS_HEADERS }
  );
};

export const loader = async () => {
  return new Response(null, {
    headers: {
      ...CORS_HEADERS,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
};
