import { useEffect, useState } from "react";
import { createOperations } from "./operations";

// One operation tracker per mounted page or hook. Unmounting cancels its work, so no late result
// reaches a component that is gone or a remount that shows another identity.
export function useOperations() {
  const [operations] = useState(createOperations);
  useEffect(() => () => operations.cancelAll(), [operations]);
  return operations;
}
