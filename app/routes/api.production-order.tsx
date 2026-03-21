import { json, type ActionFunctionArgs } from "@remix-run/node";

/**
 * Production Order API (Simulated)
 * ───────────────────────────────
 * Receives full configuration data to initiate manufacturing.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json();
  const { order_id, sku, material, his_size, her_size, width, stone, stone_weight, finish, engraving } = body;

  console.log(`[Production Order] Received for SKU: ${sku}`);
  console.log(`[Production Order] Specs: Material: ${material}, Sizes: H${his_size}/W${her_size}, Width: ${width}, Stone: ${stone} (${stone_weight}ct)`);
  console.log(`[Production Order] Engraving: "${engraving}", Finish: ${finish}`);

  // In a real system, this would insert into a production database or send to a 3rd party factory ERP.
  
  return json({ 
    success: true, 
    message: "Production order created", 
    production_order_id: `PO-${Math.floor(Math.random() * 100000)}`
  });
};
