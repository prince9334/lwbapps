// Upgraded Pricing Engine — supports DPO field model
// Handles fixed, percentage, per-character, and formula-based pricing

import type { Selections } from "./ruleEngine.server";
import { evaluateFormula } from "./calculationEngine.server";

export interface FieldPricingConfig {
  id: string;
  type: string;
  title: string;
  price: number;
  priceType: string; // fixed | percentage
  values: {
    value: string;
    priceModifier: number;
    priceType: string;
  }[];
}

export interface CalculationConfig {
  id: string;
  name: string;
  formula: string;
  variables: string[];
}

export interface DPOPricingConfig {
  basePrice: number;
  engravingRate: number;
  fields: FieldPricingConfig[];
  calculations: CalculationConfig[];
}

export interface PriceBreakdown {
  [label: string]: number;
}

export interface PriceResult {
  finalPrice: number;
  breakdown: PriceBreakdown;
}

/**
 * Main DPO price calculation.
 * final_price = base_price + Σ(field modifiers) + Σ(formula results)
 */
export function calculateDPOPrice(
  config: DPOPricingConfig,
  selections: Selections,
  visibleFieldIds: Set<string>
): PriceResult {
  const breakdown: PriceBreakdown = {};
  let finalPrice = config.basePrice;
  breakdown["Base Price"] = config.basePrice;

  // 1. Apply field-level price modifiers (only visible fields)
  for (const field of config.fields) {
    if (!visibleFieldIds.has(field.id)) continue;

    const selected = selections[field.id];
    if (selected === undefined || selected === "" || selected === null) continue;

    // Direct field price (e.g. flat $10 for any value entered)
    if (field.price > 0) {
      if (field.priceType === "percentage") {
        const pct = (config.basePrice * field.price) / 100;
        finalPrice += pct;
        breakdown[`${field.title} (+${field.price}%)`] = pct;
      } else {
        // For text/number types, charge the flat price once (field-level)
        if (["input","textarea","date","file_upload"].includes(field.type)) {
          finalPrice += field.price;
          breakdown[`${field.title}`] = field.price;
        }
      }
    }

    // Value-level modifiers for choice-based fields
    if (["dropdown","radio","checkbox","color_swatch","image_swatch"].includes(field.type)) {
      const selectedValues = Array.isArray(selected) ? selected : [String(selected)];
      for (const sel of selectedValues) {
        const matched = field.values.find(
          (v) => v.value.toLowerCase() === sel.toLowerCase()
        );
        if (matched && matched.priceModifier !== 0) {
          if (matched.priceType === "percentage") {
            const pct = (config.basePrice * matched.priceModifier) / 100;
            finalPrice += pct;
            breakdown[`${field.title}: ${sel} (+${matched.priceModifier}%)`] = pct;
          } else {
            finalPrice += matched.priceModifier;
            breakdown[`${field.title}: ${sel}`] = matched.priceModifier;
          }
        }
      }
    }

    // Per-character for text fields with price = 0 (uses engraving rate)
    if (["input","textarea"].includes(field.type) && field.price === 0 && config.engravingRate > 0) {
      const text = String(selected);
      if (text.length > 0) {
        const cost = text.length * config.engravingRate;
        finalPrice += cost;
        breakdown[`${field.title} (${text.length} chars × $${config.engravingRate})`] = cost;
      }
    }

    // Range slider / step counter — multiply value by field.price
    if (["range_slider","step_counter","number"].includes(field.type) && field.price > 0) {
      const numVal = parseFloat(String(selected)) || 0;
      if (field.priceType === "percentage") {
        const pct = (config.basePrice * field.price * numVal) / 100;
        finalPrice += pct;
        breakdown[`${field.title} (${numVal} × ${field.price}%)`] = pct;
      } else {
        const cost = numVal * field.price;
        finalPrice += cost;
        breakdown[`${field.title} (${numVal} × $${field.price})`] = cost;
      }
    }
  }

  // 2. Formula-based calculations
  const variables: Record<string, number> = {};
  for (const field of config.fields) {
    const sel = selections[field.id];
    if (sel !== undefined) {
      // Use snake_case field title as variable name
      const varName = field.title.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
      variables[varName] = typeof sel === "number" ? sel : parseFloat(String(sel)) || String(sel).length;
    }
  }

  for (const calc of config.calculations) {
    try {
      const result = evaluateFormula(calc.formula, variables);
      if (typeof result === "number" && result > 0) {
        finalPrice += result;
        breakdown[calc.name] = result;
      }
    } catch {
      // Formula evaluation error — skip
    }
  }

  return {
    finalPrice: Math.max(0, Math.round(finalPrice * 100) / 100),
    breakdown,
  };
}
