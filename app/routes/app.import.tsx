
import {
  json,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from "@remix-run/node";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
import {
  Page,
  Card,
  BlockStack,
  Text,
  Button,
  Banner,
  Layout,
  Box,
  InlineStack,
  Divider,
  ProgressBar,
  Badge,
} from "@shopify/polaris";
import shopify from "../shopify.server";
import db from "../db.server";
import { startMagentoImport } from "../lib/syncWorker.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await shopify.authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return json({ jobs: [] });

  const jobs = await db.job.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: "desc" },
    take: 5
  });

  return json({ jobs });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await shopify.authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  let shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Error("Shop not found");

  if (intent === "import") {
    const csvData = formData.get("csvData") as string;
    if (!csvData) return json({ error: "No CSV data provided" }, { status: 400 });

    const rows = csvData.split("\n").map(line => line.split(","));
    const headers = rows[0].map(h => h.trim().toLowerCase());
    const dataRows = rows.slice(1).filter(r => r.length > 1);

    let importedCount = 0;
    let skippedCount = 0;

    for (const row of dataRows) {
      try {
        const rowData: any = {};
        headers.forEach((h, i) => { rowData[h] = row[i]?.trim(); });

        const handle = rowData.handle;
        if (!handle) { skippedCount++; continue; }

        const response = await admin.graphql(`
          query getProductByHandle($handle: String!) {
            productByHandle(handle: $handle) { id title }
          }
        `, { variables: { handle } });

        const { data: gqlData } = await response.json() as any;
        const shopifyProduct = gqlData?.productByHandle;
        if (!shopifyProduct) { skippedCount++; continue; }

        const shopifyProductId = shopifyProduct.id.replace("gid://shopify/Product/", "");
        const dpoProduct = await db.product.upsert({
          where: { shopId_shopifyProductId: { shopId: shop.id, shopifyProductId } },
          update: { title: rowData.product_title || shopifyProduct.title, basePrice: parseFloat(rowData.base_price || "0") },
          create: { shopId: shop.id, shopifyProductId, title: rowData.product_title || shopifyProduct.title, basePrice: parseFloat(rowData.base_price || "0"), status: "active" }
        });

        if (rowData.section_label) {
          const section = await db.section.upsert({
            where: { id: `s_${dpoProduct.id}_${rowData.section_label}` },
            update: { label: rowData.section_label },
            create: { productId: dpoProduct.id, label: rowData.section_label }
          });

          if (rowData.field_title) {
            const field = await db.field.create({
              data: {
                sectionId: section.id,
                title: rowData.field_title,
                type: rowData.field_type || "dropdown",
                required: rowData.field_required === "true",
              }
            });

            if (row[headers.indexOf("option_label")]) {
              await db.fieldValue.create({
                data: {
                  fieldId: field.id,
                  label: rowData.option_label,
                  value: rowData.option_value || rowData.option_label,
                  priceModifier: parseFloat(rowData.price_modifier || "0"),
                  imageUrl: rowData.option_image_url,
                  colorHex: rowData.option_color_hex
                }
              });
            }
          }
        }
        importedCount++;
      } catch (err) { skippedCount++; }
    }
    return json({ success: true, importedCount, skippedCount });
  }

  if (intent === "sync-local-json") {
    console.log(`[ImportAction] Triggering startMagentoImport for shop ${shop.id}`);
    startMagentoImport(shop.id, session.shop)
      .then(() => console.log(`[ImportAction] Worker completed for ${session.shop}`))
      .catch(e => console.error(`[ImportAction] Worker CRASHED for ${session.shop}:`, e));

    return json({ success: true, message: "Sync started in background. Refresh or wait to see progress." });
  }

  return json({ error: `Unknown intent: ${intent}` }, { status: 400 });
};

