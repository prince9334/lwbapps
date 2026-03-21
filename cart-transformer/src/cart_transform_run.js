// @ts-check

/**
 * @typedef {import("../generated/api").CartTransformRunInput} CartTransformRunInput
 * @typedef {import("../generated/api").CartTransformRunResult} CartTransformRunResult
 */

/**
 * @type {CartTransformRunResult}
 */
const NO_CHANGES = {
  operations: [],
};

/**
 * @param {CartTransformRunInput} input
 * @returns {CartTransformRunResult}
 */
export function cartTransformRun(input) {
  const operations = input.cart.lines
    .filter(line => line.attribute && line.attribute.value)
    .map(line => {
      const adjustment = parseFloat(line.attribute.value);
      if (isNaN(adjustment)) return null;

      // This operation updates the cart line price to the configured total price
      return {
        update: {
          cartLineId: line.id,
          price: {
            adjustment: {
              fixedPricePerUnit: {
                amount: adjustment.toFixed(2)
              }
            }
          }
        }
      };
    })
    .filter(Boolean);

  return operations.length > 0 ? { operations } : NO_CHANGES;
}