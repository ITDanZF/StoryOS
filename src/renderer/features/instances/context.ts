import { useOutletContext } from "react-router-dom";
import type { Dispatch, SetStateAction } from "react";
import type { InstanceSnapshot } from "../../../shared/contracts/instances/contracts.ts";

export type InstanceContext = {
  readonly snapshot: InstanceSnapshot;
  readonly setSnapshot: Dispatch<SetStateAction<InstanceSnapshot | null>>;
};

export function useInstanceContext(): InstanceContext {
  return useOutletContext<InstanceContext>();
}
