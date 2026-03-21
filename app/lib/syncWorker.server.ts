import fs from "node:fs";
import path from "node:path";
import db from "../db.server";
import shopify from "../shopify.server";

export async function startMagentoImport(shopId: string, shopDomain: string) {
  console.log(`[Sync] startMagentoImport called for ${shopDomain}`);
  
  const filePath = path.join(process.cwd(), "his_hers_products.json");
  if (!fs.existsSync(filePath)) {
    console.error(`[Sync] ERROR: ${filePath} not found`);
    return;
  }

  // Create Job record first
  let job: any;
  try {
    job = await db.job.create({
      data: {
        shopId,
        type: "magento-import",
        status: "processing",
        totalItems: 0, 
      }
    });
    console.log(`[Sync] Created Job record: ${job.id}`);
  } catch (e) {
    console.error("[Sync] Failed to create Job record:", e);
    return;
  }

  // Use a simple streaming approach: read chunks and search for JSON objects
  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  let buffer = "";
  let processedCount = 0;
  let errorCount = 0;

  try {
    const { admin } = await shopify.unauthenticated.admin(shopDomain);
    if (!admin) throw new Error("Could not get admin client");

    for await (const chunk of stream) {
      buffer += chunk;
      
      let startIndex = buffer.indexOf("{");
      while (startIndex !== -1) {
        let braceCount = 0;
        let endIndex = -1;
        let inString = false;
        
        for (let i = startIndex; i < buffer.length; i++) {
          const char = buffer[i];
          if (char === '"' && buffer[i-1] !== '\\') inString = !inString;
          if (!inString) {
            if (char === "{") braceCount++;
            if (char === "}") braceCount--;
            if (braceCount === 0) {
              endIndex = i;
              break;
            }
          }
        }

        if (endIndex !== -1) {
          const productJson = buffer.slice(startIndex, endIndex + 1);
          let product: any = null;
          try {
            product = JSON.parse(productJson);
            
            if (product.type_id === "configurable") {
              console.log(`[Sync] Found Configurable: ${product.sku}. Syncing...`);
              await processProductSync(product, shopId, shopDomain, admin);
              processedCount++;
              
              await db.job.update({
                where: { id: job.id },
                data: { processed: processedCount, errors: errorCount }
              });

              // Throttle only when we did actual API work
              await new Promise(r => setTimeout(r, 1000)); 
            } else {
              // Optional: log simple skip every 100 items to avoid log bloat
              if (errorCount % 100 === 0) console.log(`[Sync] Skipping variant ${product.sku}...`);
            }

          } catch (err: any) {
            console.error(`[Sync] Error processing element: ${err.message}`);
            errorCount++;
            
            // Log error to database for visibility
            await db.log.create({
              data: {
                shopId,
                message: `Sync Error for ${product?.sku || 'unknown'}: ${err.message}`,
                level: "error"
              }
            }).catch(() => {}); // Ignore logging failures
          }
          
          buffer = buffer.slice(endIndex + 1);
          startIndex = buffer.indexOf("{");
        } else {
          break;
        }
      }
    }

    // Final update on success
    await db.job.update({
      where: { id: job.id },
      data: { 
        status: "completed", 
        processed: processedCount, 
        errors: errorCount,
        message: `Completed sync. Processed ${processedCount} products.` 
      }
    });

  } catch (outerError: any) {
    console.error("[Sync] Critical worker error:", outerError);
    if (job) {
      await db.job.update({
        where: { id: job.id },
        data: { status: "failed", message: outerError.message }
      });
    }
  }
}

