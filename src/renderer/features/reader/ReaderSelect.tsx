import type { ComponentProps } from "react";
import Select from "../../components/ui/Select.tsx";
/** Reader controls have their own skin, including the portaled option surface. */
export default function ReaderSelect(props: ComponentProps<typeof Select>) {
  return <Select {...props} triggerClassName="reader-select-trigger" popupClassName="reader-select-options" />;
}
