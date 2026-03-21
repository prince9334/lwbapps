import {
  json,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  redirect,
} from "@remix-run/node";
import {
  useLoaderData,
  useSubmit,
  useNavigation,
  useSearchParams,
} from "@remix-run/react";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  Page,
  Card,
  IndexTable,
  useIndexResourceState,
  Text,
  Badge,
  Button,
  InlineStack,
  BlockStack,
  Select,
  TextField,
  Thumbnail,
  Pagination,
  Box,
  Divider,
  Banner,
} from "@shopify/polaris";

// ─── Loader ───────────────────────────────────────────────────────────────────
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("q") || "";
  const cursor = url.searchParams.get("cursor") || null;
  const perPage = parseInt(url.searchParams.get("perPage") || "10");

  const response = await admin.graphql(`
    query GetProducts($first: Int!, $query: String, $after: String) {
      products(first: $first, query: $query, after: $after) {
        edges {
          cursor
          node {
            id title vendor status totalInventory
            featuredImage { url altText }
            variants(first: 1) { edges { node { sku price } } }
            collections(first: 1) { edges { node { title } } }
            variantsCount { count }
          }
        }
        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
      }
    }
  `, { variables: { first: perPage, query: searchQuery || undefined, after: cursor || undefined } });

  const { data } = await response.json();
  const products = (data?.products?.edges || []).map((e: any) => ({
    ...e.node,
    cursor: e.cursor,
    numericId: e.node.id.replace("gid://shopify/Product/", ""),
    sku: e.node.variants?.edges?.[0]?.node?.sku || "",
    price: e.node.variants?.edges?.[0]?.node?.price || "",
    collection: e.node.collections?.edges?.[0]?.node?.title || "",
  }));
  const pageInfo = data?.products?.pageInfo || {};

  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  const configuredMap: Record<string, string> = {};
  if (shop) {
    const dbProds = await db.product.findMany({ where: { shopId: shop.id }, select: { shopifyProductId: true, id: true } });
    dbProds.forEach((p) => { configuredMap[p.shopifyProductId] = p.id; });
  }

  return json({ products, pageInfo, searchQuery, configuredMap, perPage });
};

