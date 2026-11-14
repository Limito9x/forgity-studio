export default function (plop) {
    plop.setHelper('eq', (v1, v2) => v1 === v2);
    plop.setGenerator('feature', {
        description: 'Generate a standard Resource Feature (Page, Table, Dialogs/Routes)',
        prompts: [
            {
                type: 'input',
                name: 'name',
                message: 'Feature name (singular, e.g. "role", "product"):',
            },
            {
                type: 'list',
                name: 'layout',
                message: 'Which layout do you want for CRUD operations?',
                choices: ['dialog', 'page'],
                default: 'dialog'
            }
        ],
        actions: (data) => {
            const actions = [
                // Core
                { type: 'add', path: 'src/features/{{camelCase name}}s/schemas/{{camelCase name}}FilterableFields.ts', templateFile: '.plop/templates/feature/schemas/FilterableFields.ts.hbs' },
                { type: 'add', path: 'src/features/{{camelCase name}}s/schemas/create{{pascalCase name}}Schema.ts', templateFile: '.plop/templates/feature/schemas/createSchema.ts.hbs' },
                { type: 'add', path: 'src/features/{{camelCase name}}s/schemas/update{{pascalCase name}}Schema.ts', templateFile: '.plop/templates/feature/schemas/updateSchema.ts.hbs' },
                
                // Components
                { type: 'add', path: 'src/features/{{camelCase name}}s/components/{{camelCase name}}Filter.ts', templateFile: '.plop/templates/feature/components/Filter.ts.hbs' },
                { type: 'add', path: 'src/features/{{camelCase name}}s/components/{{pascalCase name}}Table.tsx', templateFile: '.plop/templates/feature/components/Table.tsx.hbs' },
                { type: 'add', path: 'src/features/{{camelCase name}}s/components/Create{{pascalCase name}}Form.tsx', templateFile: '.plop/templates/feature/components/CreateForm.tsx.hbs' },
                { type: 'add', path: 'src/features/{{camelCase name}}s/components/Update{{pascalCase name}}Form.tsx', templateFile: '.plop/templates/feature/components/UpdateForm.tsx.hbs' },

                // Hooks
                { type: 'add', path: 'src/features/{{camelCase name}}s/hooks/use{{pascalCase name}}Table.tsx', templateFile: '.plop/templates/feature/hooks/useTable.tsx.hbs' },
                { type: 'add', path: 'src/features/{{camelCase name}}s/hooks/use{{pascalCase name}}s.ts', templateFile: '.plop/templates/feature/hooks/hooks.ts.hbs' },

                // Locales
                { type: 'add', path: 'src/features/{{camelCase name}}s/locales/en.json', templateFile: '.plop/templates/feature/locales/en.json.hbs' },
                { type: 'add', path: 'src/features/{{camelCase name}}s/locales/vi.json', templateFile: '.plop/templates/feature/locales/vi.json.hbs' },

                // Page (Main List)
                { type: 'add', path: 'src/features/{{camelCase name}}s/{{pascalCase name}}Page.tsx', templateFile: '.plop/templates/feature/pages/Page.tsx.hbs' },
                { type: 'add', path: 'src/routes/_layout/{{kebabCase name}}s.tsx', templateFile: '.plop/templates/feature/routes/layout-route.tsx.hbs' },
                { type: 'add', path: 'src/routes/_layout/{{kebabCase name}}s/index.tsx', templateFile: '.plop/templates/feature/routes/route.tsx.hbs' },
                
                // Dialogs (Delete is always generated)
                { type: 'add', path: 'src/features/{{camelCase name}}s/dialogs/Delete{{pascalCase name}}Dialog.tsx', templateFile: '.plop/templates/feature/dialogs/DeleteDialog.tsx.hbs' },
                { type: 'add', path: 'src/features/{{camelCase name}}s/dialogs/index.ts', templateFile: '.plop/templates/feature/dialogs/dialogs-index.ts.hbs' }
            ];

            if (data.layout === 'dialog') {
                actions.push(
                    { type: 'add', path: 'src/features/{{camelCase name}}s/dialogs/Create{{pascalCase name}}Dialog.tsx', templateFile: '.plop/templates/feature/dialogs/CreateDialog.tsx.hbs' },
                    { type: 'add', path: 'src/features/{{camelCase name}}s/dialogs/Update{{pascalCase name}}Dialog.tsx', templateFile: '.plop/templates/feature/dialogs/UpdateDialog.tsx.hbs' }
                );
            } else if (data.layout === 'page') {
                actions.push(
                    // Pages
                    { type: 'add', path: 'src/features/{{camelCase name}}s/pages/Create{{pascalCase name}}Page.tsx', templateFile: '.plop/templates/feature/pages/CreatePage.tsx.hbs' },
                    { type: 'add', path: 'src/features/{{camelCase name}}s/pages/Update{{pascalCase name}}Page.tsx', templateFile: '.plop/templates/feature/pages/UpdatePage.tsx.hbs' },
                    { type: 'add', path: 'src/features/{{camelCase name}}s/pages/{{pascalCase name}}DetailPage.tsx', templateFile: '.plop/templates/feature/pages/DetailPage.tsx.hbs' },
                    // Routes
                    { type: 'add', path: 'src/routes/_layout/{{kebabCase name}}s/new.tsx', templateFile: '.plop/templates/feature/routes/route-new.tsx.hbs' },
                    { type: 'add', path: 'src/routes/_layout/{{kebabCase name}}s/$id/index.tsx', templateFile: '.plop/templates/feature/routes/route-detail.tsx.hbs' },
                    { type: 'add', path: 'src/routes/_layout/{{kebabCase name}}s/$id/edit.tsx', templateFile: '.plop/templates/feature/routes/route-edit.tsx.hbs' }
                );
            }

            return actions;
        }
    });
};
