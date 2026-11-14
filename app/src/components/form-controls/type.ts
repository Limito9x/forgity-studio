import type { Control, FieldValues, Path } from "react-hook-form";

export interface BaseFormControlProps<T extends FieldValues> {
  control: Control<T, any, any>;
  name: Path<T>;
  label?: string;
  placeholder?: string;
  description?: string;
  className?: string;
  autoComplete?: React.HTMLInputAutoCompleteAttribute  // token chuẩn
  inputName?: string  // override name của input element nếu cần
  isRequired?: boolean;
  defaultValue?: any;
}

// Loại bỏ các thuộc tính của HTML Element trùng với React Hook Form để tránh xung đột
export type OmitFormProps<TProps> = Omit<
  TProps,
  "name" | "defaultValue" | "value" | "onChange" | "onBlur" | "autoComplete"
>;
