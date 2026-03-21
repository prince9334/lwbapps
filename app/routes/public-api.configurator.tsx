// public-api.configurator.tsx
// Public (unauthenticated) API used by the storefront widget
// GET  ?productId=X  → returns product config (sections, fields, pricing)
// POST { product_id, selections } → returns price + breakdown

import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import db from "../db.server";
import { evaluateRules, parseConditionJson } from "../lib/ruleEngine.server";
import { calculateDPOPrice } from "../lib/pricingEngine.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ── GET — Load product configuration ─────────────────────────────────────────
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");

  if (!productId) {
    return json({ error: "Missing productId" }, { status: 400, headers: CORS });
  }

  // Try finding by internal ID first; then by Shopify product ID
  const product = await db.product.findFirst({
    where: {
      OR: [
        { id: productId },
        { shopifyProductId: productId },
      ],
    },
    include: {
      shop: { include: { settings: true } },
      sections: {
        orderBy: { sortOrder: "asc" },
        include: {
          fields: {
            orderBy: { sortOrder: "asc" },
            include: {
              values: { orderBy: { sortOrder: "asc" } },
            },
          },
        },
      },
      calculations: true,
    },
  });

  if (!product) {
    return json({ error: "Product not found" }, { status: 404, headers: CORS });
  }

  // Map to storefront-safe shape (no internal IDs that reveal DB structure)
  const response = {
    id: product.id,
    shopifyProductId: product.shopifyProductId,
    basePrice: product.basePrice,
    engravingRate: product.engravingRate,
    settings: product.shop?.settings
      ? {
          swatchShape: product.shop.settings.swatchShape,
          swatchSize: product.shop.settings.swatchSize,
          swatchSpacing: product.shop.settings.swatchSpacing,
          borderWidth: product.shop.settings.borderWidth,
          borderColor: product.shop.settings.borderColor,
          tooltipBehavior: product.shop.settings.tooltipBehavior,
          tooltipDelay: product.shop.settings.tooltipDelay,
          customCss: product.shop.settings.customCss,
        }
      : null,
    sections: product.sections.map((sec: any) => ({
      id: sec.id,
      label: sec.label,
      visibility: sec.visibility,
      makeIt: sec.makeIt,
      conditionJson: sec.conditionJson,
      columns: sec.columns,
      rows: sec.rows,
      fields: sec.fields.map((f: any) => ({
        id: f.id,
        type: f.type,
        title: f.title,
        fieldCode: f.fieldCode,
        price: f.price,
        priceType: f.priceType,
        required: f.required,
        defaultValue: f.defaultValue,
        validation: f.validation,
        maxLength: f.maxLength,
        conditionJson: f.conditionJson,
        visibility: f.visibility,
        makeIt: f.makeIt,
        tooltip: f.tooltip,
        cssClass: f.cssClass,
        htmlAttributes: f.htmlAttributes,
        hideSkuInCart: f.hideSkuInCart,
        hideOnFocus: f.hideOnFocus,
        values: f.values.map((v: any) => ({
          id: v.id,
          label: v.label,
          value: v.value,
          priceModifier: v.priceModifier,
          priceType: v.priceType,
          imageUrl: v.imageUrl,
          colorHex: v.colorHex,
          isDefault: v.isDefault,
        })),
      })),
    })),
    // Also expose flat attributes list for backward compat
    attributes: product.sections.flatMap((sec: any) =>
      sec.fields.map((f: any) => ({
        id: f.id,
        name: f.fieldCode || f.title,
        label: f.title,
        type: f.type,
        displayType: f.type,
        isRequired: f.required,
        price: f.price,
        values: f.values.map((v: any) => ({
          value: v.value,
          label: v.label,
          priceModifier: v.priceModifier,
        })),
      }))
    ),
  };

  return json(response, { headers: CORS });
};

// ── POST — Calculate price for current selections ─────────────────────────────
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  try {
    const body = await request.json();
    const { product_id, selections } = body as { product_id: string; selections: Record<string, any> };

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

    if (!product) return json({ error: "Product not found" }, { status: 404, headers: CORS });

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

    return json({ price: result.finalPrice, breakdown: result.breakdown }, { headers: CORS });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500, headers: CORS });
  }
};
