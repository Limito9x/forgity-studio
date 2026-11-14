import { z } from "zod";
import { type AssignUserRolesCommand } from "@/gen/model";

export const baseAssignUserRolesSchema = z.object({
    roles: z.array(z.string())
}).transform((data): Omit<AssignUserRolesCommand, 'userId'> => {
    return {
        roles: data.roles
    };
});

export type AssignUserRolesInput = z.input<typeof baseAssignUserRolesSchema>;
export type AssignUserRolesOutput = z.output<typeof baseAssignUserRolesSchema>;

export const useAssignUserRolesSchema = () => {
    
    return z.object({
        roles: z.array(z.string())
    }).transform((data): Omit<AssignUserRolesCommand, 'userId'> => {
        return {
            roles: data.roles
        };
    });
};
