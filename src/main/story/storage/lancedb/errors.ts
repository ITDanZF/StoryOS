export class LanceDatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LanceDatabaseError";
  }
}

export class LancePathError extends LanceDatabaseError {
  constructor(message: string) {
    super(message);
    this.name = "LancePathError";
  }
}

export class LanceSchemaError extends LanceDatabaseError {
  constructor(message: string) {
    super(message);
    this.name = "LanceSchemaError";
  }
}

export class LanceDimensionError extends LanceDatabaseError {
  constructor(message: string) {
    super(message);
    this.name = "LanceDimensionError";
  }
}

export class LanceTableNotFoundError extends LanceDatabaseError {
  constructor(tableName: string) {
    super(`LanceDB table does not exist: ${tableName}`);
    this.name = "LanceTableNotFoundError";
  }
}

export class LanceClosedError extends LanceDatabaseError {
  constructor(target: string) {
    super(`${target} is closed.`);
    this.name = "LanceClosedError";
  }
}
