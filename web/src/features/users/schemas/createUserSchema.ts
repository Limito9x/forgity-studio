import { z } from "zod";
import { type CreateUserCommand } from "@/gen/model";
import { useTranslation } from "react-i18next";

export const baseCreateUserSchema = z
  .object({
    fullName: z.string().min(1),
    email: z.email(),
    roleId: z.string().min(1),
  })
  .transform((data): CreateUserCommand => {
    const nameParts = data.fullName.trim().split(" ");
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ");

    return {
      email: data.email,
      firstName: firstName,
      lastName: lastName,
      username: data.email,
      roleId: data.roleId,
    };
  });

export const detailedCreateUserSchema = z
  .object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.email(),
    roleId: z.string().min(1),
  })
  .transform((data): CreateUserCommand => {
    return {
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      username: data.email,
      roleId: data.roleId,
    };
  });

export type CreateUserDetailInput = z.input<typeof detailedCreateUserSchema>;
export type CreateUserDetailOutput = z.output<typeof detailedCreateUserSchema>;
export type CreateUserInput = z.input<typeof baseCreateUserSchema>;
export type CreateUserOutput = z.output<typeof baseCreateUserSchema>;

export const useCreateUserSchema = () => {
  const { t } = useTranslation("users");
  return z
    .object({
      fullName: z.string().min(
        1,
        t("validation.nameRequired", {
          defaultValue: "Full name is required",
        }),
      ),
      email: z.email(
        t("validation.invalidEmail", { defaultValue: "Invalid email" }),
      ),
      roleId: z
        .string()
        .min(
          1,
          t("validation.roleRequired", { defaultValue: "Role is required" }),
        ),
    })
    .transform((data): CreateUserCommand => {
      const nameParts = data.fullName.trim().split(" ");
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(" ");

      return {
        email: data.email,
        firstName: firstName,
        lastName: lastName,
        username: data.email,
        roleId: data.roleId,
      };
    });
};

export const useCreateUserDetailSchema = () => {
  const { t } = useTranslation("users");
  return z
    .object({
      firstName: z.string().min(
        1,
        t("validation.firstNameRequired", {
          defaultValue: "First name is required",
        }),
      ),
      lastName: z.string().min(
        1,
        t("validation.lastNameRequired", {
          defaultValue: "Last name is required",
        }),
      ),
      email: z.email(
        t("validation.invalidEmail", { defaultValue: "Invalid email" }),
      ),
      roleId: z
        .string()
        .min(
          1,
          t("validation.roleRequired", { defaultValue: "Role is required" }),
        ),
    })
    .transform((data): CreateUserCommand => {
      return {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        username: data.email,
        roleId: data.roleId,
      };
    });
};
