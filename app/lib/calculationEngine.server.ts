/**
 * Formula Calculation Engine
 * ─────────────────────────
 * Safely evaluates formula strings like:
 *   "engraving_length * 5"
 *   "width * height * price_per_unit"
 *   "(quantity - 1) * 10 + 50"
 *
 * SECURITY: Uses a restricted evaluator (no eval/Function constructor).
 * Only arithmetic operators and named variables from selections are allowed.
 */

export interface CalcVariables {
  [key: string]: number;
}

/** Tokenize the formula into numbers, operators, parens, and identifiers. */
function tokenize(formula: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < formula.length) {
    const ch = formula[i];
    if (/\s/.test(ch)) { i++; continue; }

    if (/[0-9.]/.test(ch)) {
      let num = "";
      while (i < formula.length && /[0-9.]/.test(formula[i])) num += formula[i++];
      tokens.push(num);
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let id = "";
      while (i < formula.length && /[a-zA-Z_0-9]/.test(formula[i])) id += formula[i++];
      tokens.push(id);
      continue;
    }

    if (['+', '-', '*', '/', '(', ')'].includes(ch)) {
      tokens.push(ch);
      i++;
      continue;
    }

    // Unknown character — skip
    i++;
  }
  return tokens;
}

/**
 * Recursive descent parser / evaluator.
 * Grammar:
 *   expr   = term (('+' | '-') term)*
 *   term   = factor (('*' | '/') factor)*
 *   factor = number | identifier | '(' expr ')' | '-' factor
 */
class Parser {
  private tokens: string[];
  private pos: number;
  private vars: CalcVariables;

  constructor(tokens: string[], vars: CalcVariables) {
    this.tokens = tokens;
    this.pos = 0;
    this.vars = vars;
  }

  private peek(): string | undefined {
    return this.tokens[this.pos];
  }

  private consume(): string {
    return this.tokens[this.pos++];
  }

  private parseFactor(): number {
    const tok = this.peek();
    if (tok === undefined) return 0;

    if (tok === '(') {
      this.consume(); // '('
      const val = this.parseExpr();
      this.consume(); // ')'
      return val;
    }

    if (tok === '-') {
      this.consume();
      return -this.parseFactor();
    }

    const num = parseFloat(tok);
    if (!isNaN(num)) {
      this.consume();
      return num;
    }

    // identifier — look up in variables
    this.consume();
    const varVal = this.vars[tok];
    return typeof varVal === 'number' ? varVal : 0;
  }

  private parseTerm(): number {
    let result = this.parseFactor();
    while (this.peek() === '*' || this.peek() === '/') {
      const op = this.consume();
      const right = this.parseFactor();
      if (op === '*') result *= right;
      else result = right !== 0 ? result / right : 0;
    }
    return result;
  }

  parseExpr(): number {
    let result = this.parseTerm();
    while (this.peek() === '+' || this.peek() === '-') {
      const op = this.consume();
      const right = this.parseTerm();
      if (op === '+') result += right;
      else result -= right;
    }
    return result;
  }
}

/**
 * Evaluate a formula string given a map of variable values.
 * Returns 0 on any parse/evaluation error.
 */
export function evaluateFormula(formula: string, variables: CalcVariables): number {
  try {
    const tokens = tokenize(formula);
    const parser = new Parser(tokens, variables);
    const result = parser.parseExpr();
    return isFinite(result) ? Math.round(result * 100) / 100 : 0;
  } catch {
    return 0;
  }
}

/**
 * Extract variable names referenced in a formula.
 */
export function extractVariables(formula: string): string[] {
  const tokens = tokenize(formula);
  return tokens.filter(t => /^[a-zA-Z_]/.test(t));
}
