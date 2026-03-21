import {
  json,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from "@remix-run/node";
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
  Badge,
  TextField,
  Modal,
  Banner,
  Box,
  InlineGrid,
  DataTable,
  Divider,
} from "@shopify/polaris";

// ─── Loader ──────────────────────────────────────────────────────────────────
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const product = await db.product.findUnique({ where: { id: params.id } });
  if (!product) throw new Response("Not found", { status: 404 });

  // Fetch Shopify variants via GraphQL
  const resp = await admin.graphql(`
    query getVariants($id: ID!) {
      product(id: $id) {
        id
        title
        variants(first: 100) {
          edges {
            node {
              id
              title
              price
              compareAtPrice
              sku
              inventoryQuantity
              availableForSale
            }
          }
        }
      }
    }
  `, { variables: { id: `gid://shopify/Product/${product.shopifyProductId}` } });

  const gql = await resp.json();
  const variants = gql.data?.product?.variants?.edges?.map((e: any) => e.node) || [];

  return json({ product, variants });
};

// ─── Action ──────────────────────────────────────────────────────────────────
export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  const product = await db.product.findUnique({ where: { id: params.id } });
  if (!product) return json({ error: "Product not found" }, { status: 404 });

  const shopifyGid = `gid://shopify/Product/${product.shopifyProductId}`;

  if (intent === "create-variant") {
    const price = String(formData.get("price") || "0");
    const compareAtPrice = String(formData.get("compareAtPrice") || "");
    const sku = String(formData.get("sku") || "");
    const title = String(formData.get("title") || "Default Title");
    const inventory = parseInt(String(formData.get("inventory") || "0"));

    const resp = await admin.graphql(`
      mutation createVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkCreate(productId: $productId, variants: $variants) {
          productVariants {
            id
            title
            price
            sku
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        productId: shopifyGid,
        variants: [{
          price,
          compareAtPrice: compareAtPrice || null,
          sku: sku || null,
          inventoryQuantities: [{
            availableQuantity: inventory,
            locationId: "gid://shopify/Location/1", // will be overridden by Shopify
          }],
          optionValues: [{ name: title, optionName: "Configuration" }],
        }],
      },
    });

    const gql = await resp.json();
    const errors = gql.data?.productVariantsBulkCreate?.userErrors || [];
    if (errors.length > 0) {
      return json({ error: errors.map((e: any) => e.message).join(", ") });
    }
    return json({ success: true, variant: gql.data?.productVariantsBulkCreate?.productVariants?.[0] });
  }

  if (intent === "delete-variant") {
    const variantId = String(formData.get("variantId"));
    const resp = await admin.graphql(`
      mutation deleteVariant($productId: ID!, $variantsIds: [ID!]!) {
        productVariantsBulkDelete(productId: $productId, variantsIds: $variantsIds) {
          userErrors { field message }
        }
      }
    `, { variables: { productId: shopifyGid, variantsIds: [variantId] } });

    const gql = await resp.json();
    const errors = gql.data?.productVariantsBulkDelete?.userErrors || [];
    if (errors.length > 0) {
      return json({ error: errors.map((e: any) => e.message).join(", ") });
    }
    return json({ success: true });
  }

  if (intent === "update-price") {
    const variantId = String(formData.get("variantId"));
    const price = String(formData.get("price"));
    const compareAtPrice = String(formData.get("compareAtPrice") || "");

    const resp = await admin.graphql(`
      mutation updateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants { id price compareAtPrice }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        productId: shopifyGid,
        variants: [{ id: variantId, price, compareAtPrice: compareAtPrice || null }],
      },
    });

    const gql = await resp.json();
    const errors = gql.data?.productVariantsBulkUpdate?.userErrors || [];
    if (errors.length > 0) {
      return json({ error: errors.map((e: any) => e.message).join(", ") });
    }
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function VariantsPage() {
  const { product, variants } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  // Create variant form
  const [addOpen, setAddOpen] = useState(false);
  const [vTitle, setVTitle] = useState("Default Title");
  const [vPrice, setVPrice] = useState("0.00");
  const [vCompare, setVCompare] = useState("");
  const [vSku, setVSku] = useState("");
  const [vInventory, setVInventory] = useState("0");

  // Edit price form
  const [editOpen, setEditOpen] = useState(false);
  const [editVariantId, setEditVariantId] = useState("");
  const [editPrice, setEditPrice] = useState("0.00");
  const [editCompare, setEditCompare] = useState("");

  const handleCreate = useCallback(() => {
    const fd = new FormData();
    fd.set("intent", "create-variant");
    fd.set("title", vTitle);
    fd.set("price", vPrice);
    fd.set("compareAtPrice", vCompare);
    fd.set("sku", vSku);
    fd.set("inventory", vInventory);
    submit(fd, { method: "post" });
    setAddOpen(false);
    setVTitle("Default Title"); setVPrice("0.00"); setVCompare(""); setVSku(""); setVInventory("0");
  }, [vTitle, vPrice, vCompare, vSku, vInventory, submit]);

  const handleUpdatePrice = useCallback(() => {
    const fd = new FormData();
    fd.set("intent", "update-price");
    fd.set("variantId", editVariantId);
    fd.set("price", editPrice);
    fd.set("compareAtPrice", editCompare);
    submit(fd, { method: "post" });
    setEditOpen(false);
  }, [editVariantId, editPrice, editCompare, submit]);

  const rows = variants.map((v: any) => [
    v.title || "Default Title",
    <Badge tone={v.availableForSale ? "success" : "warning"}>
      {v.availableForSale ? "Available" : "Unavailable"}
    </Badge>,
    `$${parseFloat(v.price).toFixed(2)}`,
    v.compareAtPrice ? `$${parseFloat(v.compareAtPrice).toFixed(2)}` : "—",
    v.sku || "—",
    v.inventoryQuantity ?? "—",
    v.id.replace("gid://shopify/ProductVariant/", ""),
    <InlineStack gap="200">
      <Button
        size="slim"
        onClick={() => {
          setEditVariantId(v.id);
          setEditPrice(v.price);
          setEditCompare(v.compareAtPrice || "");
          setEditOpen(true);
        }}
      >
        Edit Price
      </Button>
      <Button
        size="slim"
        tone="critical"
        onClick={() => {
          const fd = new FormData();
          fd.set("intent", "delete-variant");
          fd.set("variantId", v.id);
          submit(fd, { method: "post" });
        }}
      >
        Delete
      </Button>
    </InlineStack>,
  ]);

  return (
    <Page
      title={`Variants: ${product.title}`}
      subtitle="Manage Shopify product variants manually"
      backAction={{ content: "Configure Product", url: `/app/products/${product.id}` }}
      primaryAction={{ content: "Add Variant", onAction: () => setAddOpen(true) }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h3">
                  Product Variants ({variants.length})
                </Text>
                <Badge tone="info">{`Shopify Product ID: ${product.shopifyProductId}`}</Badge>
              </InlineStack>

              <Banner tone="info">
                <p>
                  The <strong>Variant ID</strong> (last column) is used in your storefront widget.
                  Copy it and paste it into <code>data-variant-id</code> in your Theme App Extension block settings.
                </p>
              </Banner>

              {variants.length === 0 ? (
                <Box padding="400">
                  <Text variant="bodyMd" as="p" tone="subdued">
                    No variants found. Click <strong>Add Variant</strong> to create one.
                  </Text>
                </Box>
              ) : (
                <DataTable
                  columnContentTypes={["text","text","text","text","text","numeric","text","text"]}
                  headings={["Title","Status","Price","Compare At","SKU","Inventory","Variant ID","Actions"]}
                  rows={rows}
                  truncate
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h3">How Variants Work</Text>
              <Divider />
              <Text variant="bodySm" as="p">
                Your configurator uses a <strong>base variant</strong> to create Draft Orders.
                The actual price is always calculated server-side by the pricing engine.
              </Text>
              <Text variant="bodySm" as="p">
                Recommended setup:
              </Text>
              <BlockStack gap="100">
                <Text variant="bodySm" as="p">• Create one variant with your <strong>base/lowest price</strong></Text>
                <Text variant="bodySm" as="p">• Set its price to match your configurator base price</Text>
                <Text variant="bodySm" as="p">• Copy its <strong>Variant ID</strong> into the Theme Extension</Text>
                <Text variant="bodySm" as="p">• The Draft Order will override the price automatically</Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      {/* ── Add Variant Modal ── */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Create New Variant"
        primaryAction={{ content: "Create Variant", onAction: handleCreate, loading: isLoading }}
        secondaryActions={[{ content: "Cancel", onAction: () => setAddOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Variant Title / Option Name"
              value={vTitle}
              onChange={setVTitle}
              placeholder="e.g. Base Config, Standard, Custom"
              autoComplete="off"
              helpText="This becomes the variant option value in Shopify"
            />
            <InlineGrid columns={2} gap="400">
              <TextField
                label="Price ($)"
                type="number"
                value={vPrice}
                onChange={setVPrice}
                autoComplete="off"
                helpText="The configurator will override this with the calculated price"
              />
              <TextField
                label="Compare At Price ($)"
                type="number"
                value={vCompare}
                onChange={setVCompare}
                autoComplete="off"
                helpText="Optional — shows strikethrough price"
              />
            </InlineGrid>
            <InlineGrid columns={2} gap="400">
              <TextField
                label="SKU"
                value={vSku}
                onChange={setVSku}
                autoComplete="off"
                placeholder="e.g. RING-BASE-001"
              />
              <TextField
                label="Initial Inventory"
                type="number"
                value={vInventory}
                onChange={setVInventory}
                autoComplete="off"
                helpText="Set to 0 or leave managed by Shopify"
              />
            </InlineGrid>
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* ── Edit Price Modal ── */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Variant Price"
        primaryAction={{ content: "Save Price", onAction: handleUpdatePrice, loading: isLoading }}
        secondaryActions={[{ content: "Cancel", onAction: () => setEditOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Price ($)"
              type="number"
              value={editPrice}
              onChange={setEditPrice}
              autoComplete="off"
            />
            <TextField
              label="Compare At Price ($)"
              type="number"
              value={editCompare}
              onChange={setEditCompare}
              autoComplete="off"
              helpText="Leave empty to remove"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
