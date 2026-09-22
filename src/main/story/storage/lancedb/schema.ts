import {
  Bool,
  Field,
  FixedSizeList,
  Float32,
  Float64,
  Int32,
  Int64,
  Schema,
  Utf8,
  type DataType,
} from "apache-arrow";
import { LanceDimensionError, LanceSchemaError } from "./errors.ts";
import { requireIdentifier } from "./sql.ts";

export type LanceScalarKind = "utf8" | "int32" | "int64" | "float32" | "float64" | "bool";

export type LanceColumnType =
  | { readonly kind: LanceScalarKind; readonly nullable?: boolean }
  | { readonly kind: "vector"; readonly dimensions: number; readonly nullable?: boolean };

export type LanceColumn = {
  readonly name: string;
  readonly type: LanceColumnType;
};

export type LanceTableSchema = {
  readonly columns: readonly LanceColumn[];
};

export type LanceRecord = Record<string, unknown>;

export type LanceVectorColumn = {
  readonly name: string;
  readonly dimensions: number;
  readonly nullable: boolean;
};

export type InspectedLanceSchema = {
  readonly columns: readonly LanceColumn[];
  readonly vectorColumns: readonly LanceVectorColumn[];
};

function isNullable(type: LanceColumnType): boolean {
  return type.nullable === true;
}

export function requireDimensions(dimensions: number, label: string): number {
  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new LanceSchemaError(`${label} must be a positive integer.`);
  }
  return dimensions;
}

export function inspectLanceSchema(schema: LanceTableSchema): InspectedLanceSchema {
  if (schema.columns.length === 0) {
    throw new LanceSchemaError("LanceDB table schema requires at least one column.");
  }
  const names = new Set<string>();
  const vectorColumns: LanceVectorColumn[] = [];
  const columns: LanceColumn[] = [];
  for (const column of schema.columns) {
    const name = requireIdentifier(column.name, "Column name");
    if (names.has(name)) {
      throw new LanceSchemaError(`Duplicate column name: ${name}`);
    }
    names.add(name);
    if (column.type.kind === "vector") {
      const dimensions = requireDimensions(column.type.dimensions, `Vector column ${name} dimensions`);
      vectorColumns.push({
        name,
        dimensions,
        nullable: isNullable(column.type),
      });
      columns.push({
        name,
        type: { kind: "vector", dimensions, nullable: column.type.nullable },
      });
      continue;
    }
    columns.push({
      name,
      type: { kind: column.type.kind, nullable: column.type.nullable },
    });
  }
  return { columns, vectorColumns };
}

export function requireVectorColumn(
  schema: InspectedLanceSchema,
  columnName?: string,
): LanceVectorColumn {
  if (columnName !== undefined) {
    const found = schema.vectorColumns.find((column) => column.name === columnName);
    if (!found) {
      throw new LanceSchemaError(`Vector column does not exist: ${columnName}`);
    }
    return found;
  }
  if (schema.vectorColumns.length === 0) {
    throw new LanceSchemaError("LanceDB table has no vector column.");
  }
  if (schema.vectorColumns.length > 1) {
    throw new LanceSchemaError("LanceDB table has multiple vector columns; specify column.");
  }
  const [vectorColumn] = schema.vectorColumns;
  if (!vectorColumn) {
    throw new LanceSchemaError("LanceDB table has no vector column.");
  }
  return vectorColumn;
}

function arrowField(column: LanceColumn): Field {
  const nullable = isNullable(column.type);
  switch (column.type.kind) {
    case "utf8":
      return new Field(column.name, new Utf8(), nullable);
    case "int32":
      return new Field(column.name, new Int32(), nullable);
    case "int64":
      return new Field(column.name, new Int64(), nullable);
    case "float32":
      return new Field(column.name, new Float32(), nullable);
    case "float64":
      return new Field(column.name, new Float64(), nullable);
    case "bool":
      return new Field(column.name, new Bool(), nullable);
    case "vector":
      return new Field(
        column.name,
        new FixedSizeList(
          column.type.dimensions,
          new Field("item", new Float32(), true),
        ),
        nullable,
      );
  }
}

export function toArrowSchema(schema: LanceTableSchema): Schema {
  const inspected = inspectLanceSchema(schema);
  return new Schema(inspected.columns.map(arrowField));
}

function typeIdOf(type: DataType | { readonly typeId?: number }): number | undefined {
  return "typeId" in type ? type.typeId : undefined;
}

function bitWidthOf(type: { readonly bitWidth?: number }): number | undefined {
  return type.bitWidth;
}

function listSizeOf(type: { readonly listSize?: number }): number | undefined {
  return type.listSize;
}

function childTypeOf(type: {
  readonly valueField?: { readonly type: DataType };
  readonly children?: ReadonlyArray<{ readonly type: DataType }>;
}): DataType | undefined {
  return type.valueField?.type ?? type.children?.[0]?.type;
}

