import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });

  if (!shop) {
    return json({ products: [] });
  }

  const products = await db.product.findMany({
    where: { shopId: shop.id },
    include: {
      attributes: {
        include: { values: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
      pricingRules: true,
      _count: { select: { configurations: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return json({ products });
};
