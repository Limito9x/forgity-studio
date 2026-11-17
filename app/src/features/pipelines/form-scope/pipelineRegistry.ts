import { z } from "zod";
import { ScopedFieldRegistry, baseRegistry } from "@/lib/field-registry";
import { FormPinVariableSelect } from "../form-controls/FormPinVariableSelect";
import { FormPinAssetUpload } from "../form-controls/FormPinAssetUpload";
import { FormPinPathInput } from "../form-controls/FormPinPathInput";
import { FormPinTextInput } from "../form-controls/FormPinTextInput";

const createRequiredStringSchema = (props: any, field?: any) => {
  const isReq = props?.required === true;
  const msg = `${field?.label || field?.name || "This field"} is required`;
  return isReq
    ? z.string({ message: msg }).min(1, msg)
    : z.string().optional().nullable();
};

const createPathInputSchema = (props: any, field?: any) => {
  const isReq = props?.required === true;
  const msg = `${field?.label || field?.name || "This field"} is required`;
  if (props?.multiple) {
    return isReq
      ? z.array(z.string(), { message: msg }).min(1, msg)
      : z.array(z.string()).optional().nullable();
  }
  return createRequiredStringSchema(props, field);
};

/**
 * Sàn Registry dành riêng cho Pipeline Inspector và Pipeline Form.
 * Kế thừa toàn bộ các Form Control cơ sở (input, number, switch, select, textarea, tagsInput, keyValue, v.v.)
 * từ baseRegistry, và đăng ký thêm các control đặc thù của Pipeline.
 */
export const pipelineRegistry = new ScopedFieldRegistry(baseRegistry);

// Override standard "input" in pipeline scope to provide `${...}` constant hints automatically
pipelineRegistry.register({
  type: "input",
  component: FormPinTextInput,
  buildSchema: baseRegistry.get("input")?.buildSchema,
});

// Đăng ký trực tiếp các Pipeline-specific form controls vào sàn kèm buildSchema
pipelineRegistry.register({
  type: "pin:variableSelect",
  component: FormPinVariableSelect,
  buildSchema: createRequiredStringSchema,
});

pipelineRegistry.register({
  type: "pin:assetUpload",
  component: FormPinAssetUpload,
  buildSchema: (props: any, field?: any) => {
    const isReq = props?.required === true;
    const msg = `${field?.label || field?.name || "File upload"} is required`;
    return isReq
      ? z
          .any()
          .refine(
            (val) => val !== undefined && val !== null && val !== "",
            { message: msg }
          )
      : z.any().optional().nullable();
  },
});

pipelineRegistry.register({
  type: "pin:path",
  component: FormPinPathInput,
  buildSchema: createPathInputSchema,
});

pipelineRegistry.register({
  type: "pin:pathInput",
  component: FormPinPathInput,
  buildSchema: createPathInputSchema,
});


