// API route: Field CRUD for a section inside a product
// Manages fields and their values (choices)

import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  // ── Create field ────────────────────────────────────────────────────────────
  if (intent === "create-field") {
    const sectionId = String(formData.get("sectionId"));
    const count = await db.field.count({ where: { sectionId } });
    const field = await db.field.create({
      data: {
        sectionId,
        type: String(formData.get("type") || "input"),
        title: String(formData.get("title") || "Field"),
        fieldCode: String(formData.get("fieldCode") || ""),
        price: parseFloat(String(formData.get("price") || "0")),
        priceType: String(formData.get("priceType") || "fixed"),
        sku: formData.get("sku") ? String(formData.get("sku")) : null,
        required: formData.get("required") === "true",
        defaultValue: formData.get("defaultValue") ? String(formData.get("defaultValue")) : null,
        validation: formData.get("validation") ? String(formData.get("validation")) : null,
        maxLength: formData.get("maxLength") ? parseInt(String(formData.get("maxLength"))) : null,
        customerGroups: formData.get("customerGroups") ? String(formData.get("customerGroups")) : null,
        conditionJson: formData.get("conditionJson") ? String(formData.get("conditionJson")) : null,
        visibility: String(formData.get("visibility") || "visible"),
        makeIt: String(formData.get("makeIt") || "hidden"),
        tooltip: formData.get("tooltip") ? String(formData.get("tooltip")) : null,
        cssClass: formData.get("cssClass") ? String(formData.get("cssClass")) : null,
        htmlAttributes: formData.get("htmlAttributes") ? String(formData.get("htmlAttributes")) : null,
        hideSkuInCart: formData.get("hideSkuInCart") === "true",
        hideOnFocus: formData.get("hideOnFocus") === "true",
        sortOrder: count,
      },
    });
    return json({ success: true, fieldId: field.id });
  }

  // ── Update field ────────────────────────────────────────────────────────────
  if (intent === "update-field") {
    const fieldId = String(formData.get("fieldId"));
    await db.field.update({
      where: { id: fieldId },
      data: {
        type: String(formData.get("type") || "input"),
        title: String(formData.get("title") || "Field"),
        fieldCode: String(formData.get("fieldCode") || ""),
        price: parseFloat(String(formData.get("price") || "0")),
        priceType: String(formData.get("priceType") || "fixed"),
        sku: formData.get("sku") ? String(formData.get("sku")) : null,
        required: formData.get("required") === "true",
        defaultValue: formData.get("defaultValue") ? String(formData.get("defaultValue")) : null,
        validation: formData.get("validation") ? String(formData.get("validation")) : null,
        maxLength: formData.get("maxLength") ? parseInt(String(formData.get("maxLength"))) : null,
        customerGroups: formData.get("customerGroups") ? String(formData.get("customerGroups")) : null,
        conditionJson: formData.get("conditionJson") ? String(formData.get("conditionJson")) : null,
        visibility: String(formData.get("visibility") || "visible"),
        makeIt: String(formData.get("makeIt") || "hidden"),
        tooltip: formData.get("tooltip") ? String(formData.get("tooltip")) : null,
        cssClass: formData.get("cssClass") ? String(formData.get("cssClass")) : null,
        htmlAttributes: formData.get("htmlAttributes") ? String(formData.get("htmlAttributes")) : null,
        hideSkuInCart: formData.get("hideSkuInCart") === "true",
        hideOnFocus: formData.get("hideOnFocus") === "true",
      },
    });
    return json({ success: true });
  }

  // ── Delete field ────────────────────────────────────────────────────────────
  if (intent === "delete-field") {
    await db.field.delete({ where: { id: String(formData.get("fieldId")) } });
    return json({ success: true });
  }

  // ── Reorder fields ──────────────────────────────────────────────────────────
  if (intent === "reorder-fields") {
    const orders = JSON.parse(String(formData.get("orders") || "[]")) as { id: string; sortOrder: number }[];
    await Promise.all(
      orders.map((o) => db.field.update({ where: { id: o.id }, data: { sortOrder: o.sortOrder } }))
    );
    return json({ success: true });
  }

  // ── Create field value ──────────────────────────────────────────────────────
  if (intent === "create-value") {
    const fieldId = String(formData.get("fieldId"));
    const count = await db.fieldValue.count({ where: { fieldId } });
    await db.fieldValue.create({
      data: {
        fieldId,
        label: String(formData.get("label")),
        value: String(formData.get("value") || formData.get("label")),
        priceModifier: parseFloat(String(formData.get("priceModifier") || "0")),
        priceType: String(formData.get("priceType") || "fixed"),
        skuModifier: formData.get("skuModifier") ? String(formData.get("skuModifier")) : null,
        imageUrl: formData.get("imageUrl") ? String(formData.get("imageUrl")) : null,
        colorHex: formData.get("colorHex") ? String(formData.get("colorHex")) : null,
        sortOrder: count,
        isDefault: formData.get("isDefault") === "true",
      },
    });
    return json({ success: true });
  }

  // ── Update field value ──────────────────────────────────────────────────────
  if (intent === "update-value") {
    await db.fieldValue.update({
      where: { id: String(formData.get("valueId")) },
      data: {
        label: String(formData.get("label")),
        value: String(formData.get("value")),
        priceModifier: parseFloat(String(formData.get("priceModifier") || "0")),
        priceType: String(formData.get("priceType") || "fixed"),
        skuModifier: formData.get("skuModifier") ? String(formData.get("skuModifier")) : null,
        imageUrl: formData.get("imageUrl") ? String(formData.get("imageUrl")) : null,
        colorHex: formData.get("colorHex") ? String(formData.get("colorHex")) : null,
        isDefault: formData.get("isDefault") === "true",
      },
    });
    return json({ success: true });
  }

  // ── Delete field value ──────────────────────────────────────────────────────
  if (intent === "delete-value") {
    await db.fieldValue.delete({ where: { id: String(formData.get("valueId")) } });
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};
