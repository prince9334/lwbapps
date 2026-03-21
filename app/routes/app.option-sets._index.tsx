import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import { useState, useCallback } from "react";
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
  EmptyState,
  IndexTable,
  useIndexResourceState,
  Modal,
  TextField,
  Select,
  Banner,
  Box,
} from "@shopify/polaris";

// ─── Loader ──────────────────────────────────────────────────────────────────
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return json({ optionSets: [] as any[] });

  const optionSets = await db.optionSet.findMany({
    where: { shopId: shop.id },
    include: {
      _count: { select: { assignments: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return json({ optionSets });
};

// ─── Action ──────────────────────────────────────────────────────────────────
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return json({ error: "Shop not found" }, { status: 404 });

  if (intent === "create") {
    const name = String(formData.get("name") || "Untitled option set");
    const displayMode = String(formData.get("displayMode") || "classic");
    const optionSet = await db.optionSet.create({
      data: { shopId: shop.id, name, displayMode },
    });
    return json({ success: true, optionSetId: optionSet.id });
  }

  if (intent === "delete") {
    await db.optionSet.delete({ where: { id: String(formData.get("optionSetId")) } });
    return json({ success: true });
  }

  if (intent === "toggle-status") {
    const os = await db.optionSet.findUnique({ where: { id: String(formData.get("optionSetId")) } });
    if (os) {
      await db.optionSet.update({
        where: { id: os.id },
        data: { status: os.status === "active" ? "inactive" : "active" },
      });
    }
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function OptionSetsPage() {
  const { optionSets } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  const [createOpen, setCreateOpen] = useState(false);
  const [osName, setOsName] = useState("Untitled option set");
  const [displayMode, setDisplayMode] = useState("classic");

  const handleCreate = useCallback(() => {
    const fd = new FormData();
    fd.set("intent", "create");
    fd.set("name", osName);
    fd.set("displayMode", displayMode);
    submit(fd, { method: "post" });
    setCreateOpen(false);
    setOsName("Untitled option set");
    setDisplayMode("classic");
  }, [osName, displayMode, submit]);

  const resourceName = { singular: "option set", plural: "option sets" };
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(optionSets as any[]);

  const displayModeOptions = [
    { label: "Classic form — All options displayed inline", value: "classic" },
    { label: "Multi-step — One option per step", value: "multi_step" },
  ];

  return (
    <Page
      title="Option sets"
      primaryAction={{
        content: "Create new options",
        onAction: () => setCreateOpen(true),
      }}
    >
      <BlockStack gap="400">
        {optionSets.length === 0 ? (
          <Card>
            <EmptyState
              heading="Create your first option set"
              action={{ content: "Create new options", onAction: () => setCreateOpen(true) }}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>
                Add unlimited product options like Color, Material, Size, Engraving — without variant limits.
              </p>
            </EmptyState>
          </Card>
        ) : (
          <Card padding="0">
            <IndexTable
              resourceName={resourceName}
              itemCount={optionSets.length}
              selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
              onSelectionChange={handleSelectionChange}
              headings={[
                { title: "Option sets" },
                { title: "Status" },
                { title: "Created" },
                { title: "Updated" },
                { title: "Products" },
                { title: "Actions" },
              ]}
            >
              {(optionSets as any[]).map((os, index) => (
                <IndexTable.Row
                  id={os.id}
                  key={os.id}
                  selected={selectedResources.includes(os.id)}
                  position={index}
                >
                  <IndexTable.Cell>
                    <Text variant="bodyMd" fontWeight="semibold" as="span">
                      {os.name}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone={os.status === "active" ? "success" : "warning"}>
                      {os.status === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text variant="bodySm" as="span" tone="subdued">
                      {new Date(os.createdAt).toLocaleDateString()}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text variant="bodySm" as="span" tone="subdued">
                      {new Date(os.updatedAt).toLocaleDateString()}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge>{String(os._count.assignments)}</Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <div onClick={(e) => e.stopPropagation()}>
                      <InlineStack gap="200">
                        <Button
                          size="slim"
                          variant="primary"
                          url={`/app/option-sets/${os.id}`}
                        >
                          Edit
                        </Button>
                        <Button
                          size="slim"
                          onClick={() => {
                            const fd = new FormData();
                            fd.set("intent", "toggle-status");
                            fd.set("optionSetId", os.id);
                            submit(fd, { method: "post" });
                          }}
                        >
                          {os.status === "active" ? "Deactivate" : "Activate"}
                        </Button>
                        <Button
                          size="slim"
                          tone="critical"
                          onClick={() => {
                            if (confirm(`Delete "${os.name}"?`)) {
                              const fd = new FormData();
                              fd.set("intent", "delete");
                              fd.set("optionSetId", os.id);
                              submit(fd, { method: "post" });
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </InlineStack>
                    </div>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </Card>
        )}
      </BlockStack>

      {/* ── Create Modal ── */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create option set"
        primaryAction={{
          content: "Create",
          onAction: handleCreate,
          loading: isLoading,
          disabled: !osName.trim(),
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setCreateOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Option set name"
              value={osName}
              onChange={setOsName}
              helpText="Specify the name of the option set. It can be seen internally only."
              autoComplete="off"
            />
            <Select
              label="Display mode"
              options={displayModeOptions}
              value={displayMode}
              onChange={setDisplayMode}
              helpText={
                displayMode === "classic"
                  ? "All options displayed inline"
                  : "One option displayed per step (wizard)"
              }
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