async function processProductSync(p: any, shopId: string, shopDomain: string, admin: any) {
  // Only process configurable products; simple products are mapped via variants in DPO
  if (p.type_id !== "configurable") return;

  const handle = (p.url_key || p.sku).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  
  // 1. Resolve Shopify Product (Try Handle First, then SKU)
  let response = await admin.graphql(`
    query getProductByHandle($handle: String!) {
      productByHandle(handle: $handle) { id title }
    }
  `, { variables: { handle } });

  let { data: gqlData } = await response.json() as any;
  let shopifyProduct = gqlData?.productByHandle;

  if (!shopifyProduct && p.sku) {
    console.log(`[Sync] Handle ${handle} failed, trying SKU lookup for ${p.sku}`);
    // Shopify SKU search can be tricky; query: "sku:11_1000" might need quotes or different format
    response = await admin.graphql(`
      query getProductBySku($query: String!) {
        products(first: 3, query: $query) {
          nodes { id title handle }
        }
      }
    `, { variables: { query: `sku:${p.sku}` } });
    
    gqlData = (await response.json() as any).data;
    // Prefer the one that matches SKU exactly in handle or title if many
    shopifyProduct = gqlData?.products?.nodes?.[0];
  }

  if (!shopifyProduct) {
    console.log(`[Sync] Product ${p.sku} not found. Creating in Shopify...`);
    
    // 2. Create Product in Shopify
    const createResponse = await admin.graphql(`
      mutation productCreate($input: ProductInput!) {
        productCreate(input: $input) {
          product { id title handle }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        input: {
          title: p.name || `Magento Product ${p.sku}`,
          handle: handle,
          vendor: "Magento Migration",
          status: "DRAFT" // Start as draft for safety
        }
      }
    });

    const createData = (await createResponse.json() as any).data;
    if (createData?.productCreate?.userErrors?.length > 0) {
      console.error(`[Sync] Shopify Create Error for ${p.sku}:`, createData.productCreate.userErrors);
      throw new Error(`Shopify Create Failed: ${createData.productCreate.userErrors[0].message}`);
    }
    
    shopifyProduct = createData?.productCreate?.product;
    console.log(`[Sync] Created product ${shopifyProduct.id} in Shopify`);
  }

  const shopifyProductId = shopifyProduct.id.replace("gid://shopify/Product/", "");
  
  // 2. Upsert Product in DPO DB
  const product = await db.product.upsert({
    where: { shopId_shopifyProductId: { shopId, shopifyProductId } },
    update: { title: p.name || shopifyProduct.title, basePrice: parseFloat(p.price || "0") },
    create: { shopId, shopifyProductId, title: p.name || shopifyProduct.title, basePrice: parseFloat(p.price || "0"), status: "active" }
  });

  // 3. Clear existing configurations (DPO specific)
  await db.section.deleteMany({ where: { productId: product.id } });

  // 4. Create "Custom Options" section
  const section = await db.section.create({
    data: { productId: product.id, label: "Custom Configuration", sortOrder: 0 }
  });

  // 5. Map attributes from variants and parent (Magento Configurable mapping)
  const attrMap: Record<string, Set<string>> = {};

  // Helper to add attribute to map
  const addAttr = (attrKey: string, attr: any) => {
    const label = attr.label || attrKey;
    const value = String(attr.value);
    if (value === "0" || !value || value === "null") return; // Skip dummy/zero values
    if (!attrMap[label]) attrMap[label] = new Set();
    attrMap[label].add(value);
  };

  // Add parent attributes
  if (p.attributes) {
    Object.entries(p.attributes).forEach(([key, attr]) => addAttr(key, attr));
  }

  // Add variant attributes
  if (p.variants && p.variants.length > 0) {
    p.variants.forEach((v: any) => {
      if (v.attributes) {
        Object.entries(v.attributes).forEach(([key, attr]: [string, any]) => addAttr(key, attr));
      }
    });
  }

  let sortOrder = 0;
  for (const [label, values] of Object.entries(attrMap)) {
    // Filter out internal Magento attributes if needed, but for now we take all
    if (label.includes("harbour_") || label === "url_path" || label === "meta_title") continue;

    const field = await db.field.create({
      data: {
        sectionId: section.id,
        title: label,
        type: values.size > 5 ? "dropdown" : "radio",
        fieldCode: label.toUpperCase().replace(/\s+/g, "_").slice(0, 10),
        sortOrder: sortOrder++
      }
    });

    for (const val of Array.from(values)) {
      await db.fieldValue.create({
        data: {
          fieldId: field.id,
          label: val,
          value: val,
          priceModifier: 0,
          sortOrder: 0
        }
      });
    }
  }
}
