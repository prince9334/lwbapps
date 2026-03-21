import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  Page,
  Layout,
  Card,
  ResourceList,
  ResourceItem,
  Text,
  Badge,
  BlockStack,
  Box,
  Button,
  InlineStack,
  Divider,
} from "@shopify/polaris";
import { useState } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  const logs = await db.log.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return json({ logs });
};

export const action = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  if (actionType === "clear") {
    await db.log.deleteMany({});
    return json({ success: true });
  }

  return json({ success: false });
};

export default function LogsPage() {
  const { logs } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const clearLogs = () => {
    if (confirm("Are you sure you want to clear all logs?")) {
      submit({ actionType: "clear" }, { method: "POST" });
    }
  };

  const getBadgeTone = (level: string) => {
    switch (level) {
      case "error": return "critical";
      case "warn": return "warning";
      default: return "info";
    }
  };

  return (
    <Page 
      title="Debug Logs" 
      backAction={{ content: "Dashboard", url: "/app" }}
      primaryAction={{
        content: "Clear Logs",
        onAction: clearLogs,
        destructive: true,
        loading: navigation.state === "submitting",
      }}
    >
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <ResourceList
              resourceName={{ singular: "log", plural: "logs" }}
              items={logs}
              renderItem={(item) => {
                const { id, level, message, createdAt, shop } = item;
                const date = new Date(createdAt).toLocaleString();

                return (
                  <ResourceItem
                    id={id}
                    onClick={() => setSelectedLog(item)}
                    persistActions
                  >
                    <BlockStack gap="100">
                      <InlineStack align="space-between">
                        <InlineStack gap="200">
                          <Badge tone={getBadgeTone(level)}>{level.toUpperCase()}</Badge>
                          <Text variant="bodyMd" as="p" fontWeight="bold">
                            {message}
                          </Text>
                        </InlineStack>
                        <Text variant="bodySm" as="p" tone="subdued">
                          {date}
                        </Text>
                      </InlineStack>
                      {shop && (
                        <Text variant="bodySm" as="p" tone="subdued">
                          Shop: {shop}
                        </Text>
                      )}
                    </BlockStack>
                  </ResourceItem>
                );
              }}
            />
          </Card>
        </Layout.Section>

        {selectedLog && (
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingMd" as="h3">Log Details</Text>
                  <Button variant="tertiary" onClick={() => setSelectedLog(null)}>Close</Button>
                </InlineStack>
                <Divider />
                <BlockStack gap="200">
                  <Text variant="bodySm" as="p" fontWeight="bold">Message</Text>
                  <Text variant="bodyMd" as="p">{selectedLog.message}</Text>
                  
                  <Text variant="bodySm" as="p" fontWeight="bold">Time</Text>
                  <Text variant="bodyMd" as="p">{new Date(selectedLog.createdAt).toLocaleString()}</Text>

                  <Text variant="bodySm" as="p" fontWeight="bold">Details</Text>
                  <Box 
                    padding="300" 
                    background="bg-surface-secondary" 
                    borderRadius="200"
                    overflowX="scroll"
                  >
                    <pre style={{ margin: 0, fontSize: "12px" }}>
                      {selectedLog.details || "No extra details"}
                    </pre>
                  </Box>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
