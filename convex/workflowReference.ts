import { makeFunctionReference, type FunctionReference } from "convex/server";

/**
 * Workflow definitions receive their public arguments under the component's
 * `args` envelope. Convex cannot infer that envelope from a string reference,
 * so keep the single unavoidable cast at this shared boundary.
 */
export function makeInternalWorkflowReference<
  Args extends Record<string, unknown>,
  Result = string,
>(name: string): FunctionReference<"mutation", "internal", { args: Args }, Result> {
  return makeFunctionReference(name) as unknown as FunctionReference<
    "mutation",
    "internal",
    { args: Args },
    Result
  >;
}
