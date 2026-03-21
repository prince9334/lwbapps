import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  TextField,
  Banner,
  Badge,
  Box,
  Divider,
  InlineGrid,
} from "@shopify/polaris";

// ─── Loader ──────────────────────────────────────────────────────────────────
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  const productCount = shop ? await db.product.count({ where: { shopId: shop.id } }) : 0;
  const optionSetCount = shop ? await db.optionSet.count({ where: { shopId: shop.id } }) : 0;
  const configCount = shop
    ? await db.configuration.count({ where: { product: { shopId: shop.id } } })
    : 0;

  return json({
    shopDomain: session.shop,
    productCount,
    optionSetCount,
    configCount,
    appUrl: process.env.SHOPIFY_APP_URL || "",
  });
};

// ─── Action ──────────────────────────────────────────────────────────────────
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save-settings") {
    // Settings are stored per-shop — for now return success
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { shopDomain, productCount, optionSetCount, configCount, appUrl } =
    useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  const [copiedWidgetId, setCopiedWidgetId] = useState(false);
  const [copiedAppHost, setCopiedAppHost] = useState(false);

  const handleCopy = (text: string, which: "widget" | "host") => {
    navigator.clipboard.writeText(text).then(() => {
      if (which === "widget") { setCopiedWidgetId(true); setTimeout(() => setCopiedWidgetId(false), 2000); }
      else { setCopiedAppHost(true); setTimeout(() => setCopiedAppHost(false), 2000); }
    });
  };

  return (
    <Page
      title="Settings"
      backAction={{ content: "Dashboard", url: "/app" }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {/* ── App Stats ── */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">App Overview</Text>
                <InlineGrid columns={3} gap="400">
                  <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                    <BlockStack gap="100" inlineAlign="center">
                      <Text variant="heading2xl" as="p" tone="success">{productCount}</Text>
                      <Text variant="bodySm" as="p" tone="subdued" alignment="center">Configured products</Text>
                    </BlockStack>
                  </Box>
                  <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                    <BlockStack gap="100" inlineAlign="center">
                      <Text variant="heading2xl" as="p" tone="magic">{optionSetCount}</Text>
                      <Text variant="bodySm" as="p" tone="subdued" alignment="center">Option sets</Text>
                    </BlockStack>
                  </Box>
                  <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                    <BlockStack gap="100" inlineAlign="center">
                      <Text variant="heading2xl" as="p">{configCount}</Text>
                      <Text variant="bodySm" as="p" tone="subdued" alignment="center">Total configurations</Text>
                    </BlockStack>
                  </Box>
                </InlineGrid>
              </BlockStack>
            </Card>

            {/* ── Theme Extension Install ── */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">Install Storefront Widget</Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  Follow these steps to display the configurator on your product pages.
                </Text>

                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="200">
                    <Text variant="bodyMd" as="p" fontWeight="semibold">Step 1 — Activate Theme App Extension</Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      Go to <strong>Online Store → Themes → Customize</strong>. On a product page, click <strong>Add block</strong> and select <strong>Product Configurator</strong>.
                    </Text>
                  </BlockStack>
                </Box>

                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="200">
                    <Text variant="bodyMd" as="p" fontWeight="semibold">Step 2 — Set App Host URL</Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      In the block settings, paste your App Host URL:
                    </Text>
                    <InlineStack gap="200">
                      <Box
                        padding="200"
                        background="bg-surface"
                        borderRadius="100"
                        minWidth="400px"
                      >
                        <Text variant="bodySm" as="p">
                          {appUrl || "https://your-app-url.trycloudflare.com"}
                        </Text>
                      </Box>
                      <Button
                        size="slim"
                        onClick={() => handleCopy(appUrl || "", "host")}
                      >
                        {copiedAppHost ? "Copied!" : "Copy"}
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Box>

                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="200">
                    <Text variant="bodyMd" as="p" fontWeight="semibold">Step 3 — Set Configurator Product ID</Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      In the block settings, paste the <strong>Product ID</strong> shown on the product configuration page (not the Shopify Product ID).
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      You can find it at: <strong>Products → [select product] → Product Settings → "Product ID for storefront widget"</strong>
                    </Text>
                  </BlockStack>
                </Box>
              </BlockStack>
            </Card>

            {/* ── Supported Option Types ── */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">Supported Option Types</Text>
                <InlineGrid columns={2} gap="300">
                  {[
                    { type: "dropdown", desc: "Select from a dropdown list" },
                    { type: "radio", desc: "Horizontal button group" },
                    { type: "checkbox", desc: "Multi-select items" },
                    { type: "text_input", desc: "Short text (e.g. engraving)" },
                    { type: "textarea", desc: "Long text / multi-line" },
                    { type: "number_input", desc: "Numeric value" },
                    { type: "file_upload", desc: "File attachment" },
                    { type: "date_picker", desc: "Date selection" },
                    { type: "color_swatch", desc: "Circle color swatches" },
                    { type: "image_swatch", desc: "Image tiles" },
                    { type: "image_select", desc: "Image grid selector" },
                    { type: "range_slider", desc: "Slider with min/max" },
                  ].map(({ type, desc }) => (
                    <Box key={type} padding="200" background="bg-surface-secondary" borderRadius="100">
                      <InlineStack gap="200">
                        <Badge>{type}</Badge>
                        <Text variant="bodySm" as="span" tone="subdued">{desc}</Text>
                      </InlineStack>
                    </Box>
                  ))}
                </InlineGrid>
              </BlockStack>
            </Card>

            {/* ── Pricing Engine ── */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">Pricing Engine</Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  The price shown in the storefront is <strong>always recalculated server-side</strong> before checkout — it cannot be manipulated by the customer.
                </Text>
                <BlockStack gap="200">
                  <Text variant="bodyMd" as="p" fontWeight="semibold">Price calculation formula:</Text>
                  <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                    <Text variant="bodySm" as="p">
                      <code>final_price = base_price + option_modifiers + rule_modifiers + formula_results</code>
                    </Text>
                  </Box>
                </BlockStack>
                <BlockStack gap="200">
                  <Text variant="bodyMd" as="p" fontWeight="semibold">Formula variables available:</Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Any selection value becomes a variable. Example: if an option is named "Engraving Length",
                    it becomes <code>engraving_length</code> in formulas.
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* ── Shop Info ── */}
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">Shop Information</Text>
                <InlineGrid columns={2} gap="300">
                  <Text variant="bodySm" as="p" tone="subdued">Shop domain</Text>
                  <Text variant="bodyMd" as="p">{shopDomain}</Text>
                </InlineGrid>
                <Divider />
                <Banner tone="info">
                  <p>
                    This app bypasses Shopify's 3-option and 100-variant limits by storing configurations as <strong>line item properties</strong> on Draft Orders.
                  </p>
                </Banner>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">Quick Links</Text>
                <Button variant="plain" url="/app/option-sets">→ Option Sets</Button>
                <Button variant="plain" url="/app/products">→ Product Configurations</Button>
                <Button
                  variant="plain"
                  url={`https://${shopDomain}/admin/themes`}
                  target="_blank"
                >
                  → Shopify Theme Editor ↗
                </Button>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">Cart Integration</Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  Options are stored as <strong>Line Item Properties</strong> in Orders.
                </Text>
                <Box padding="200" background="bg-surface-secondary" borderRadius="100">
                  <BlockStack gap="100">
                    <Text variant="bodySm" as="p" tone="subdued">Example order properties:</Text>
                    <Text variant="bodySm" as="p"><code>Material: Platinum</code></Text>
                    <Text variant="bodySm" as="p"><code>Size: 10</code></Text>
                    <Text variant="bodySm" as="p"><code>Engraving: Forever</code></Text>
                    <Text variant="bodySm" as="p"><code>Custom Price: $1490</code></Text>
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
