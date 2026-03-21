import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { createSampleJewelryProduct } from "../lib/sampleProductGenerator.server";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineGrid,
  Badge,
  Button,
  EmptyState,
  Box,
  Banner,
  InlineStack,
  Divider,
  Thumbnail,
} from "@shopify/polaris";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  let shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) {
    shop = await db.shop.create({
      data: { shopDomain: session.shop, accessToken: session.accessToken! },
    });
  } else if (shop.accessToken !== session.accessToken) {
    shop = await db.shop.update({
      where: { id: shop.id },
      data: { accessToken: session.accessToken },
    });
  }

  const productCount = await db.product.count({ where: { shopId: shop.id } });
  const configCount = await db.configuration.count({
    where: { product: { shopId: shop.id } },
  });
  const recentConfigs = await db.configuration.findMany({
    where: { product: { shopId: shop.id } },
    include: { product: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return json({ shop, productCount, configCount, recentConfigs });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create-sample") {
    const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
    if (!shop) throw new Error("Shop not found");
    try {
      const product = await createSampleJewelryProduct(admin, shop.id);
      return json({ success: true, productId: product.id, productTitle: product.title });
    } catch (e: any) {
      return json({ error: e.message }, { status: 500 });
    }
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

function OptionRow({ label, type, values, required }: { label: string; type: string; values?: string[]; required?: boolean; }) {
  const typeColors: Record<string, "info" | "success" | "warning" | "attention"> = {
    color_swatch: "attention", radio: "info", dropdown: "success", image_swatch: "warning", input: "info",
  };
  return (
    <Box padding="200" background="bg-surface-secondary" borderRadius="200">
      <InlineStack gap="200" align="space-between" blockAlign="center" wrap={false}>
        <InlineStack gap="200" blockAlign="center">
          <Badge tone={typeColors[type] ?? "info"}>{type.replace("_", " ")}</Badge>
          <Text variant="bodyMd" as="span" fontWeight="semibold">{label}</Text>
          {required && <Badge tone="critical" size="small">required</Badge>}
        </InlineStack>
        {values && (
          <InlineStack gap="100">
            {values.map((v) => <Badge key={v}>{v}</Badge>)}
          </InlineStack>
        )}
      </InlineStack>
    </Box>
  );
}

export default function Index() {
  const { productCount, configCount, recentConfigs } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const actionData = useActionData<typeof action>();

  const isCreatingSample = navigation.state !== "idle" && navigation.formData?.get("intent") === "create-sample";
  const justCreated = actionData && "success" in actionData && actionData.success;

  return (
    <Page title="Product Configurator">
      <BlockStack gap="500">
        {/* Stats row */}
        <InlineGrid columns={3} gap="400">
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h3">Configured Products</Text>
              <Text variant="heading2xl" as="p" tone="success">{productCount}</Text>
              <Text variant="bodySm" as="p" tone="subdued">Products with custom configurators</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h3">Total Configurations</Text>
              <Text variant="heading2xl" as="p" tone="magic">{configCount}</Text>
              <Text variant="bodySm" as="p" tone="subdued">Customer configuration sessions</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h3">Quick Actions</Text>
              <BlockStack gap="200">
                <Link to="/app/products">
                  <Button variant="primary" fullWidth>Manage Products</Button>
                </Link>
              </BlockStack>
            </BlockStack>
          </Card>
        </InlineGrid>

        {/* Demo product generator */}
        <Card>
          <BlockStack gap="400">
            <InlineStack gap="300" align="space-between" blockAlign="start">
              <BlockStack gap="100">
                <Text variant="headingLg" as="h2">🎯 Generate Demo Product</Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  Creates a fully configured <strong>0.10 Carat 4mm Matching Heart His &amp; Hers Diamond Wedding Band Set</strong> in your Shopify catalog — pre-loaded with all 8 option fields, values, and a live pricing formula.
                </Text>
              </BlockStack>
              <Thumbnail
                source="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                alt="Wedding band demo"
                size="large"
              />
            </InlineStack>

            <Divider />

            <Text variant="headingMd" as="h3">Options that will be created:</Text>
            <BlockStack gap="200">
              <OptionRow label="Color" type="color_swatch" values={["White", "Yellow", "Rose"]} required />
              <OptionRow label="Material" type="radio" values={["10K", "14K (+$200)", "18K (+$450)", "550 Platinum (+$900)"]} required />
              <OptionRow label="Stone" type="image_swatch" values={["Diamond"]} />
              <OptionRow label="Finishing" type="image_swatch" values={["Matte", "Satin", "Polish", "Hammered", "Milgrain"]} />
              <OptionRow label="His Size" type="dropdown" values={["8", "8.5", "…", "13"]} required />
              <OptionRow label="His Engraving (40 chars, $10/char)" type="input" />
              <OptionRow label="Her Size" type="dropdown" values={["4", "4.5", "…", "9"]} required />
              <OptionRow label="Her Engraving (40 chars, $10/char)" type="input" />
            </BlockStack>

            <Divider />

            <Box padding="300" background="bg-surface-secondary" borderRadius="200">
              <BlockStack gap="200">
                <Text variant="headingMd" as="h3">Pricing</Text>
                <InlineGrid columns={4} gap="300">
                  {[
                    { label: "Base Price", value: "$1,345" },
                    { label: "+14K upgrade", value: "+$200" },
                    { label: "+18K upgrade", value: "+$450" },
                    { label: "+Platinum", value: "+$900" },
                  ].map(({ label, value }) => (
                    <Box key={label} padding="200" background="bg-surface" borderRadius="100">
                      <BlockStack gap="100" inlineAlign="center">
                        <Text variant="headingMd" as="p" tone="success">{value}</Text>
                        <Text variant="bodySm" as="p" tone="subdued" alignment="center">{label}</Text>
                      </BlockStack>
                    </Box>
                  ))}
                </InlineGrid>
              </BlockStack>
            </Box>

            {justCreated && (
              <Banner tone="success">
                <p>✅ Demo product created! <strong>{"productTitle" in actionData ? actionData.productTitle : ""}</strong> is now in your catalog. <Link to="/app/products">→ View it in Products</Link></p>
              </Banner>
            )}
            {actionData && "error" in actionData && (
              <Banner tone="critical"><p>Error: {actionData.error}</p></Banner>
            )}

            <InlineStack gap="300">
              <Button variant="primary" size="large" loading={isCreatingSample}
                onClick={() => { const fd = new FormData(); fd.set("intent", "create-sample"); submit(fd, { method: "post" }); }}>
                {isCreatingSample ? "Creating demo product…" : "✨ Generate Wedding Band Demo"}
              </Button>
              <Button variant="plain" url="https://www.loveweddingbands.com/0-10-carat-4mm-matching-heart-his-and-hers-diamond-wedding-band-set" target="_blank">
                View reference product ↗
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        {/* Recent configurations */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">Recent Configurations</Text>
                {recentConfigs.length === 0 ? (
                  <EmptyState heading="No configurations yet" image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png">
                    <p>Generate the demo product above, then open it in your storefront to create your first customer configuration.</p>
                  </EmptyState>
                ) : (
                  <BlockStack gap="300">
                    {recentConfigs.map((config: any) => (
                      <Box key={config.id} padding="300" background="bg-surface-secondary" borderRadius="200">
                        <InlineGrid columns={3} gap="400">
                          <Text variant="bodyMd" as="p" fontWeight="semibold">{config.product.title}</Text>
                          <Badge tone="success">{`$${config.price.toFixed(2)}`}</Badge>
                          <Text variant="bodySm" as="p" tone="subdued">{new Date(config.createdAt).toLocaleDateString()}</Text>
                        </InlineGrid>
                      </Box>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">Getting Started</Text>
                <BlockStack gap="200">
                  <Text variant="bodySm" as="p">1. Click <strong>Generate Wedding Band Demo</strong> above</Text>
                  <Text variant="bodySm" as="p">2. Go to <strong>Products</strong> to see the new product</Text>
                  <Text variant="bodySm" as="p">3. Install the <strong>Theme Extension</strong> in Customize</Text>
                  <Text variant="bodySm" as="p">4. Open the product on your storefront</Text>
                  <Text variant="bodySm" as="p">5. Watch the configurator calculate prices live ✨</Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