export default function ImportPage() {
  const { jobs } = useLoaderData<typeof loader>() as any;
  const actionData = useActionData<typeof action>() as any;
  const navigation = useNavigation();
  const submit = useSubmit();
  const [csvText, setCsvText] = useState("");

  const isLoading = navigation.state !== "idle";

  const hasActiveJob = jobs?.some((j: any) => j.status === "processing" || j.status === "pending");
  useEffect(() => {
    if (hasActiveJob) {
      const timer = setTimeout(() => { submit({}, { method: "get" }); }, 3000);
      return () => clearTimeout(timer);
    }
  }, [hasActiveJob, submit]);

  const handleImport = () => {
    if (!csvText) return;
    const fd = new FormData();
    fd.set("intent", "import");
    fd.set("csvData", csvText);
    submit(fd, { method: "post" });
  };

  const handleSyncLocal = () => {
    const fd = new FormData();
    fd.set("intent", "sync-local-json");
    submit(fd, { method: "post" });
  };

  const downloadSample = () => {
    const csvContent = "handle,product_title,base_price,section_label,field_title,field_type,field_required,option_label,option_value,price_modifier,option_image_url,option_color_hex\n" +
      "gift-card,Sample Jewelry Product,1345,Ring Customization,Metal Color,color_swatch,true,White Gold,white,#E8E8E8,0,,\n" +
      "gift-card,Sample Jewelry Product,1345,Ring Customization,Metal Color,color_swatch,true,Yellow Gold,yellow,#D4AF37,50,,\n" +
      "gift-card,Sample Jewelry Product,1345,Ring Customization,Metal Color,color_swatch,true,Rose Gold,rose,#B76E79,50,,\n" +
      "gift-card,Sample Jewelry Product,1345,Ring Customization,Material,radio,true,10K,10k,,0,,\n" +
      "gift-card,Sample Jewelry Product,1345,Ring Customization,Material,radio,true,14K,14k,,200,,\n" +
      "gift-card,Sample Jewelry Product,1345,Ring Customization,Stone,image_swatch,false,Diamond,diamond,,0,https://cdn.shopify.com/s/files/1/0262/4071/2726/files/diamond-icon.png,";
    
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "configurator_import_sample.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Page title="Magento Product Migration" backAction={{ content: "Products", url: "/app/products" }}>
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {actionData?.success && (
              <Banner tone="success">
                {actionData.message || `Successfully imported ${actionData.importedCount} products.`}
              </Banner>
            )}
            {actionData?.error && (
              <Banner tone="critical">{actionData.error}</Banner>
            )}

            {jobs && jobs.length > 0 && (
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Background Jobs</Text>
                  {jobs.map((job: any) => (
                    <Box key={job.id} padding="200" borderStyle="solid" borderColor="border" borderRadius="200">
                      <BlockStack gap="200">
                        <InlineStack align="space-between">
                          <Text as="span" variant="bodyMd" fontWeight="bold">Sync job #{job.id.slice(-4)}</Text>
                          <Badge tone={job.status === "completed" ? "success" : job.status === "processing" ? "info" : "attention"}>
                            {job.status.toUpperCase()}
                          </Badge>
                        </InlineStack>
                        <Text as="p" tone="subdued">
                          Processed {job.processed} items. Errors: {job.errors}
                        </Text>
                        {job.status === "processing" && (
                          <ProgressBar progress={50} size="small" />
                        )}
                        {job.message && <Text as="p" variant="bodySm">{job.message}</Text>}
                      </BlockStack>
                    </Box>
                  ))}
                </BlockStack>
              </Card>
            )}

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Import Products & Options</Text>
                <Text as="p" tone="subdued">
                  Upload your Magento export CSV to automatically create product options and sections. 
                  Make sure the 'handle' column matches your Shopify product handles.
                </Text>
                
                <textarea
                  style={{ width: "100%", height: "200px", fontFamily: "monospace", padding: "12px", border: "1px solid #ddd", borderRadius: "4px" }}
                  placeholder="Paste CSV content here..."
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                />

                <InlineStack gap="300" align="end">
                  <Button onClick={downloadSample}>Download Sample CSV</Button>
                  <Button variant="primary" loading={isLoading} onClick={handleImport}>Start Sync / Import</Button>
                </InlineStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Bulk Sync from Local JSON (Magento)</Text>
                <Text as="p" tone="subdued">
                  If you have the large <code>his_hers_products.json</code> file in your app root directory, use this button to perform a full system sync. 
                  This will automatically map Magento variants (Color, Metal, etc.) to configurator fields.
                </Text>
                <InlineStack align="end">
                  <Button variant="primary" loading={isLoading} onClick={handleSyncLocal}>Sync from his_hers_products.json</Button>
                </InlineStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">Migration Instructions</Text>
                <Divider />
                <Box padding="200">
                  <BlockStack gap="200">
                    <Text as="p">1. Export your Magento products into the CSV format shown in the sample.</Text>
                    <Text as="p">2. The <strong>handle</strong> column must exactly match the handle of the product in Shopify.</Text>
                    <Text as="p">3. The <strong>field_type</strong> can be: dropdown, radio, checkbox, color_swatch, image_swatch, input, textarea, number, date.</Text>
                    <Text as="p">4. Multiple rows with the same handle and field_title will be grouped into one field with multiple options.</Text>
                  </BlockStack>
                </Box>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
