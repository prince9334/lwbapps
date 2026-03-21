// api.checkout.tsx — Runtime Variant Generation System
// 1. Receive selections from storefront
// 2. Recalculate price server-side
// 3. Generate config hash
// 4. Check VariantCache; if hit → return cached variant
// 5. If miss → create Shopify variant → cache → return
// 6. Fallback: draft order if variant creation fails

import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { createHash } from "crypto";
import db from "../db.server";
import { calculateDPOPrice } from "../lib/pricingEngine.server";
import { evaluateRules, parseConditionJson } from "../lib/ruleEngine.server";
import shopify from "../shopify.server";

// ─── CORS / Public endpoint ───────────────────────────────────────────────────
export const loader = async () => {
  return json({ ok: true });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  try {
    const body = await request.json();
    const { productId, selections, shop } = body as {
      productId: string;
      selections: Record<string, string | number | string[]>;
      shop?: string;
    };

    if (!productId || !selections) {
      return json({ error: "Missing productId or selections" }, { status: 400, headers });
    }

    // ── Load product + sections + fields ─────────────────────────────────────
    const product = await db.product.findUnique({
      where: { id: productId },
      include: {
        shop: true,
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
      return json({ error: "Product not found" }, { status: 404, headers });
    }

    const allFields = product.sections.flatMap((s: any) => s.fields);
    const allRules = allFields.flatMap((f: any) => f.rules);
    const allFieldIds = allFields.map((f: any) => f.id);

    // ── Evaluate rules to determine visible fields ────────────────────────────
    const ruleResult = evaluateRules(allRules, selections, allFieldIds);
    const visibleFieldIds = ruleResult.visibleFields;

    // ── Calculate final price server-side ─────────────────────────────────────
    const fieldPricingConfig = allFields.map((f: any) => ({
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
    }));

    const priceResult = calculateDPOPrice(
      {
        basePrice: product.basePrice,
        engravingRate: product.engravingRate,
        fields: fieldPricingConfig,
        calculations: product.calculations.map((c: any) => ({
          id: c.id,
          name: c.name,
          formula: c.formula,
          variables: (() => { try { return JSON.parse(c.variables || "[]"); } catch { return []; } })(),
        })),
      },
      selections,
      visibleFieldIds
    );

    const finalPrice = priceResult.finalPrice;

    // ── Generate config hash ───────────────────────────────────────────────────
    const sortedSelections = Object.entries(selections)
      .sort(([a], [b]) => a.localeCompare(b))
      .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});
    const configHash = createHash("sha256")
      .update(productId + JSON.stringify(sortedSelections))
      .digest("hex");

    // ── Check VariantCache ────────────────────────────────────────────────────
    const cached = await db.variantCache.findUnique({ where: { configHash } });
    if (cached) {
      await db.variantCache.update({
        where: { id: cached.id },
        data: { lastUsed: new Date() },
      });
      return json(
        { variantId: cached.shopifyVariantId, price: cached.price, breakdown: priceResult.breakdown, cached: true },
        { headers }
      );
    }

    // ── Create Shopify variant ────────────────────────────────────────────────
    const shopDomain = product.shop.shopDomain;
    const accessToken = product.shop.accessToken;

    // Build SKU from base product SKU + field codes
    const baseSku = product.shopifyProductId;
    const selectionParts = Object.entries(selections)
      .map(([fieldId, val]) => {
        const field = allFields.find((f: any) => f.id === fieldId);
        if (!field) return null;
        const fieldVal = allFields
          .find((f: any) => f.id === fieldId)
          ?.values?.find((v: any) => v.value === val);
        const code = field.fieldCode || fieldId.slice(0, 4).toUpperCase();
        const valCode = fieldVal?.skuModifier || String(val).slice(0, 4).toUpperCase();
        return code + ":" + valCode;
      })
      .filter(Boolean)
      .join("-");
    const sku = `CUSTOM-${baseSku}-${selectionParts}`.slice(0, 100);

    // Build variant title from selections
    const variantTitle = Object.entries(selections)
      .map(([fieldId, val]) => {
        const field = allFields.find((f: any) => f.id === fieldId);
        return field ? `${field.title}: ${val}` : null;
      })
      .filter(Boolean)
      .join(", ")
      .slice(0, 255) || "Custom Configuration";

    let shopifyVariantId: string | null = null;

    try {
      // ── Create Shopify variant via GraphQL (more robust) ──────────────────────
      const { admin } = await shopify.unauthenticated.admin(shopDomain);

      const variantCreateMutation = `
        mutation productVariantCreate($input: ProductVariantInput!) {
          productVariantCreate(input: $input) {
            productVariant {
              id
              inventoryItem {
                id
                tracked
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const variantInput = {
        productId: `gid://shopify/Product/${product.shopifyProductId}`,
        options: [variantTitle.slice(0, 255)],
        price: finalPrice.toFixed(2),
        sku,
        inventoryItem: {
          tracked: false
        },
        inventoryPolicy: "CONTINUE"
      };

      const variantRes = await admin.graphql(variantCreateMutation, {
        variables: { input: variantInput }
      });

      const variantData = await variantRes.json() as any;
      const variantResult = variantData.data?.productVariantCreate;

      if (variantResult?.userErrors?.length > 0) {
        throw new Error(`Shopify variant creation failed: ${variantResult.userErrors[0].message}`);
      }

      const gid = variantResult?.productVariant?.id;
      if (!gid) throw new Error("No variant ID returned from GraphQL");
      
      shopifyVariantId = gid.split("/").pop();

      // ── Cache the variant ───────────────────────────────────────────────────
      await db.variantCache.create({
        data: {
          productId,
          configHash,
          shopifyVariantId: shopifyVariantId!,
          price: finalPrice,
          sku,
        },
      });

      return json(
        { variantId: shopifyVariantId, price: finalPrice, breakdown: priceResult.breakdown, cached: false },
        { headers }
      );
    } catch (variantError: any) {
      // ── Fallback: return first available variant + price override signal ─────
      console.error("[Checkout] Variant creation failed, using fallback:", variantError.message);

      // Log the error
      await db.log.create({
        data: {
          level: "error",
          message: "Variant creation failed, using fallback",
          details: JSON.stringify({ error: variantError.message, productId, configHash }),
          shop: shopDomain,
        },
      });

      // Try to get the first existing variant (fallback)
      try {
        const fallbackRes = await fetch(
          `https://${shopDomain}/admin/api/2024-04/products/${product.shopifyProductId}/variants.json?limit=1`,
          { headers: { "X-Shopify-Access-Token": accessToken } }
        );
        const fallbackData = await fallbackRes.json() as any;
        const fallbackVariantId = String(fallbackData.variants?.[0]?.id);

        if (fallbackVariantId && fallbackVariantId !== "undefined") {
          return json(
            {
              variantId: fallbackVariantId,
              price: finalPrice,
              breakdown: priceResult.breakdown,
              cached: false,
              fallback: true,
              note: "Variant creation failed; using base variant with price noted in cart properties",
            },
            { headers }
          );
        }
      } catch (err) {
        console.error("[Checkout] Fallback failed:", err);
      }

      return json(
        { error: "Could not create or find a variant for this configuration", breakdown: priceResult.breakdown },
        { status: 500, headers }
      );
    }
  } catch (err: any) {
    console.error("[Checkout] Unexpected error:", err);
    return json({ error: "Internal server error: " + err.message }, { status: 500, headers });
  }
};
