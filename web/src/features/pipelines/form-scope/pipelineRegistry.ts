import { z } from "zod";
import { ScopedFieldRegistry, baseRegistry } from "@/lib/field-registry";
import { FormPinVariableSelect } from "../form-controls/FormPinVariableSelect";
import { FormPinEntitySelect } from "../form-controls/FormPinEntitySelect";
import { FormPinAssetUpload } from "../form-controls/FormPinAssetUpload";
import { FormPinPathInput } from "../form-controls/FormPinPathInput";
import { FormPinTagTreeSelect } from "../form-controls/FormPinTagTreeSelect";
import { FormPinRunnerSelect } from "../form-controls/FormPinRunnerSelect";
import { FormPinRepositorySelect } from "../form-controls/FormPinRepositorySelect";

const createRequiredStringSchema = (props: any, field?: any) => {
  const isReq = props?.required === true;
  const msg = `${field?.label || field?.name || "This field"} is required`;
  return isReq
    ? z.string({ message: msg }).min(1, msg)
    : z.string().optional().nullable();
};

/**
 * Sàn Registry dành riêng cho Pipeline Inspector và Pipeline Form.
 * Kế thừa toàn bộ các Form Control cơ sở (input, number, switch, select, textarea, tagsInput, keyValue, v.v.)
 * từ baseRegistry, và đăng ký thêm các control đặc thù của Pipeline.
 */
export const pipelineRegistry = new ScopedFieldRegistry(baseRegistry);

// Đăng ký trực tiếp các Pipeline-specific form controls vào sàn kèm buildSchema
pipelineRegistry.register({
  type: "pin:variableSelect",
  component: FormPinVariableSelect,
  buildSchema: createRequiredStringSchema,
});

const KNOWN_PLACEHOLDERS = ["resource", "repository", "workspace", "contenttype", "runner", "agent", "tag", "taggroup", "variable", "none"];

pipelineRegistry.register({
  type: "pin:entitySelect",
  component: FormPinEntitySelect,
  buildSchema: (props: any, field?: any) => {
    const isReq = props?.required === true;
    const msg = `${field?.label || field?.name || "This field"} is required`;
    if (props?.multiple) {
      return isReq
        ? z.array(z.string()).min(1, msg)
        : z.array(z.string()).optional().default([]);
    }
    if (!isReq) return z.string().optional().nullable();
    return z
      .string({ message: msg })
      .min(1, msg)
      .refine(
        (val) => Boolean(val) && !KNOWN_PLACEHOLDERS.includes(val.trim().toLowerCase()),
        { message: msg }
      );
  },
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
  buildSchema: createRequiredStringSchema,
});

pipelineRegistry.register({
  type: "pin:tagTreeSelect",
  component: FormPinTagTreeSelect,
  buildSchema: (props: any, field?: any) => {
    const isReq = props?.required === true;
    const msg = `${field?.label || field?.name || "Tags"} is required`;
    return isReq
      ? z.array(z.string()).min(1, msg)
      : z.array(z.string()).optional().nullable();
  },
});

pipelineRegistry.register({
  type: "pin:runnerSelect",
  component: FormPinRunnerSelect,
  buildSchema: createRequiredStringSchema,
});

pipelineRegistry.register({
  type: "runner",
  component: FormPinRunnerSelect,
  buildSchema: createRequiredStringSchema,
});

pipelineRegistry.register({
  type: "pin:repositorySelect",
  component: FormPinRepositorySelect,
  buildSchema: (props: any, field?: any) => {
    const isReq = props?.required === true;
    const msg = `${field?.label || field?.name || "Repository"} is required`;
    return isReq
      ? z
          .string({ message: msg })
          .min(1, msg)
          .refine(
            (val) => Boolean(val) && !KNOWN_PLACEHOLDERS.includes(val.trim().toLowerCase()),
            { message: msg }
          )
      : z.string().optional().nullable();
  },
});

pipelineRegistry.register({
  type: "repository",
  component: FormPinRepositorySelect,
  buildSchema: (props: any, field?: any) => {
    const isReq = props?.required === true;
    const msg = `${field?.label || field?.name || "Repository"} is required`;
    return isReq
      ? z
          .string({ message: msg })
          .min(1, msg)
          .refine(
            (val) => Boolean(val) && !KNOWN_PLACEHOLDERS.includes(val.trim().toLowerCase()),
            { message: msg }
          )
      : z.string().optional().nullable();
  },
});



