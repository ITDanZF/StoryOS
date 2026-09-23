export class OutlineRevisionConflict extends Error {
  readonly currentRevision: number;

  constructor(currentRevision: number) {
    super("OutlineRevisionConflict");
    this.name = "OutlineRevisionConflict";
    this.currentRevision = currentRevision;
  }
}

export class OutlineNotFound extends Error {
  constructor() {
    super("OutlineNotFound");
    this.name = "OutlineNotFound";
  }
}

export class OutlineContextTooLarge extends Error {
  constructor() {
    super("OutlineContextTooLarge");
    this.name = "OutlineContextTooLarge";
  }
}

export class OutlineValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutlineValidationError";
  }
}

export class OutlineRepairableError extends Error {
  readonly problems: readonly { readonly tempId: string | null; readonly message: string }[];

  constructor(problems: readonly { readonly tempId: string | null; readonly message: string }[]) {
    super(problems.map((problem) => problem.message).join("\n"));
    this.name = "OutlineRepairableError";
    this.problems = problems;
  }
}

export class OutlineProposalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutlineProposalError";
  }
}

export class OutlineModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutlineModelError";
  }
}
