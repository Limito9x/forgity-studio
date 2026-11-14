import { createContext, useContext, type ReactNode } from "react";

export type StructDependenciesMap = Record<string, any>;

const StructDependenciesContext = createContext<StructDependenciesMap>({});

export function StructDependenciesProvider({
    dependencies = {},
    children
}: {
    dependencies?: StructDependenciesMap;
    children: ReactNode;
}) {
    return (
        <StructDependenciesContext.Provider value={dependencies}>
            {children}
        </StructDependenciesContext.Provider>
    );
}

export function useStructDependencies(): StructDependenciesMap {
    return useContext(StructDependenciesContext);
}
