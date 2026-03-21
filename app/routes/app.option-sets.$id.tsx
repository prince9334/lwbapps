import {
  json,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import { useState, useCallback, useEffect, useRef } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  TextField,
  Select,
  Banner,
  Box,
  InlineGrid,
} from "@shopify/polaris";

// ─── Loader ──────────────────────────────────────────────────────────────────
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const optionSet = await db.optionSet.findUnique({
    where: { id: params.id },
    include: { assignments: true },
  });
  if (!optionSet) throw new Response("Not found", { status: 404 });
  return json({ optionSet });
};

// ─── Action ──────────────────────────────────────────────────────────────────
export const action = async ({ request, params }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "update-set") {
    await db.optionSet.update({
      where: { id: params.id },
      data: {
        name: String(formData.get("name")),
        displayMode: String(formData.get("displayMode")),
        status: String(formData.get("status")),
      },
    });
    return json({ success: true });
  }

  if (intent === "assign-products") {
    const productsJson = String(formData.get("productsJson"));
    const selectedProducts = JSON.parse(productsJson) as { id: string }[];

    if (!selectedProducts.length) return json({ error: "No products selected" }, { status: 400 });

    for (const product of selectedProducts) {
      const numericId = product.id.replace("gid://shopify/Product/", "");
      await db.productAssignment.upsert({
        where: {
          optionSetId_shopifyProductId: {
            optionSetId: params.id!,
            shopifyProductId: numericId,
          },
        },
        create: {
          optionSetId: params.id!,
          shopifyProductId: numericId,
          assignmentType: "manual",
        },
        update: {},
      });
    }
    return json({ success: true });
  }

  if (intent === "remove-assignment") {
    await db.productAssignment.delete({
      where: { id: String(formData.get("assignmentId")) },
    });
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

// ─── Custom Tab Bar ───────────────────────────────────────────────────────────
const OS_TAB_LABELS = ["Options", "Rules", "Calculations", "Products"];

function TabBar({
  selected,
  onSelect,
  counts,
}: {
  selected: number;
  onSelect: (i: number) => void;
  counts: number[];
}) {
  return (
    <div style={{ display: "flex", borderBottom: "1px solid #e1e3e5", paddingLeft: "16px" }}>
      {OS_TAB_LABELS.map((label, i) => (
        <button
          key={label}
          type="button"
          onClick={() => onSelect(i)}
          style={{
            padding: "12px 16px",
            border: "none",
            background: "none",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: selected === i ? "600" : "400",
            color: selected === i ? "#008060" : "#202223",
            borderBottom: selected === i ? "2px solid #008060" : "2px solid transparent",
            marginBottom: "-1px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          {label}
          {counts[i] > 0 && (
            <span style={{
              background: selected === i ? "#008060" : "#c9cccf",
              color: "#fff",
              borderRadius: "10px",
              padding: "1px 7px",
              fontSize: "11px",
              fontWeight: "600",
            }}>
              {counts[i]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function OptionSetEditor() {
  const { optionSet } = useLoaderData<typeof loader>();
  const actionData = useActionData<any>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  // Toast for save confirmation
  const intentRef = useRef<string | null>(null);
  useEffect(() => {
    if (actionData?.success && intentRef.current === "update-set" && navigation.state === "idle") {
      (window as any).shopify.toast.show("Option set saved");
      intentRef.current = null;
    }
  }, [actionData, navigation.state]);

  const [selectedTab, setSelectedTab] = useState(0);

  // Header form state
  const [name, setName] = useState(optionSet.name);
  const [displayMode, setDisplayMode] = useState(optionSet.displayMode);
  const [status, setStatus] = useState(optionSet.status);

  const isDirty = name !== optionSet.name || 
                  displayMode !== optionSet.displayMode || 
                  status !== optionSet.status;

  const handleSave = useCallback(() => {
    intentRef.current = "update-set";
    const fd = new FormData();
    fd.set("intent", "update-set");
    fd.set("name", name);
    fd.set("displayMode", displayMode);
    fd.set("status", status);
    submit(fd, { method: "post" });
  }, [name, displayMode, status, submit]);

  const handleAssign = useCallback(async () => {
    const selected = await (window as any).shopify.resourcePicker({
      type: "product",
      multiple: true,
      action: "select",
    });

    if (selected && selected.length > 0) {
      const fd = new FormData();
      fd.set("intent", "assign-products");
      fd.set("productsJson", JSON.stringify(selected.map((p: any) => ({ id: p.id }))));
      submit(fd, { method: "post" });
    }
  }, [submit]);

  const displayModeOptions = [
    { label: "Classic form", value: "classic" },
    { label: "Multi-step", value: "multi_step" },
  ];
  const statusOptions = [
    { label: "Active", value: "active" },
    { label: "Inactive", value: "inactive" },
  ];

  const tabCounts = [0, 0, 0, (optionSet.assignments as any[]).length];

  return (
    <Page
      title={name}
      backAction={{ content: "Option Sets", url: "/app/option-sets" }}
      primaryAction={isDirty ? {
        content: "Save",
        onAction: handleSave,
        loading: isLoading,
      } : undefined}
      titleMetadata={
        <Badge tone={status === "active" ? "success" : "warning"}>
          {status === "active" ? "Active" : "Inactive"}
        </Badge>
      }
    >
      <BlockStack gap="500">
        {/* ── Header Settings ── */}
        <Card>
          <InlineGrid columns={2} gap="400">
            <TextField
              label="Option set name"
              value={name}
              onChange={setName}
              helpText="Specify the name of the option set. It can be seen internally only."
              autoComplete="off"
            />
            <BlockStack gap="300">
              <Select
                label="Display mode"
                options={displayModeOptions}
                value={displayMode}
                onChange={setDisplayMode}
                helpText={
                  displayMode === "classic"
                    ? "All options displayed inline"
                    : "One option displayed per step"
                }
              />
              <Select
                label="Status"
                options={statusOptions}
                value={status}
                onChange={setStatus}
              />
            </BlockStack>
          </InlineGrid>
        </Card>

        {/* ── Tabbed Section ── */}
        <Card padding="0">
          <TabBar selected={selectedTab} onSelect={setSelectedTab} counts={tabCounts} />

          {/* OPTIONS */}
          {selectedTab === 0 && (
            <Box padding="400">
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">Add options to your option set</Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  Options are configured per-product. Assign products in the Products tab, then configure options on the product's configuration page.
                </Text>
                <Banner tone="info">
                  <p>
                    To add options, go to the <strong>Products</strong> tab → assign a product → then click <strong>Edit Options</strong> on that product.
                  </p>
                </Banner>
                <Box padding="600" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="200" inlineAlign="center">
                    <Text variant="headingMd" as="p" alignment="center">No options configured yet</Text>
                    <Button onClick={() => setSelectedTab(3)}>Go to Products tab →</Button>
                  </BlockStack>
                </Box>
              </BlockStack>
            </Box>
          )}

          {/* RULES */}
          {selectedTab === 1 && (
            <Box padding="400">
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">Add rules to your options</Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  You can add dependencies between options or create custom price logic with rules.
                </Text>
                <Banner tone="info">
                  <p>Rules are configured per-product on the product Configuration page. Assign products first, then configure rules there.</p>
                </Banner>
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="200">
                    <Text variant="bodyMd" as="p" fontWeight="semibold">Rule examples:</Text>
                    <Text variant="bodySm" as="p" tone="subdued">• IF Material = Platinum THEN Add $200</Text>
                    <Text variant="bodySm" as="p" tone="subdued">• IF Size &gt; 10 THEN Show Engraving option</Text>
                    <Text variant="bodySm" as="p" tone="subdued">• IF Color = Gold AND Size = Large THEN Multiply price × 1.5</Text>
                    <Button onClick={() => setSelectedTab(3)}>Assign products first →</Button>
                  </BlockStack>
                </Box>
              </BlockStack>
            </Box>
          )}

          {/* CALCULATIONS */}
          {selectedTab === 2 && (
            <Box padding="400">
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">Create formula to calculate number options</Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  You can calculate custom values (length, area, volume) with formulas using number field, step counter, range slider.
                </Text>
                <Banner tone="info">
                  <p>Calculations are configured on the product Configuration page. Assign products first, then add formulas there.</p>
                </Banner>
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="200">
                    <Text variant="bodyMd" as="p" fontWeight="semibold">Formula examples:</Text>
                    <Text variant="bodySm" as="p" tone="subdued"><code>engraving_length * 5</code> — $5 per character</Text>
                    <Text variant="bodySm" as="p" tone="subdued"><code>width * height * price_per_unit</code> — area pricing</Text>
                    <Text variant="bodySm" as="p" tone="subdued"><code>(quantity - 1) * 10 + 50</code> — tiered pricing</Text>
                    <Button onClick={() => setSelectedTab(3)}>Assign products first →</Button>
                  </BlockStack>
                </Box>
              </BlockStack>
            </Box>
          )}

          {/* PRODUCTS */}
          {selectedTab === 3 && (
            <Box padding="400">
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingMd" as="h3">
                    Assigned Products ({(optionSet.assignments as any[]).length})
                  </Text>
                  <Button variant="primary" onClick={handleAssign}>
                    Assign product
                  </Button>
                </InlineStack>
                <Text variant="bodySm" as="p" tone="subdued">
                  Options assigned to sold-out products won&apos;t appear on the storefront. Use automatic or manual product selection.
                </Text>

                {(optionSet.assignments as any[]).length === 0 ? (
                  <Box padding="800" background="bg-surface-secondary" borderRadius="200">
                    <BlockStack gap="300" inlineAlign="center">
                      <Text variant="headingMd" as="p" alignment="center">No products assigned</Text>
                      <Text variant="bodySm" as="p" tone="subdued" alignment="center">
                        Assign products to apply this option set&apos;s options at checkout.
                      </Text>
                      <Button variant="primary" onClick={handleAssign}>
                        Assign product
                      </Button>
                    </BlockStack>
                  </Box>
                ) : (
                  <BlockStack gap="200">
                    {(optionSet.assignments as any[]).map((assignment) => (
                      <Box
                        key={assignment.id}
                        padding="300"
                        background="bg-surface-secondary"
                        borderRadius="200"
                      >
                        <InlineStack align="space-between">
                          <BlockStack gap="100">
                            <Text variant="bodyMd" as="p" fontWeight="semibold">
                              Product ID: {assignment.shopifyProductId}
                            </Text>
                            <Badge>{assignment.assignmentType}</Badge>
                          </BlockStack>
                          <InlineStack gap="200">
                            <Button
                              size="slim"
                              url={`/app/products?configure=${assignment.shopifyProductId}`}
                            >
                              Edit Options
                            </Button>
                            <Button
                              size="slim"
                              tone="critical"
                              onClick={() => {
                                const fd = new FormData();
                                fd.set("intent", "remove-assignment");
                                fd.set("assignmentId", assignment.id);
                                submit(fd, { method: "post" });
                              }}
                            >
                              Remove
                            </Button>
                          </InlineStack>
                        </InlineStack>
                      </Box>
                    ))}
                  </BlockStack>
                )}

                {/* Next steps */}
                {(optionSet.assignments as any[]).length > 0 && (
                  <Banner tone="success">
                    <p>
                      ✅ Products assigned! Go to <strong>Products</strong> in the sidebar and click <strong>Edit Options</strong> to configure options and rules.
                    </p>
                  </Banner>
                )}
              </BlockStack>
            </Box>
          )}
        </Card>
      </BlockStack>

    </Page>
  );
}
