import {
  json,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from "@remix-run/node";
import {
  useLoaderData,
  useSubmit,
  useNavigation,
} from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
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
  Select,
  Checkbox,
  Modal,
  Banner,
  Box,
  InlineGrid,
  Divider,
  Thumbnail,
  Link,
} from "@shopify/polaris";

// ── Field type options ────────────────────────────────────────────────────────
const FIELD_TYPES = [
  { label: "Input Box", value: "input" },
  { label: "Textarea", value: "textarea" },
  { label: "Number", value: "number" },
  { label: "Date Picker", value: "date" },
  { label: "Dropdown", value: "dropdown" },
  { label: "Radio Buttons", value: "radio" },
  { label: "Checkbox", value: "checkbox" },
  { label: "Color Swatch", value: "color_swatch" },
  { label: "Image Swatch", value: "image_swatch" },
  { label: "File Upload", value: "file_upload" },
  { label: "Range Slider", value: "range_slider" },
  { label: "Step Counter", value: "step_counter" },
];

const VISIBILITY_OPTS = [{ label: "Visible", value: "visible" }, { label: "Hidden", value: "hidden" }];
const MAKEIT_OPTS = [{ label: "Visible", value: "visible" }, { label: "Hidden", value: "hidden" }, { label: "Required", value: "required" }, { label: "Optional", value: "optional" }];
const REQUIRED_OPTS = [{ label: "No", value: "false" }, { label: "Yes", value: "true" }];
const VALIDATION_OPTS = [{ label: "None", value: "" }, { label: "Email", value: "email" }, { label: "URL", value: "url" }, { label: "Number", value: "number" }, { label: "Custom Regex", value: "custom_regex" }];
const PRICE_TYPE_OPTS = [{ label: "Fixed", value: "fixed" }, { label: "Percentage", value: "percentage" }];
const COL_OPTS = ["1","2","3","4","6"].map((v) => ({ label: v, value: v }));
const ROW_OPTS = ["1","2","3","4"].map((v) => ({ label: v, value: v }));

// ── Types ─────────────────────────────────────────────────────────────────────
interface FieldValue { id: string; label: string; value: string; priceModifier: number; priceType: string; skuModifier: string|null; imageUrl: string|null; colorHex: string|null; sortOrder: number; isDefault: boolean; }
interface Field { id: string; type: string; title: string; fieldCode: string; price: number; priceType: string; sku: string|null; required: boolean; defaultValue: string|null; validation: string|null; maxLength: number|null; conditionJson: string|null; visibility: string; makeIt: string; tooltip: string|null; cssClass: string|null; htmlAttributes: string|null; hideSkuInCart: boolean; hideOnFocus: boolean; sortOrder: number; values: FieldValue[]; }
interface Section { id: string; label: string; visibility: string; makeIt: string; conditionJson: string|null; columns: number; rows: number; sortOrder: number; fields: Field[]; }

// ── Loader ────────────────────────────────────────────────────────────────────
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const product = await db.product.findUnique({
    where: { id: params.id },
    include: {
      shop: true,
      sections: {
        orderBy: { sortOrder: "asc" },
        include: { fields: { orderBy: { sortOrder: "asc" }, include: { values: { orderBy: { sortOrder: "asc" } }, rules: true } } },
      },
    },
  });
  if (!product) throw new Response("Not found", { status: 404 });
  return json({ product });
};

