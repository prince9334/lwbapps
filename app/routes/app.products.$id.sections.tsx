// API route: Section CRUD for a product
// POST /app/products/:id/sections — create, update, delete, reorder sections

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const sections = await db.section.findMany({
    where: { productId: params.id },
    orderBy: { sortOrder: "asc" },
    include: {
      fields: {
        orderBy: { sortOrder: "asc" },
        include: { values: { orderBy: { sortOrder: "asc" } }, rules: true },
      },
    },
  });
  return json({ sections });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  // ── Create section ──────────────────────────────────────────────────────────
  if (intent === "create-section") {
    const count = await db.section.count({ where: { productId: params.id } });
    const section = await db.section.create({
      data: {
        productId: params.id!,
        label: String(formData.get("label") || "Section"),
        visibility: String(formData.get("visibility") || "visible"),
        makeIt: String(formData.get("makeIt") || "hidden"),
        conditionJson: formData.get("conditionJson") ? String(formData.get("conditionJson")) : null,
        columns: parseInt(String(formData.get("columns") || "3")),
        rows: parseInt(String(formData.get("rows") || "3")),
        sortOrder: count,
      },
    });
    return json({ success: true, sectionId: section.id });
  }

  // ── Update section ──────────────────────────────────────────────────────────
  if (intent === "update-section") {
    await db.section.update({
      where: { id: String(formData.get("sectionId")) },
      data: {
        label: String(formData.get("label")),
        visibility: String(formData.get("visibility") || "visible"),
        makeIt: String(formData.get("makeIt") || "hidden"),
        conditionJson: formData.get("conditionJson") ? String(formData.get("conditionJson")) : null,
        columns: parseInt(String(formData.get("columns") || "3")),
        rows: parseInt(String(formData.get("rows") || "3")),
      },
    });
    return json({ success: true });
  }

  // ── Delete section ──────────────────────────────────────────────────────────
  if (intent === "delete-section") {
    await db.section.delete({ where: { id: String(formData.get("sectionId")) } });
    return json({ success: true });
  }

  // ── Reorder sections ────────────────────────────────────────────────────────
  if (intent === "reorder-sections") {
    const ordersJson = JSON.parse(String(formData.get("orders") || "[]")) as { id: string; sortOrder: number }[];
    await Promise.all(
      ordersJson.map((o) =>
        db.section.update({ where: { id: o.id }, data: { sortOrder: o.sortOrder } })
      )
    );
    return json({ success: true });
  }

  // ── Duplicate section ───────────────────────────────────────────────────────
  if (intent === "duplicate-section") {
    const src = await db.section.findUnique({
      where: { id: String(formData.get("sectionId")) },
      include: { fields: { include: { values: true, rules: true } } },
    });
    if (!src) return json({ error: "Not found" }, { status: 404 });

    const count = await db.section.count({ where: { productId: src.productId } });
    const newSection = await db.section.create({
      data: {
        productId: src.productId,
        label: src.label + " (Copy)",
        visibility: src.visibility,
        makeIt: src.makeIt,
        conditionJson: src.conditionJson,
        columns: src.columns,
        rows: src.rows,
        sortOrder: count,
      },
    });

    // Duplicate fields
    for (const field of src.fields) {
      const newField = await db.field.create({
        data: {
          sectionId: newSection.id,
          type: field.type,
          title: field.title,
          fieldCode: field.fieldCode,
          price: field.price,
          priceType: field.priceType,
          sku: field.sku,
          required: field.required,
          defaultValue: field.defaultValue,
          validation: field.validation,
          maxLength: field.maxLength,
          customerGroups: field.customerGroups,
          conditionJson: field.conditionJson,
          visibility: field.visibility,
          makeIt: field.makeIt,
          tooltip: field.tooltip,
          cssClass: field.cssClass,
          htmlAttributes: field.htmlAttributes,
          hideSkuInCart: field.hideSkuInCart,
          hideOnFocus: field.hideOnFocus,
          sortOrder: field.sortOrder,
        },
      });
      // Duplicate values
      for (const val of field.values) {
        await db.fieldValue.create({
          data: {
            fieldId: newField.id,
            label: val.label,
            value: val.value,
            priceModifier: val.priceModifier,
            priceType: val.priceType,
            skuModifier: val.skuModifier,
            imageUrl: val.imageUrl,
            colorHex: val.colorHex,
            sortOrder: val.sortOrder,
            isDefault: val.isDefault,
          },
        });
      }
    }
    return json({ success: true, sectionId: newSection.id });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};