function arrowTypeToLance(name: string, type: DataType, nullable: boolean): LanceColumnType {
  const typeId = typeIdOf(type);
  if (typeId === 5) return { kind: "utf8", nullable };
  if (typeId === 6) return { kind: "bool", nullable };
  if (typeId === 2) {
    const bitWidth = bitWidthOf(type as { bitWidth?: number });
    if (bitWidth === 32) return { kind: "int32", nullable };
    if (bitWidth === 64) return { kind: "int64", nullable };
  }
  if (typeId === 3) {
    const precision = "precision" in type ? type.precision : undefined;
    if (precision === 1) return { kind: "float32", nullable };
    if (precision === 2) return { kind: "float64", nullable };
  }
  if (typeId === 16) {
    const dimensions = listSizeOf(type as { listSize?: number });
    const child = childTypeOf(type as {
      valueField?: { type: DataType };
      children?: Array<{ type: DataType }>;
    });
    const childId = child ? typeIdOf(child) : undefined;
    const childPrecision = child && "precision" in child ? child.precision : undefined;
    if (
      typeof dimensions === "number" &&
      Number.isInteger(dimensions) &&
      dimensions > 0 &&
      childId === 3 &&
      childPrecision === 1
    ) {
      return { kind: "vector", dimensions, nullable };
    }
  }
  throw new LanceSchemaError(`Unsupported Arrow field ${name}: ${String(type)}`);
}

export function fromArrowSchema(schema: Schema): InspectedLanceSchema {
  const columns: LanceColumn[] = schema.fields.map((field) => ({
    name: field.name,
    type: arrowTypeToLance(field.name, field.type, field.nullable),
  }));
  return inspectLanceSchema({ columns });
}

export function assertSchemaCompatible(
  expected: InspectedLanceSchema,
  actual: InspectedLanceSchema,
): void {
  if (expected.columns.length !== actual.columns.length) {
    throw new LanceSchemaError(
      `LanceDB schema column count mismatch: expected ${expected.columns.length}, got ${actual.columns.length}.`,
    );
  }
  for (const [index, column] of expected.columns.entries()) {
    const other = actual.columns[index];
    if (!other) {
      throw new LanceSchemaError(
        `LanceDB schema column count mismatch: expected ${expected.columns.length}, got ${actual.columns.length}.`,
      );
    }
    if (column.name !== other.name) {
      throw new LanceSchemaError(
        `LanceDB schema column order mismatch at ${index}: expected ${column.name}, got ${other.name}.`,
      );
    }
    if (column.type.kind !== other.type.kind) {
      throw new LanceSchemaError(
        `LanceDB schema type mismatch for ${column.name}: expected ${column.type.kind}, got ${other.type.kind}.`,
      );
    }
    if (column.type.kind === "vector" && other.type.kind === "vector") {
      if (column.type.dimensions !== other.type.dimensions) {
        throw new LanceDimensionError(
          `LanceDB vector dimensions mismatch for ${column.name}: expected ${column.type.dimensions}, got ${other.type.dimensions}.`,
        );
      }
    }
  }
}

function asFiniteNumber(value: unknown, label: string): number {
  if (typeof value === "bigint") {
    if (value < Number.MIN_SAFE_INTEGER || value > Number.MAX_SAFE_INTEGER) {
      throw new LanceSchemaError(`${label} exceeds JavaScript safe integer range.`);
    }
    return Number(value);
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new LanceSchemaError(`${label} must be a finite number.`);
  }
  return value;
}

function asVectorArray(value: unknown, label: string): number[] {
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return Array.from(value as unknown as ArrayLike<number>, (item, index) =>
      asFiniteNumber(item, `${label}[${index}]`),
    );
  }
  if (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { toArray?: unknown }).toArray === "function"
  ) {
    return asVectorArray((value as { toArray: () => unknown }).toArray(), label);
  }
  if (!Array.isArray(value)) {
    throw new LanceSchemaError(`${label} must be a number array.`);
  }
  return value.map((item, index) => asFiniteNumber(item, `${label}[${index}]`));
}

export function requireVectorValues(
  value: unknown,
  dimensions: number,
  label: string,
): number[] {
  const vector = asVectorArray(value, label);
  if (vector.length !== dimensions) {
    throw new LanceDimensionError(
      `${label} has ${vector.length} dimensions; expected ${dimensions}.`,
    );
  }
  return vector;
}

function convertCell(value: unknown, label: string): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new LanceSchemaError(`${label} must be finite.`);
    }
    return value;
  }
  if (typeof value === "bigint") return asFiniteNumber(value, label);
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return asVectorArray(value, label);
  }
  if (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { toArray?: unknown }).toArray === "function"
  ) {
    return asVectorArray(value, label);
  }
  throw new LanceSchemaError(`${label} has an unsupported value type.`);
}

export function normalizeRecord(row: LanceRecord, schema: InspectedLanceSchema): LanceRecord {
  const normalized: LanceRecord = {};
  for (const column of schema.columns) {
    if (!Object.prototype.hasOwnProperty.call(row, column.name)) {
      if (column.type.nullable === true) {
        normalized[column.name] = null;
        continue;
      }
      throw new LanceSchemaError(`Missing required column: ${column.name}`);
    }
    const value = row[column.name];
    if (value === null || value === undefined) {
      if (column.type.nullable !== true) {
        throw new LanceSchemaError(`Column ${column.name} is not nullable.`);
      }
      normalized[column.name] = null;
      continue;
    }
    if (column.type.kind === "vector") {
      normalized[column.name] = requireVectorValues(
        value,
        column.type.dimensions,
        `Column ${column.name}`,
      );
      continue;
    }
    normalized[column.name] = convertCell(value, `Column ${column.name}`);
  }
  return normalized;
}

export function normalizeResultRow(row: Record<string, unknown>): LanceRecord {
  const normalized: LanceRecord = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === "_distance") {
      normalized._distance = asFiniteNumber(value, "distance");
      continue;
    }
    normalized[key] = convertCell(value, `Column ${key}`);
  }
  return normalized;
}
