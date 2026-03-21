import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Sync Shopify product title changes to our DB
  if (payload && payload.id && payload.title) {
    const shopRecord = await db.shop.findUnique({ where: { shopDomain: shop } });
    if (shopRecord) {
      await db.product.updateMany({
        where: {
          shopId: shopRecord.id,
          shopifyProductId: String(payload.id),
        },
        data: { title: String(payload.title) },
      });
    }
  }

  return new Response();
};