// ── Action ────────────────────────────────────────────────────────────────────
export const action = async ({ request, params }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const fd = await request.formData();
  const intent = String(fd.get("intent") || "");

  const g = (k: string) => fd.get(k) ? String(fd.get(k)) : null;
  const gs = (k: string, def = "") => String(fd.get(k) || def);
  const gf = (k: string) => parseFloat(gs(k, "0")) || 0;
  const gi = (k: string) => parseInt(gs(k, "0")) || 0;
  const gb = (k: string) => fd.get(k) === "true";

  // ── Sections ───────────────────────────────────────────────────────────────
  if (intent === "create-section") {
    const count = await db.section.count({ where: { productId: params.id } });
    const s = await db.section.create({ data: { productId: params.id!, label: gs("label","Section"), columns: gi("columns") || 3, rows: gi("rows") || 3, sortOrder: count } });
    return json({ success: true, intent, sectionId: s.id });
  }
  if (intent === "update-section") {
    await db.section.update({ where: { id: gs("sectionId") }, data: { label: gs("label"), visibility: gs("visibility","visible"), makeIt: gs("makeIt","hidden"), columns: gi("columns") || 3, rows: gi("rows") || 3 } });
    return json({ success: true, intent });
  }
  if (intent === "delete-section") {
    await db.section.delete({ where: { id: gs("sectionId") } });
    return json({ success: true, intent });
  }
  if (intent === "remove-all-sections") {
    await db.section.deleteMany({ where: { productId: params.id! } });
    return json({ success: true, intent });
  }

  // ── Fields ─────────────────────────────────────────────────────────────────
  if (intent === "create-field" || intent === "update-field") {
    const isNew = intent === "create-field";
    const sectionId = gs("sectionId");
    const title = gs("title","Field");
    const count = isNew ? await db.field.count({ where: { sectionId } }) : 0;
    const fc = title.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6) || `F${count+1}`;
    const data: any = {
      type: gs("type","input"), title, fieldCode: isNew ? fc : undefined,
      price: gf("price"), priceType: gs("priceType","fixed"),
      sku: g("sku"), required: gb("required"),
      defaultValue: g("defaultValue"), validation: g("validation"),
      maxLength: g("maxLength") && gs("maxLength") !== "" ? gi("maxLength") : null,
      conditionJson: g("conditionJson"),
      visibility: gs("visibility","visible"), makeIt: gs("makeIt","hidden"),
      tooltip: g("tooltip"), cssClass: g("cssClass"), htmlAttributes: g("htmlAttributes"),
      hideSkuInCart: gb("hideSkuInCart"), hideOnFocus: gb("hideOnFocus"),
    };
    if (isNew) {
      data.sectionId = sectionId; data.sortOrder = count;
      const f = await db.field.create({ data });
      return json({ success: true, intent, fieldId: f.id });
    } else {
      delete data.fieldCode;
      await db.field.update({ where: { id: gs("fieldId") }, data });
      return json({ success: true, intent });
    }
  }
  if (intent === "delete-field") {
    await db.field.delete({ where: { id: gs("fieldId") } });
    return json({ success: true, intent });
  }

  // ── Field Values ───────────────────────────────────────────────────────────
  if (intent === "create-value") {
    const fieldId = gs("fieldId");
    const count = await db.fieldValue.count({ where: { fieldId } });
    const label = gs("label");
    await db.fieldValue.create({ data: { fieldId, label, value: g("value") || label.toLowerCase().replace(/\s+/g,"_"), priceModifier: gf("priceModifier"), priceType: gs("priceType","fixed"), skuModifier: g("skuModifier"), imageUrl: g("imageUrl"), colorHex: g("colorHex"), sortOrder: count, isDefault: gb("isDefault") } });
    return json({ success: true, intent });
  }
  if (intent === "delete-value") {
    await db.fieldValue.delete({ where: { id: gs("valueId") } });
    return json({ success: true, intent });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

// ── Blank field state ─────────────────────────────────────────────────────────
const BLANK: Partial<Field> = { type:"input", title:"", price:0, priceType:"fixed", sku:"", required:false, defaultValue:"", validation:"", maxLength:undefined, visibility:"visible", makeIt:"hidden", tooltip:"", cssClass:"", htmlAttributes:"", hideSkuInCart:false, hideOnFocus:false };

// ── Option Configuration Modal (exact DPO layout) ─────────────────────────────
function OptionConfigModal({ open, field, sectionId, allFields, onClose, onSave }: { open: boolean; field: Partial<Field>|null; sectionId: string; allFields: Field[]; onClose: ()=>void; onSave: (data: any, isNew: boolean)=>void; }) {
  const isNew = !field?.id;
  const [type, setType] = useState(field?.type||"input");
  const [title, setTitle] = useState(field?.title||"");
  const [price, setPrice] = useState(String(field?.price??0));
  const [priceType, setPriceType] = useState(field?.priceType||"fixed");
  const [sku, setSku] = useState(field?.sku||"");
  const [required, setRequired] = useState(String(field?.required??"false"));
  const [validation, setValidation] = useState(field?.validation||"");
  const [maxLen, setMaxLen] = useState(field?.maxLength?String(field.maxLength):"0");
  const [defaultValue, setDefaultValue] = useState(field?.defaultValue||"");
  const [visibility, setVisibility] = useState(field?.visibility||"visible");
  const [makeIt, setMakeIt] = useState(field?.makeIt||"hidden");
  const [tooltip, setTooltip] = useState(field?.tooltip||"");
  const [cssClass, setCssClass] = useState(field?.cssClass||"");
  const [htmlAttributes, setHtmlAttributes] = useState(field?.htmlAttributes||"");
  const [hideSkuInCart, setHideSkuInCart] = useState(field?.hideSkuInCart??false);
  const [hideOnFocus, setHideOnFocus] = useState(field?.hideOnFocus??false);
  const [copyFrom, setCopyFrom] = useState("");

  useEffect(() => {
    setType(field?.type||"input"); setTitle(field?.title||"");
    setPrice(String(field?.price??0)); setPriceType(field?.priceType||"fixed");
    setSku(field?.sku||""); setRequired(String(field?.required??"false"));
    setValidation(field?.validation||""); setMaxLen(field?.maxLength?String(field.maxLength):"0");
    setDefaultValue(field?.defaultValue||""); setVisibility(field?.visibility||"visible");
    setMakeIt(field?.makeIt||"hidden"); setTooltip(field?.tooltip||"");
    setCssClass(field?.cssClass||""); setHtmlAttributes(field?.htmlAttributes||"");
    setHideSkuInCart(field?.hideSkuInCart??false); setHideOnFocus(field?.hideOnFocus??false);
    setCopyFrom("");
  }, [field, open]);

  const autoFieldId = title ? title.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6)||"F1" : (field?.fieldCode||"F1");

  const handleApply = () => {
    if (!title.trim()) return;
    onSave({ fieldId: field?.id, sectionId, type, title, price, priceType, sku, required, defaultValue, validation, maxLength: maxLen, visibility, makeIt, tooltip, cssClass, htmlAttributes, hideSkuInCart: String(hideSkuInCart), hideOnFocus: String(hideOnFocus) }, isNew);
    onClose();
  };

  const copyOptions = [{ label: "-- Please Select --", value: "" }, ...allFields.map((f) => ({ label: f.title, value: f.id }))];

  const handleCopyFrom = (id: string) => {
    setCopyFrom(id);
    if (!id) return;
    const src = allFields.find((f) => f.id === id);
    if (!src) return;
    setType(src.type); setPrice(String(src.price)); setPriceType(src.priceType);
    setSku(src.sku||""); setRequired(String(src.required)); setValidation(src.validation||"");
    setMaxLen(src.maxLength?String(src.maxLength):"0"); setDefaultValue(src.defaultValue||"");
    setVisibility(src.visibility); setMakeIt(src.makeIt); setTooltip(src.tooltip||"");
    setCssClass(src.cssClass||""); setHtmlAttributes(src.htmlAttributes||"");
    setHideSkuInCart(src.hideSkuInCart); setHideOnFocus(src.hideOnFocus);
  };

  return (
    <Modal open={open} onClose={onClose} title="Option Configuration" size="large"
      primaryAction={{ content: "Apply", onAction: handleApply, disabled: !title.trim() }}
      secondaryActions={[
        { content: "Cancel", onAction: onClose },
        ...(!isNew ? [{ content: "Remove", destructive: true, onAction: () => { onSave({ fieldId: field?.id, _delete: true }, false); onClose(); } }] : []),
      ]}
    >
      <Modal.Section>
        {/* Top: Copy Configuration From + Field Type */}
        <Box paddingBlockEnd="400">
          <InlineStack align="space-between" blockAlign="center">
            <InlineStack gap="200" blockAlign="center">
              <Text as="span" variant="bodySm">Copy Configuration From:</Text>
              <div style={{ minWidth: "180px" }}>
                <Select label="" labelHidden options={copyOptions} value={copyFrom} onChange={handleCopyFrom} />
              </div>
            </InlineStack>
            <InlineStack gap="200" blockAlign="center">
              <Text as="span" variant="bodySm">Field Type:</Text>
              <div style={{ minWidth: "160px" }}>
                <Select label="" labelHidden options={FIELD_TYPES} value={type} onChange={setType} />
              </div>
            </InlineStack>
          </InlineStack>
        </Box>

        <BlockStack gap="400">
          {/* Row 1: Title | Field ID | Required | Validation | Max Len */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: "12px", alignItems: "end" }}>
            <TextField label="Title" value={title} onChange={setTitle} autoComplete="off" placeholder="e.g. Engraving Text" />
            <TextField label="Field ID" value={autoFieldId} onChange={() => {}} disabled autoComplete="off" helpText="auto" />
            <Select label="Required" options={REQUIRED_OPTS} value={required} onChange={setRequired} />
            <Select label="Validation" options={VALIDATION_OPTS} value={validation} onChange={setValidation} />
            <TextField label={`Max Len (0 unlimited)`} type="number" value={maxLen} onChange={setMaxLen} autoComplete="off" />
          </div>

          {/* Row 2: Price | Price Type | SKU | Customer Groups | Hide SKU | Hide on focus */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto auto", gap: "12px", alignItems: "end" }}>
            <TextField label="Price" type="number" value={price} onChange={setPrice} autoComplete="off" prefix="$" />
            <Select label="Price Type" options={PRICE_TYPE_OPTS} value={priceType} onChange={setPriceType} />
            <TextField label="SKU" value={sku} onChange={setSku} autoComplete="off" placeholder="e.g. ENG-01" />
            <div>
              <Text as="p" variant="bodySm" fontWeight="semibold">Customer Groups</Text>
              <Text as="p" variant="bodySm" tone="subdued">All Groups</Text>
            </div>
            <div style={{ paddingTop: "20px" }}>
              <Checkbox label="Hide SKU in cart/order" checked={hideSkuInCart} onChange={setHideSkuInCart} />
            </div>
            <div style={{ paddingTop: "20px" }}>
              <Checkbox label="Hide on focus" checked={hideOnFocus} onChange={setHideOnFocus} />
            </div>
          </div>

          {/* Row 3: Default Value + Visibility + Make it + IF + Tooltip */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: "12px", alignItems: "end" }}>
            <TextField label="Default Value" value={defaultValue} onChange={setDefaultValue} autoComplete="off" />
            <Select label="Visibility" options={VISIBILITY_OPTS} value={visibility} onChange={setVisibility} />
            <Select label="Make it" options={MAKEIT_OPTS} value={makeIt} onChange={setMakeIt} />
            <div>
              <Text as="p" variant="bodySm" fontWeight="semibold">IF ✏</Text>
              <Text as="p" variant="bodySm" tone="subdued">(Conditional rule)</Text>
            </div>
            <TextField label="Tooltip ✏" value={tooltip} onChange={setTooltip} autoComplete="off" multiline={2} />
          </div>

          <Divider />

          {/* Row 4: Comment | CSS Class | HTML Arguments */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <TextField label="Comment" value="" onChange={() => {}} autoComplete="off" multiline={2} />
            <TextField label="CSS Class" value={cssClass} onChange={setCssClass} autoComplete="off" placeholder="my-custom-class" />
            <TextField label="HTML Arguments" value={htmlAttributes} onChange={setHtmlAttributes} autoComplete="off" placeholder='data-tag="value"' />
          </div>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

// ── Add Choice Modal ──────────────────────────────────────────────────────────
function AddValueModal({ open, field, onClose, onSave }: { open: boolean; field: Field|null; onClose: ()=>void; onSave: (data: any)=>void; }) {
  const [label, setLabel] = useState(""); const [value, setValue] = useState("");
  const [priceModifier, setPriceModifier] = useState("0"); const [priceType, setPriceType] = useState("fixed");
  const [skuModifier, setSkuModifier] = useState(""); const [imageUrl, setImageUrl] = useState("");
  const [colorHex, setColorHex] = useState("#000000"); const [isDefault, setIsDefault] = useState(false);

  useEffect(() => { if (!open) { setLabel(""); setValue(""); setPriceModifier("0"); setPriceType("fixed"); setSkuModifier(""); setImageUrl(""); setColorHex("#000000"); setIsDefault(false); } }, [open]);

  const handleSave = () => {
    if (!label.trim()) return;
    onSave({ fieldId: field?.id, label, value: value || label.toLowerCase().replace(/\s+/g,"_"), priceModifier, priceType, skuModifier, imageUrl: field?.type === "image_swatch" ? imageUrl : null, colorHex: field?.type === "color_swatch" ? colorHex : null, isDefault: String(isDefault) });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={`Add Choice — ${field?.title||""}`}
      primaryAction={{ content: "Add Choice", onAction: handleSave, disabled: !label.trim() }}
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="300">
          <InlineGrid columns={2} gap="300">
            <TextField label="Label" value={label} onChange={(v) => { setLabel(v); if (!value) setValue(v.toLowerCase().replace(/\s+/g,"_")); }} autoComplete="off" placeholder="e.g. 18K Gold" />
            <TextField label="Value (slug)" value={value} onChange={setValue} autoComplete="off" placeholder="e.g. 18k_gold" />
          </InlineGrid>
          <InlineGrid columns={3} gap="300">
            <TextField label="Price Modifier" type="number" value={priceModifier} onChange={setPriceModifier} autoComplete="off" prefix={priceType === "percentage" ? "%" : "$"} />
            <Select label="Price Type" options={PRICE_TYPE_OPTS} value={priceType} onChange={setPriceType} />
            <TextField label="SKU Modifier" value={skuModifier} onChange={setSkuModifier} autoComplete="off" placeholder="-18K" />
          </InlineGrid>
          {field?.type === "color_swatch" && (
            <InlineStack gap="300" blockAlign="center">
              <Text as="span" variant="bodySm">Color:</Text>
              <input type="color" value={colorHex} onChange={(e) => setColorHex(e.target.value)} style={{ width: "50px", height: "34px", cursor: "pointer", border: "1px solid #ccc", borderRadius: "4px" }} />
              <Text as="span" variant="bodySm" tone="subdued">{colorHex}</Text>
            </InlineStack>
          )}
          {field?.type === "image_swatch" && (
            <TextField label="Image URL" value={imageUrl} onChange={setImageUrl} autoComplete="off" placeholder="https://cdn.shopify.com/..." />
          )}
          <Checkbox label="Set as default value" checked={isDefault} onChange={setIsDefault} />
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

// ── Section Component ─────────────────────────────────────────────────────────
function SectionCard({ section, allFields, onAddField, onEditField, onDeleteField, onAddValue, onDeleteValue, onUpdate, onDelete }: { section: Section; allFields: Field[]; onAddField: (sId: string)=>void; onEditField: (f: Field, sId: string)=>void; onDeleteField: (id: string)=>void; onAddValue: (f: Field)=>void; onDeleteValue: (id: string)=>void; onUpdate: (id: string, d: any)=>void; onDelete: (id: string)=>void; }) {
  const [label, setLabel] = useState(section.label);
  const [visibility, setVisibility] = useState(section.visibility);
  const [makeIt, setMakeIt] = useState(section.makeIt);
  const [cols, setCols] = useState(String(section.columns));
  const [rows, setRows] = useState(String(section.rows));

  const save = (overrides: any = {}) => onUpdate(section.id, { label, visibility, makeIt, columns: cols, rows, ...overrides });

  const hasValues = (t: string) => ["dropdown","radio","checkbox","color_swatch","image_swatch"].includes(t);
  const typeLabel = (t: string) => FIELD_TYPES.find((o) => o.value === t)?.label || t;

  return (
    <Card padding="0">
      {/* Section header */}
      <Box padding="300" background="bg-surface-secondary">
        <BlockStack gap="200">
          <InlineStack align="space-between" blockAlign="center">
            <InlineStack gap="200" blockAlign="center">
              <Text as="span" variant="bodySm" tone="subdued">Section Label:</Text>
              <div style={{ minWidth: "180px" }}>
                <TextField label="" labelHidden value={label} onChange={(v) => { setLabel(v); }} onBlur={() => save()} autoComplete="off" />
              </div>
              <Button size="slim" tone="critical" variant="plain" onClick={() => onDelete(section.id)}>Remove</Button>
            </InlineStack>
            <InlineStack gap="200" blockAlign="center">
              <Text as="span" variant="bodySm">Columns:</Text>
              <div style={{ width: "72px" }}>
                <Select label="" labelHidden options={COL_OPTS} value={cols} onChange={(v) => { setCols(v); save({ columns: v }); }} />
              </div>
              <Text as="span" variant="bodySm">Rows:</Text>
              <div style={{ width: "72px" }}>
                <Select label="" labelHidden options={ROW_OPTS} value={rows} onChange={(v) => { setRows(v); save({ rows: v }); }} />
              </div>
            </InlineStack>
          </InlineStack>

          <InlineStack gap="200" blockAlign="center">
            <Text as="span" variant="bodySm">Visibility:</Text>
            <div style={{ width: "110px" }}>
              <Select label="" labelHidden options={VISIBILITY_OPTS} value={visibility} onChange={(v) => { setVisibility(v); save({ visibility: v }); }} />
            </div>
            <Text as="span" variant="bodySm">Make it:</Text>
            <div style={{ width: "120px" }}>
              <Select label="" labelHidden options={MAKEIT_OPTS} value={makeIt} onChange={(v) => { setMakeIt(v); save({ makeIt: v }); }} />
            </div>
            <Text as="span" variant="bodySm" tone="subdued">IF: (set conditional logic per field)</Text>
          </InlineStack>
        </BlockStack>
      </Box>

      {/* Fields grid */}
      <Box padding="300">
        <BlockStack gap="300">
          {section.fields.length === 0 ? (
            <Box padding="600" background="bg-surface-secondary" borderRadius="200">
              <BlockStack inlineAlign="center" gap="200">
                <Text as="p" variant="bodySm" tone="subdued">No options in this section yet</Text>
                <Button size="slim" onClick={() => onAddField(section.id)}>+ Add Option</Button>
              </BlockStack>
            </Box>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: "10px" }}>
              {section.fields.map((field) => (
                <div key={field.id} style={{ border: "1px solid #e1e3e5", borderRadius: "6px", padding: "10px", background: "#fff" }}>
                  <BlockStack gap="150">
                    <InlineStack align="space-between" blockAlign="start">
                      <BlockStack gap="050">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">{field.title}</Text>
                        <InlineStack gap="100">
                          <Text as="span" variant="bodySm" tone="subdued">{typeLabel(field.type)}</Text>
                          {field.required && <Badge tone="warning" size="small">Req</Badge>}
                          {field.price > 0 && <Badge tone="success" size="small">{field.priceType === "percentage" ? `+${field.price}%` : `+$${field.price}`}</Badge>}
                        </InlineStack>
                        {field.fieldCode && <Text as="span" variant="bodySm" tone="subdued">ID: {field.fieldCode}</Text>}
                      </BlockStack>
                      <InlineStack gap="100">
                        <Button size="slim" onClick={() => onEditField(field, section.id)}>Edit</Button>
                        <Button size="slim" tone="critical" onClick={() => onDeleteField(field.id)}>✕</Button>
                      </InlineStack>
                    </InlineStack>

                    {hasValues(field.type) && (
                      <BlockStack gap="100">
                        {field.values.map((v) => (
                          <InlineStack key={v.id} align="space-between" blockAlign="center">
                            <InlineStack gap="150" blockAlign="center">
                              {field.type === "color_swatch" && v.colorHex && (
                                <div style={{ width: "14px", height: "14px", borderRadius: "50%", background: v.colorHex, border: "1px solid #ddd", flexShrink: 0 }} />
                              )}
                              {field.type === "image_swatch" && v.imageUrl && (
                                <img src={v.imageUrl} alt={v.label} style={{ width: "18px", height: "18px", objectFit: "cover", borderRadius: "2px" }} />
                              )}
                              <Text as="span" variant="bodySm">{v.label}</Text>
                              {v.priceModifier !== 0 && (
                                <Text as="span" variant="bodySm" tone={v.priceModifier > 0 ? "success" : "critical"}>
                                  {v.priceModifier > 0 ? "+" : ""}{v.priceType === "percentage" ? `${v.priceModifier}%` : `$${v.priceModifier}`}
                                </Text>
                              )}
                            </InlineStack>
                            <button type="button" onClick={() => onDeleteValue(v.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#d72c0d", fontSize: "11px", padding: "2px" }}>✕</button>
                          </InlineStack>
                        ))}
                        <Button size="slim" onClick={() => onAddValue(field)}>+ Add Choice</Button>
                      </BlockStack>
                    )}
                  </BlockStack>
                </div>
              ))}
            </div>
          )}
          <Button onClick={() => onAddField(section.id)}>+ Add new option</Button>
        </BlockStack>
      </Box>

      {/* CSS Adjustments row (DPO has this at bottom) */}
      {section.fields.length > 0 && (
        <Box padding="300" borderBlockStartWidth="025" borderColor="border">
          <Text as="p" variant="bodySm" tone="subdued">CSS Adjustments (for advanced styling of this section)</Text>
        </Box>
      )}
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function EditProductOptions() {
  const { product } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  const sections = (product.sections as any[]) as Section[];
  const allFields = sections.flatMap((s) => s.fields);

  const [fieldModal, setFieldModal] = useState(false);
  const [editingField, setEditingField] = useState<Partial<Field>|null>(null);
  const [editSectionId, setEditSectionId] = useState("");
  const [valueModal, setValueModal] = useState(false);
  const [valueField, setValueField] = useState<Field|null>(null);

  // Notify on save
  useEffect(() => {
    if (navigation.state === "idle" && isLoading) {
      (window as any).shopify?.toast?.show("Saved");
    }
  });

  const fd = (intent: string, extra: Record<string, string>) => {
    const f = new FormData();
    f.set("intent", intent);
    Object.entries(extra).forEach(([k, v]) => f.set(k, v));
    submit(f, { method: "post" });
  };

  const handleAddSection = () => fd("create-section", { label: `Section ${sections.length + 1}`, columns: "3", rows: "3" });
  const handleRemoveAll = () => { if (confirm("Remove all sections and options?")) fd("remove-all-sections", {}); };
  const handleDeleteSection = (id: string) => { if (confirm("Delete this section and all its options?")) fd("delete-section", { sectionId: id }); };
  const handleUpdateSection = (id: string, data: any) => fd("update-section", { sectionId: id, ...Object.fromEntries(Object.entries(data).map(([k,v]) => [k, String(v)])) });

  const handleOpenAdd = (sId: string) => { setEditingField({ ...BLANK }); setEditSectionId(sId); setFieldModal(true); };
  const handleOpenEdit = (f: Field, sId: string) => { setEditingField(f); setEditSectionId(sId); setFieldModal(true); };

  const handleFieldSave = (data: any, isNew: boolean) => {
    if (data._delete) { fd("delete-field", { fieldId: data.fieldId }); return; }
    fd(isNew ? "create-field" : "update-field", { sectionId: editSectionId, ...data });
  };

  const handleDeleteField = (id: string) => {
    if (confirm("Delete this option?")) fd("delete-field", { fieldId: id });
  };

  const handleOpenValue = (f: Field) => { setValueField(f); setValueModal(true); };
  const handleValueSave = (data: any) => fd("create-value", data);
  const handleDeleteValue = (id: string) => fd("delete-value", { valueId: id });

  return (
    <Page
      title="Edit Custom Options"
      backAction={{ content: "Product Options", url: "/app/products" }}
      primaryAction={{ content: "Save", onAction: () => (window as any).shopify?.toast?.show("All changes auto-saved"), loading: isLoading }}
    >
      <Layout>
        {/* Left: editor */}
        <Layout.Section>
          <BlockStack gap="400">
            {/* DPO-style "Custom Options" card header */}
            <Card padding="0">
              <Box padding="300" background="bg-surface-secondary">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Custom Options</Text>
                  <InlineStack gap="200">
                    <Button onClick={handleAddSection}>Add New Section</Button>
                    {sections.length > 0 && (
                      <Button tone="critical" onClick={handleRemoveAll}>Remove All</Button>
                    )}
                  </InlineStack>
                </InlineStack>
              </Box>

              {sections.length === 0 && (
                <Box padding="800">
                  <BlockStack inlineAlign="center" gap="300">
                    <Text as="p" variant="bodyMd" tone="subdued" alignment="center">No sections yet. Click "Add New Section" to begin building your product options.</Text>
                    <Button variant="primary" onClick={handleAddSection}>+ Add New Section</Button>
                  </BlockStack>
                </Box>
              )}
            </Card>

            {/* Sections */}
            {sections.map((sec) => (
              <SectionCard
                key={sec.id}
                section={sec}
                allFields={allFields}
                onAddField={handleOpenAdd}
                onEditField={handleOpenEdit}
                onDeleteField={handleDeleteField}
                onAddValue={handleOpenValue}
                onDeleteValue={handleDeleteValue}
                onUpdate={handleUpdateSection}
                onDelete={handleDeleteSection}
              />
            ))}

            {/* DPO info notice */}
            {sections.length > 0 && (
              <Banner tone="info">
                <p>Options for the storefront: add the Configurator block to your product page template via the <strong>Theme Editor</strong>.</p>
              </Banner>
            )}
          </BlockStack>
        </Layout.Section>

        {/* Right: Product info sidebar */}
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">Product</Text>
                <Divider />
                {(product as any).shop?.shopDomain && (
                  <Thumbnail
                    source="https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-2_small.png"
                    alt={product.title}
                    size="medium"
                  />
                )}
                <Text as="p" variant="bodyMd" fontWeight="semibold">{product.title}</Text>
                <Text as="p" variant="bodySm" tone="subdued">Price: ${(product as any).basePrice?.toFixed(2) || "0.00"}</Text>
                <Link url={`https://admin.shopify.com/products/${(product as any).shopifyProductId}`} target="_blank">
                  Open product on Storefront
                </Link>
                <Divider />
                <Text as="p" variant="bodySm">
                  <strong>{sections.length}</strong> section{sections.length !== 1 ? "s" : ""} · <strong>{allFields.length}</strong> option{allFields.length !== 1 ? "s" : ""}
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">Form Style</Text>
                <Divider />
                <Text as="p" variant="bodySm" tone="subdued">CSS Adjustments (for advanced users) — use the Settings page to customize swatches, borders, tooltips and inject custom CSS.</Text>
                <Button url="/app/settings" size="slim">Open Settings</Button>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">Options for the product on Storefront</Text>
                <Divider />
                <Text as="p" variant="bodySm" tone="subdued">
                  For Options for the product to be displayed on all product pages, please let us know which product page query selectors for your Theme to use. Contact support for theme integration assistance.
                </Text>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      {/* Field Configuration Modal */}
      <OptionConfigModal
        open={fieldModal}
        field={editingField}
        sectionId={editSectionId}
        allFields={allFields}
        onClose={() => setFieldModal(false)}
        onSave={handleFieldSave}
      />

      {/* Add Choice Modal */}
      <AddValueModal
        open={valueModal}
        field={valueField}
        onClose={() => setValueModal(false)}
        onSave={handleValueSave}
      />
    </Page>
  );
}
