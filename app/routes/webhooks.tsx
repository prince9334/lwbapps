import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`[Webhook] ${topic} received from ${shop}`);

  switch (topic) {
    case "APP_UNINSTALLED": {
      const shopRecord = await db.shop.findUnique({ where: { shopDomain: shop } });
      if (shopRecord) {
        // Clean up all product configurations for this shop on uninstall
        await db.product.deleteMany({ where: { shopId: shopRecord.id } });
        await db.shop.delete({ where: { id: shopRecord.id } });
      }
      break;
    }

    case "PRODUCTS_UPDATE": {
      // Sync product title if it changed in Shopify
      const shopifyProductId = String(payload.id);
      const shopRecord = await db.shop.findUnique({ where: { shopDomain: shop } });
      if (shopRecord) {
        await db.product.updateMany({
          where: { shopId: shopRecord.id, shopifyProductId },
          data: { title: payload.title || "Updated Product" },
        });
      }
      break;
    }

    case "ORDERS_CREATE": {
      // Log order creation for analytics
      console.log(`[Webhook] New order from ${shop}: ${payload.id}`);
      // Future: link configuration snapshots to orders via order name
      break;
    }

    default:
      console.log(`[Webhook] Unhandled topic: ${topic}`);
  }

  return json({ ok: true });
};
