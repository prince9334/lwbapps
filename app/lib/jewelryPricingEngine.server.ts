/**
 * Jewelry Pricing Engine
 * ──────────────────────
 * Implements the Magento-style dynamic pricing logic for jewelry.
 */

export interface JewelrySelections {
  material?: string;
  ring_size?: number;
  his_ring_size?: number;
  her_ring_size?: number;
  width?: number;
  his_width?: number;
  her_width?: number;
  thickness?: number;
  his_thickness?: number;
  her_thickness?: number;
  stone_weight?: number;
  stone_count?: number;
}

export interface MetalConfig {
  material: string;
  density: number;
  pricePerGram: number;
}

export interface StonePriceConfig {
  minCarat: number;
  maxCarat: number;
  pricePerCarat: number;
}

const PI = 3.14159;
const DIVIDER = 100;
const LABOR_COST_PER_MM = 5;
const SETTING_COST_PER_STONE = 20;
const SHIPPING_COST_FIXED = 10;
const MARGIN_MULTIPLIER = 1.5;

export function calculateJewelryPrice(
  selections: JewelrySelections,
  metals: MetalConfig[],
  stonePrices: StonePriceConfig[]
) {
  const material = selections.material || "14K";
  const stone_weight = selections.stone_weight || 0;
  const stone_count = selections.stone_count || 0;

  const rings = [];
  if (selections.ring_size) {
    rings.push({ 
      size: selections.ring_size, 
      width: selections.width || 4, 
      thickness: selections.thickness || 2 
    });
  } else if (selections.his_ring_size || selections.her_ring_size) {
    if (selections.his_ring_size) {
      rings.push({ 
        size: selections.his_ring_size, 
        width: selections.his_width || selections.width || 6, 
        thickness: selections.his_thickness || selections.thickness || 2 
      });
    }
    if (selections.her_ring_size) {
      rings.push({ 
        size: selections.her_ring_size, 
        width: selections.her_width || selections.width || 6, 
        thickness: selections.her_thickness || selections.thickness || 2 
      });
    }
  } else {
    // Default fallback
    rings.push({ size: 6, width: 4, thickness: 2 });
  }

  let totalWeight14K = 0;
  let totalLaborCost = 0;

  for (const ring of rings) {
    const radius = 7.5 + ((ring.size - 4) / 0.25) * 0.1;
    const weight = (PI * ring.width * ring.thickness * (2 * radius + ring.thickness)) / DIVIDER;
    totalWeight14K += weight;
    totalLaborCost += ring.width * LABOR_COST_PER_MM;
  }

  // 3. Material Density Adjustment
  const metal = metals.find((m) => m.material.toUpperCase() === material.toUpperCase()) || 
                { material: "14K", density: 1.0, pricePerGram: 35 };
  
  const finalWeight = totalWeight14K * metal.density;

  // 4. Metal Cost
  const metalCost = finalWeight * metal.pricePerGram;

  // 5. Stone Price Calculation
  let pricePerCarat = 0;
  if (stone_weight > 0) {
    const matchedStone = stonePrices.find(
      (s) => stone_weight >= s.minCarat && stone_weight < s.maxCarat
    );
    pricePerCarat = matchedStone ? matchedStone.pricePerCarat : 0;
  }
  const stoneCost = stone_weight * pricePerCarat * stone_count;

  // 6. Additional Costs
  const settingCost = stone_count * SETTING_COST_PER_STONE;
  const shippingCost = SHIPPING_COST_FIXED;

  // 7. Final Price Formula
  const subtotal = metalCost + stoneCost + totalLaborCost + settingCost + shippingCost;
  const finalPrice = subtotal * MARGIN_MULTIPLIER;

  return {
    finalPrice: Math.round(finalPrice * 100) / 100,
    breakdown: {
      metalWeight: Math.round(finalWeight * 100) / 100,
      metalCost: Math.round(metalCost * 100) / 100,
      stoneCost: Math.round(stoneCost * 100) / 100,
      laborCost: Math.round(totalLaborCost * 100) / 100,
      settingCost: Math.round(settingCost * 100) / 100,
      shippingCost: Math.round(shippingCost * 100) / 100,
      subtotal: Math.round(subtotal * 100) / 100,
      margin: Math.round((finalPrice - subtotal) * 100) / 100,
    }
  };
}

export function generateJewelrySKU(productCode: string, selections: JewelrySelections): string {
  const parts = [productCode.toUpperCase()];
  
  parts.push(String(selections.material || "UNK").toUpperCase());
  
  if (selections.his_ring_size) parts.push(`H${selections.his_ring_size}`);
  if (selections.her_ring_size) parts.push(`W${selections.her_ring_size}`);
  if (!selections.his_ring_size && !selections.her_ring_size && selections.ring_size) {
    parts.push(`S${selections.ring_size}`);
  }
  
  if (selections.width) parts.push(`W${selections.width}`);
  else if (selections.his_width || selections.her_width) {
    parts.push(`W${selections.his_width || selections.her_width}`);
  }

  if (selections.stone_weight) {
    const stoneType = "DIA"; // Default to DIA for now as per example
    parts.push(`${stoneType}${String(selections.stone_weight).replace(".", "")}`);
  }

  return parts.join("-");
}
