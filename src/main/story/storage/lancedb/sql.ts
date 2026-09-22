import { LanceSchemaError } from "./errors.ts";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function requireIdentifier(name: string, label: string): string {
  if (!IDENTIFIER.test(name)) {
    throw new LanceSchemaError(`${label} must be a SQL identifier: ${name}`);
  }
  return name;
}

export function quoteIdentifier(name: string): string {
  requireIdentifier(name, "Identifier");
  return `"${name}"`;
}

export function sqlLiteral(value: string | number | boolean | bigint | null): string {
  if (value === null) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new LanceSchemaError("SQL numeric literals must be finite.");
    }
    return String(value);
  }
  if (typeof value === "bigint") return value.toString();
  return `'${value.replaceAll("'", "''")}'`;
}

export function sqlEquals(
  column: string,
  value: string | number | boolean | bigint | null,
): string {
  return `${quoteIdentifier(column)} = ${sqlLiteral(value)}`;
}

export function sqlAnd(predicates: readonly string[]): string {
  if (predicates.length === 0) {
    throw new LanceSchemaError("SQL AND requires at least one predicate.");
  }
  for (const predicate of predicates) {
    if (predicate.trim() === "") {
      throw new LanceSchemaError("SQL predicates must not be empty.");
    }
  }
  const [first, ...rest] = predicates;
  if (!first) {
    throw new LanceSchemaError("SQL AND requires at least one predicate.");
  }
  if (rest.length === 0) return first;
  return [first, ...rest].map((predicate) => `(${predicate})`).join(" AND ");
}

export function sqlIn(
  column: string,
  values: readonly (string | number | boolean | bigint)[],
): string {
  if (values.length === 0) {
    throw new LanceSchemaError("SQL IN requires at least one value.");
  }
  return `${quoteIdentifier(column)} IN (${values.map(sqlLiteral).join(", ")})`;
}

export function requirePredicate(predicate: string, label: string): string {
  if (predicate.trim() === "") {
    throw new LanceSchemaError(`${label} must not be empty.`);
  }
  return predicate;
}
