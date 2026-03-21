// Rule Engine — evaluates conditional logic for DPO field visibility and actions
// Runs on the server for validation; the storefront JS mirrors this logic

export type Operator =
  | "=" | "!=" | ">" | "<" | ">=" | "<="
  | "contains" | "not_contains"
  | "is_empty" | "is_not_empty";

export type ActionType =
  | "show" | "hide" | "enable" | "disable"
  | "set_value" | "add_price" | "remove_price";

export interface FieldCondition {
  conditionFieldId: string; // field ID to check
  operator: Operator;
  conditionValue?: string;
}

export interface FieldRule {
  fieldId: string;           // field that owns this rule (source)
  conditionFieldId: string;
  operator: Operator;
  conditionValue?: string | null;
  actionType: ActionType;
  actionTarget: string;      // field ID or "self"
  actionValue?: string | null;
}

export interface Selections {
  [fieldId: string]: string | number | string[];
}

export interface RuleResult {
  visibleFields: Set<string>;
  hiddenFields: Set<string>;
  requiredFields: Set<string>;
  disabledFields: Set<string>;
}

/**
 * Evaluates a single condition against current selections.
 */
function matchCondition(
  condition: FieldCondition,
  selections: Selections
): boolean {
  const raw = selections[condition.conditionFieldId];
  const selVal = Array.isArray(raw) ? raw.join(",") : String(raw ?? "");
  const condVal = String(condition.conditionValue ?? "");

  switch (condition.operator) {
    case "=":
      return selVal.toLowerCase() === condVal.toLowerCase();
    case "!=":
      return selVal.toLowerCase() !== condVal.toLowerCase();
    case ">":
      return parseFloat(selVal) > parseFloat(condVal);
    case "<":
      return parseFloat(selVal) < parseFloat(condVal);
    case ">=":
      return parseFloat(selVal) >= parseFloat(condVal);
    case "<=":
      return parseFloat(selVal) <= parseFloat(condVal);
    case "contains":
      return selVal.toLowerCase().includes(condVal.toLowerCase());
    case "not_contains":
      return !selVal.toLowerCase().includes(condVal.toLowerCase());
    case "is_empty":
      return selVal.trim() === "";
    case "is_not_empty":
      return selVal.trim() !== "";
    default:
      return false;
  }
}

/**
 * Evaluates all rules against current selections.
 * Returns a RuleResult with sets of field IDs for each state.
 */
export function evaluateRules(
  rules: FieldRule[],
  selections: Selections,
  allFieldIds: string[]
): RuleResult {
  // Start with all fields visible
  const result: RuleResult = {
    visibleFields: new Set(allFieldIds),
    hiddenFields: new Set(),
    requiredFields: new Set(),
    disabledFields: new Set(),
  };

  for (const rule of rules) {
    const conditionMet = matchCondition(
      {
        conditionFieldId: rule.conditionFieldId,
        operator: rule.operator,
        conditionValue: rule.conditionValue ?? undefined,
      },
      selections
    );

    if (!conditionMet) continue;

    const target = rule.actionTarget === "self" ? rule.fieldId : rule.actionTarget;

    switch (rule.actionType) {
      case "show":
        result.visibleFields.add(target);
        result.hiddenFields.delete(target);
        break;
      case "hide":
        result.hiddenFields.add(target);
        result.visibleFields.delete(target);
        break;
      case "enable":
        result.disabledFields.delete(target);
        break;
      case "disable":
        result.disabledFields.add(target);
        break;
      case "set_value":
        // Value override is applied client-side; server validates
        break;
      case "add_price":
      case "remove_price":
        // Handled by pricing engine
        break;
    }
  }

  return result;
}

/**
 * Parses condition_json from a field/section and returns conditions array.
 * condition_json format: [{ conditionFieldId, operator, conditionValue }]
 */
export function parseConditionJson(json: string | null | undefined): FieldCondition[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as FieldCondition[];
  } catch {
    return [];
  }
}

/**
 * Quick check: given a field's conditionJson and current selections,
 * should the field be visible?
 */
export function isFieldVisible(
  conditionJson: string | null | undefined,
  visibility: string,
  makeIt: string,
  selections: Selections
): boolean {
  const conditions = parseConditionJson(conditionJson);
  if (conditions.length === 0) {
    return visibility === "visible";
  }
  // All conditions must match (AND logic)
  const allMatch = conditions.every((c) => matchCondition(c, selections));
  if (allMatch) {
    return makeIt === "visible" || makeIt === "required";
  }
  return visibility === "visible";
}