// ─── Action ───────────────────────────────────────────────────────────────────
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "configure") {
    let shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
    if (!shop) shop = await db.shop.create({ data: { shopDomain: session.shop, accessToken: session.accessToken! } });
    const shopifyProductId = String(formData.get("shopifyProductId"));
    const title = String(formData.get("title") || "Product");
    let product = await db.product.findUnique({ where: { shopId_shopifyProductId: { shopId: shop.id, shopifyProductId } } });
    if (!product) product = await db.product.create({ data: { shopId: shop.id, shopifyProductId, title, basePrice: 0, engravingRate: 5, status: "active" } });
    return redirect(`/app/products/${product.id}`);
  }

  if (intent === "bulk-delete") {
    const ids = JSON.parse(String(formData.get("ids") || "[]")) as string[];
    const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
    if (shop) await db.product.deleteMany({ where: { shopId: shop.id, shopifyProductId: { in: ids } } });
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function ProductOptionsPage() {
  const { products, pageInfo, searchQuery, configuredMap, perPage } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [massAction, setMassAction] = useState("");
  const [filterProduct, setFilterProduct] = useState(searchQuery);
  const [filterSku, setFilterSku] = useState("");
  const [filterVendor, setFilterVendor] = useState("");
  const [filterHasOptions, setFilterHasOptions] = useState("");
  const [itemsPerPage, setItemsPerPage] = useState(String(perPage));

  const allIds = (products as any[]).map((p: any) => ({ id: p.numericId }));
  const { selectedResources, allResourcesSelected, handleSelectionChange } = useIndexResourceState(allIds);

  const isLoading = navigation.state !== "idle";

  const handleConfigure = useCallback((shopifyProductId: string, title: string) => {
    const fd = new FormData();
    fd.set("intent", "configure");
    fd.set("shopifyProductId", shopifyProductId);
    fd.set("title", title);
    submit(fd, { method: "post" });
  }, [submit]);

  const handleApplyFilter = () => {
    const params = new URLSearchParams();
    if (filterProduct) params.set("q", filterProduct);
    if (itemsPerPage !== "10") params.set("perPage", itemsPerPage);
    setSearchParams(params);
  };

  const handleResetFilter = () => {
    setFilterProduct(""); setFilterSku(""); setFilterVendor(""); setFilterHasOptions(""); setItemsPerPage("10");
    setSearchParams(new URLSearchParams());
  };

  const handleMassAction = () => {
    if (!massAction || selectedResources.length === 0) return;
    if (massAction === "delete" && confirm(`Remove options for ${selectedResources.length} product(s)?`)) {
      const fd = new FormData();
      fd.set("intent", "bulk-delete");
      fd.set("ids", JSON.stringify(selectedResources));
      submit(fd, { method: "post" });
    }
    setMassAction("");
  };

  const filteredProducts = (products as any[]).filter((p: any) => {
    if (filterSku && !p.sku?.toLowerCase().includes(filterSku.toLowerCase())) return false;
    if (filterVendor && !p.vendor?.toLowerCase().includes(filterVendor.toLowerCase())) return false;
    if (filterHasOptions === "yes" && !configuredMap[p.numericId]) return false;
    if (filterHasOptions === "no" && configuredMap[p.numericId]) return false;
    return true;
  });

  const resourceName = { singular: "product", plural: "products" };

  return (
    <Page title="Product Options">
      <BlockStack gap="400">
        {/* Test mode banner */}
        <Banner tone="success">
          <p>You are running the App in the TEST mode for free. No real charges. Thank you for reviewing and recommending our app!</p>
        </Banner>

        <Card padding="0">
          {/* Toolbar */}
          <Box padding="300" borderBlockEndWidth="025" borderColor="border">
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="200" blockAlign="center">
                <div style={{ minWidth: "160px" }}>
                  <Select
                    label=""
                    labelHidden
                    options={[
                      { label: "Mass Actions", value: "" },
                      { label: "Remove Options", value: "delete" },
                    ]}
                    value={massAction}
                    onChange={setMassAction}
                  />
                </div>
                <Button
                  disabled={selectedResources.length === 0}
                  onClick={handleMassAction}
                >
                  Apply
                </Button>
              </InlineStack>

              <InlineStack gap="200">
                <Button onClick={handleResetFilter}>Reset Filter</Button>
                <Button variant="primary" onClick={handleApplyFilter}>Apply Filter</Button>
              </InlineStack>
            </InlineStack>
          </Box>

          {/* Filter row */}
          <Box padding="200" borderBlockEndWidth="025" borderColor="border" background="bg-surface-secondary">
            <div style={{ display: "grid", gridTemplateColumns: "40px 48px 1fr 120px 100px 140px 140px 100px 130px", gap: "8px", alignItems: "end" }}>
              <div />
              <div />
              <TextField label="Product" labelHidden value={filterProduct} onChange={setFilterProduct} autoComplete="off" />
              <TextField label="SKU" labelHidden value={filterSku} onChange={setFilterSku} autoComplete="off" />
              <div />
              <TextField label="Vendor" labelHidden value={filterVendor} onChange={setFilterVendor} autoComplete="off" />
              <div />
              <Select
                label="Has Options"
                labelHidden
                options={[{ label: "All", value: "" }, { label: "Yes", value: "yes" }, { label: "No", value: "no" }]}
                value={filterHasOptions}
                onChange={setFilterHasOptions}
              />
              <div />
            </div>
          </Box>

          {/* Product table */}
          <IndexTable
            resourceName={resourceName}
            itemCount={filteredProducts.length}
            selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
            onSelectionChange={handleSelectionChange}
            headings={[
              { title: "" },
              { title: "Product" },
              { title: "SKU" },
              { title: "Price" },
              { title: "Vendor" },
              { title: "Collection" },
              { title: "Has Options" },
              { title: "Actions" },
            ]}
          >
            {filteredProducts.map((product: any, index: number) => {
              const isConfigured = !!configuredMap[product.numericId];
              const isSubmitting = isLoading && navigation.formData?.get("shopifyProductId") === product.numericId;
              const multiVariant = product.variantsCount?.count > 1;

              return (
                <IndexTable.Row
                  id={product.numericId}
                  key={product.id}
                  selected={selectedResources.includes(product.numericId)}
                  position={index}
                >
                  <IndexTable.Cell>
                    <Thumbnail
                      source={product.featuredImage?.url || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-2_small.png"}
                      alt={product.title}
                      size="small"
                    />
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      {product.title}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodySm" tone="subdued">
                      {multiVariant ? "(variants)" : (product.sku || "—")}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodySm" tone={multiVariant ? "subdued" : undefined}>
                      {multiVariant ? "(variants)" : (product.price ? `$${parseFloat(product.price).toFixed(2)}` : "—")}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodySm">{product.vendor || "—"}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodySm">{product.collection || "—"}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    {isConfigured
                      ? <Badge tone="success">Yes</Badge>
                      : <Text as="span" variant="bodySm" tone="subdued">No</Text>
                    }
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Button
                      size="slim"
                      variant={isConfigured ? "primary" : "secondary"}
                      loading={isSubmitting}
                      onClick={() => handleConfigure(product.numericId, product.title)}
                    >
                      {isConfigured ? "▶ Edit Options" : "Configure"}
                    </Button>
                  </IndexTable.Cell>
                </IndexTable.Row>
              );
            })}
          </IndexTable>

          {/* Pagination footer */}
          <Box padding="300" borderBlockStartWidth="025" borderColor="border">
            <InlineStack align="space-between" blockAlign="center">
              <Pagination
                hasPrevious={pageInfo.hasPreviousPage}
                onPrevious={() => {
                  const p = new URLSearchParams();
                  if (filterProduct) p.set("q", filterProduct);
                  if (pageInfo.startCursor) p.set("before", pageInfo.startCursor);
                  setSearchParams(p);
                }}
                hasNext={pageInfo.hasNextPage}
                onNext={() => {
                  const p = new URLSearchParams();
                  if (filterProduct) p.set("q", filterProduct);
                  if (pageInfo.endCursor) p.set("cursor", pageInfo.endCursor);
                  setSearchParams(p);
                }}
              />
              <Text as="p" variant="bodySm" tone="subdued">
                Records found: {filteredProducts.length}. Showing page 1.
              </Text>
              <InlineStack gap="200" blockAlign="center">
                <Text as="span" variant="bodySm">Items</Text>
                <div style={{ width: "80px" }}>
                  <Select
                    label=""
                    labelHidden
                    options={["5","10","20","50","100"].map((n) => ({ label: n, value: n }))}
                    value={itemsPerPage}
                    onChange={setItemsPerPage}
                  />
                </div>
                <Text as="span" variant="bodySm">per page</Text>
              </InlineStack>
            </InlineStack>
          </Box>
        </Card>

        {/* Help footer */}
        <Box paddingBlockEnd="400">
          <Text as="p" variant="bodySm" tone="subdued" alignment="center">
            ❓ Got a question?{" "}
            <span style={{ color: "#2c6ecb", cursor: "pointer" }}>Quick Start Tour</span>
            {". Find more info in the "}
            <span style={{ color: "#2c6ecb", cursor: "pointer" }}>User Guide</span>
            {" or feel free to "}
            <span style={{ color: "#2c6ecb", cursor: "pointer" }}>create a support ticket</span>.
          </Text>
        </Box>
      </BlockStack>
    </Page>
  );
}
