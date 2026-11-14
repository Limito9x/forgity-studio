#[cfg(test)]
mod tests {
    use rusqlite::Connection;
    use serde_json::json;
    use std::collections::HashMap;
    use std::path::Path;
    use std::sync::Arc;
    use tokio_util::sync::CancellationToken;

    use crate::core::batch::BatchExecutionConfig;
    use crate::core::component_orchestrator::ComponentOrchestrator;
    use crate::core::dag::{DagEdgeDefinition, DagNodeDefinition, DagPipelineDocument};
    use crate::core::dispatcher::StageDispatcher;
    use crate::core::master_orchestrator::MasterOrchestrator;
    use crate::core::traits::{EventSink, NullEventSink, RunnerExecutionEvent, UnlimitedQuotaGate};
    use crate::core::workspace_resolver::WorkspaceResolver;
    use crate::process::active_stage::ActiveStageManager;
    use crate::process::dcc_pool::DccPool;

    struct CollectingEventSink {
        events: tokio::sync::Mutex<Vec<RunnerExecutionEvent>>,
    }

    impl CollectingEventSink {
        fn new() -> Self {
            Self {
                events: tokio::sync::Mutex::new(Vec::new()),
            }
        }
    }

    #[async_trait::async_trait]
    impl EventSink for CollectingEventSink {
        async fn emit_step_progress(
            &self,
            _msg: &crate::core::contracts::StepProgressMessage,
        ) -> anyhow::Result<()> {
            Ok(())
        }

        async fn emit_stage_result(
            &self,
            _msg: &crate::core::contracts::StageResultMessage,
        ) -> anyhow::Result<()> {
            Ok(())
        }

        async fn emit_pipeline_event(&self, event: RunnerExecutionEvent) -> anyhow::Result<()> {
            self.events.lock().await.push(event);
            Ok(())
        }
    }

    fn setup_temp_workspace(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("forgity_test_{}_{}", name, uuid::Uuid::new_v4()));
        let forgity_dir = dir.join(".forgity");
        std::fs::create_dir_all(&forgity_dir).unwrap();

        let db_path = forgity_dir.join("workspace.db");
        let conn = Connection::open(&db_path).unwrap();
        conn.execute_batch(
            "
            CREATE TABLE local_constants (
                key TEXT PRIMARY KEY,
                id TEXT NOT NULL,
                value_json TEXT NOT NULL,
                data_type TEXT NOT NULL,
                scope TEXT NOT NULL,
                unreal_path TEXT,
                description TEXT,
                content_hash TEXT NOT NULL,
                remote_id TEXT,
                published_hash TEXT,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE local_scripts (
                key TEXT PRIMARY KEY,
                raw_json TEXT NOT NULL,
                executor TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                remote_id TEXT,
                published_hash TEXT,
                last_synced_at TEXT NOT NULL
            );
            CREATE TABLE local_pipelines (
                slug TEXT PRIMARY KEY,
                file_name TEXT NOT NULL,
                relative_path TEXT NOT NULL,
                full_path TEXT NOT NULL,
                pipeline_kind TEXT NOT NULL,
                executor TEXT,
                content_hash TEXT NOT NULL,
                last_modified_ms INTEGER NOT NULL,
                remote_id TEXT,
                published_hash TEXT
            );
            ",
        )
        .unwrap();

        dir
    }

    fn insert_constant(root: &Path, key: &str, value_json: &str) {
        let conn = Connection::open(root.join(".forgity").join("workspace.db")).unwrap();
        conn.execute(
            "INSERT INTO local_constants (key, id, value_json, data_type, scope, content_hash, updated_at)
             VALUES (?1, ?1, ?2, 'string', 'workspace', 'h1', '2026-11-14T00:00:00Z')",
            [key, value_json],
        )
        .unwrap();
    }

    fn insert_script(root: &Path, key: &str, executor: &str, full_path: &Path) {
        let conn = Connection::open(root.join(".forgity").join("workspace.db")).unwrap();
        let raw_json = json!({
            "key": key,
            "fullPath": full_path.to_string_lossy(),
            "executor": executor,
            "inputs": [
                { "id": "prefix", "defaultValue": "default_prefix" }
            ],
            "dependencies": [
                { "module": "pydantic", "packageName": "pydantic" }
            ]
        })
        .to_string();
        conn.execute(
            "INSERT INTO local_scripts (key, raw_json, executor, content_hash, last_synced_at)
             VALUES (?1, ?2, ?3, 'h1', '2026-11-14T00:00:00Z')",
            [key, &raw_json, executor],
        )
        .unwrap();
    }

    fn insert_component_yaml(root: &Path, slug: &str, doc: &DagPipelineDocument) {
        let rel = format!("pipelines/{}.component.yaml", slug);
        let full = root.join(&rel);
        std::fs::create_dir_all(full.parent().unwrap()).unwrap();
        let yaml = serde_yaml::to_string(doc).unwrap();
        std::fs::write(&full, yaml).unwrap();

        let conn = Connection::open(root.join(".forgity").join("workspace.db")).unwrap();
        conn.execute(
            "INSERT INTO local_pipelines (slug, file_name, relative_path, full_path, pipeline_kind, content_hash, last_modified_ms)
             VALUES (?1, ?2, ?3, ?4, 'component', 'h1', 0)",
            [
                slug,
                &format!("{}.component.yaml", slug),
                &rel,
                &full.to_string_lossy().to_string(),
            ],
        )
        .unwrap();
    }

    #[test]
    fn test_workspace_resolver_reads_sqlite_and_yaml() {
        let root = setup_temp_workspace("resolver");
        let py_path = root.join("scripts").join("hello.py");
        insert_constant(&root, "character_prefix", "\"G9_\"");
        insert_script(&root, "blender/hello", "blender", &py_path);

        let comp_doc = DagPipelineDocument {
            name: "hello_comp".to_string(),
            version: Some("1.0".to_string()),
            kind: Some("component".to_string()),
            executor: Some("blender".to_string()),
            nodes: vec![],
            edges: vec![],
        };
        insert_component_yaml(&root, "hello_comp", &comp_doc);

        let resolver = WorkspaceResolver::new(&root).unwrap();
        assert_eq!(
            resolver.resolve_constant("local:constant:character_prefix").unwrap(),
            Some(json!("G9_"))
        );

        let script = resolver.resolve_script("local:script:blender/hello").unwrap();
        assert_eq!(script.executor, "blender");
        assert_eq!(script.full_path, py_path);
        assert_eq!(script.requirements, vec!["pydantic".to_string()]);
        assert_eq!(
            script.default_inputs.get("prefix"),
            Some(&json!("default_prefix"))
        );

        let (_, loaded_comp) = resolver.resolve_component("local:component:hello_comp").unwrap();
        assert_eq!(loaded_comp.name, "hello_comp");

        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn test_component_orchestrator_pure_and_batch_execution() {
        let root = setup_temp_workspace("comp_orch");
        insert_constant(&root, "base_tag", "\"Genesis9\"");

        let sink = Arc::new(CollectingEventSink::new());
        let resolver = Arc::new(WorkspaceResolver::new(&root).unwrap());
        let dispatcher = Arc::new(StageDispatcher::new(
            sink.clone(),
            Arc::new(ActiveStageManager::new()),
            Arc::new(DccPool::new(root.join(".forgity"))),
            None,
        ));
        let orch = Arc::new(ComponentOrchestrator::new(
            dispatcher,
            resolver,
            sink.clone(),
            Arc::new(UnlimitedQuotaGate),
        ));

        let comp_doc = Arc::new(DagPipelineDocument {
            name: "pack_character".to_string(),
            version: Some("1.0".to_string()),
            kind: Some("component".to_string()),
            executor: None,
            nodes: vec![
                DagNodeDefinition {
                    id: "start".to_string(),
                    tool: "start".to_string(),
                    label: None,
                    executor: None,
                    inputs: HashMap::new(),
                    metadata: HashMap::new(),
                    is_batch: false,
                    max_concurrency: None,
                    iterable_pin: None,
                    skip_on_error: None,
                },
                DagNodeDefinition {
                    id: "const_tag".to_string(),
                    tool: "local:constant:base_tag".to_string(),
                    label: None,
                    executor: None,
                    inputs: HashMap::new(),
                    metadata: HashMap::new(),
                    is_batch: false,
                    max_concurrency: None,
                    iterable_pin: None,
                    skip_on_error: None,
                },
                DagNodeDefinition {
                    id: "make_info".to_string(),
                    tool: "local:struct:make:character_info".to_string(),
                    label: None,
                    executor: None,
                    inputs: HashMap::new(),
                    metadata: HashMap::new(),
                    is_batch: false,
                    max_concurrency: None,
                    iterable_pin: None,
                    skip_on_error: None,
                },
                DagNodeDefinition {
                    id: "end".to_string(),
                    tool: "end".to_string(),
                    label: None,
                    executor: None,
                    inputs: HashMap::new(),
                    metadata: HashMap::new(),
                    is_batch: false,
                    max_concurrency: None,
                    iterable_pin: None,
                    skip_on_error: None,
                },
            ],
            edges: vec![
                DagEdgeDefinition {
                    from: "start.character_name".to_string(),
                    to: "make_info.name".to_string(),
                },
                DagEdgeDefinition {
                    from: "const_tag.value".to_string(),
                    to: "make_info.base".to_string(),
                },
                DagEdgeDefinition {
                    from: "make_info.struct_out".to_string(),
                    to: "end.result".to_string(),
                },
            ],
        });

        // Batch 3 items with max_concurrency = 2
        let mut inputs = HashMap::new();
        inputs.insert("character_name".to_string(), json!(["Alice", "Bob", "Cara"]));

        let out = orch
            .execute(
                comp_doc,
                "run_1".to_string(),
                inputs,
                Some(BatchExecutionConfig {
                    max_concurrency: 2,
                    iterable_pin_name: "character_name".to_string(),
                    skip_on_error: false,
                }),
                CancellationToken::new(),
            )
            .await
            .unwrap();

        let results = out.get("result").and_then(|v| v.as_array()).unwrap();
        assert_eq!(results.len(), 3);
        let names: Vec<&str> = results
            .iter()
            .filter_map(|item| item.get("name").and_then(|v| v.as_str()))
            .collect();
        assert!(names.contains(&"Alice"));
        assert!(names.contains(&"Bob"));
        assert!(names.contains(&"Cara"));
        assert_eq!(results[0].get("base"), Some(&json!("Genesis9")));

        let events = sink.events.lock().await;
        assert!(!events.is_empty());

        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn test_master_orchestrator_sequence_joint_and_rejects_raw_script() {
        let root = setup_temp_workspace("master_orch");

        let make_simple_comp = |name: &str, suffix: &str| DagPipelineDocument {
            name: name.to_string(),
            version: Some("1.0".to_string()),
            kind: Some("component".to_string()),
            executor: None,
            nodes: vec![
                DagNodeDefinition {
                    id: "start".to_string(),
                    tool: "start".to_string(),
                    label: None,
                    executor: None,
                    inputs: HashMap::new(),
                    metadata: HashMap::new(),
                    is_batch: false,
                    max_concurrency: None,
                    iterable_pin: None,
                    skip_on_error: None,
                },
                DagNodeDefinition {
                    id: "const_s".to_string(),
                    tool: "local:constant:inline".to_string(),
                    label: None,
                    executor: None,
                    inputs: HashMap::from([("value".to_string(), json!(suffix))]),
                    metadata: HashMap::new(),
                    is_batch: false,
                    max_concurrency: None,
                    iterable_pin: None,
                    skip_on_error: None,
                },
                DagNodeDefinition {
                    id: "end".to_string(),
                    tool: "end".to_string(),
                    label: None,
                    executor: None,
                    inputs: HashMap::new(),
                    metadata: HashMap::new(),
                    is_batch: false,
                    max_concurrency: None,
                    iterable_pin: None,
                    skip_on_error: None,
                },
            ],
            edges: vec![DagEdgeDefinition {
                from: "const_s.value".to_string(),
                to: "end.out_val".to_string(),
            }],
        };

        insert_component_yaml(&root, "comp_b", &make_simple_comp("comp_b", "mesh_b"));
        insert_component_yaml(&root, "comp_c", &make_simple_comp("comp_c", "mesh_c"));

        let resolver = Arc::new(WorkspaceResolver::new(&root).unwrap());
        let sink: Arc<dyn EventSink> = Arc::new(NullEventSink);
        let dispatcher = Arc::new(StageDispatcher::new(
            sink.clone(),
            Arc::new(ActiveStageManager::new()),
            Arc::new(DccPool::new(root.join(".forgity"))),
            None,
        ));
        let comp_orch = Arc::new(ComponentOrchestrator::new(
            dispatcher,
            resolver.clone(),
            sink.clone(),
            Arc::new(UnlimitedQuotaGate),
        ));
        let master_orch = MasterOrchestrator::new(comp_orch, resolver, sink);

        // Master: Start -> Sequence -> (comp_b, comp_c) -> Joint -> End
        let master_doc = DagPipelineDocument {
            name: "master_flow".to_string(),
            version: Some("1.0".to_string()),
            kind: Some("master".to_string()),
            executor: None,
            nodes: vec![
                DagNodeDefinition {
                    id: "start".to_string(),
                    tool: "start".to_string(),
                    label: None,
                    executor: None,
                    inputs: HashMap::new(),
                    metadata: HashMap::new(),
                    is_batch: false,
                    max_concurrency: None,
                    iterable_pin: None,
                    skip_on_error: None,
                },
                DagNodeDefinition {
                    id: "seq".to_string(),
                    tool: "sequence".to_string(),
                    label: None,
                    executor: None,
                    inputs: HashMap::new(),
                    metadata: HashMap::new(),
                    is_batch: false,
                    max_concurrency: None,
                    iterable_pin: None,
                    skip_on_error: None,
                },
                DagNodeDefinition {
                    id: "b".to_string(),
                    tool: "local:component:comp_b".to_string(),
                    label: None,
                    executor: None,
                    inputs: HashMap::new(),
                    metadata: HashMap::new(),
                    is_batch: false,
                    max_concurrency: None,
                    iterable_pin: None,
                    skip_on_error: None,
                },
                DagNodeDefinition {
                    id: "c".to_string(),
                    tool: "local:component:comp_c".to_string(),
                    label: None,
                    executor: None,
                    inputs: HashMap::new(),
                    metadata: HashMap::new(),
                    is_batch: false,
                    max_concurrency: None,
                    iterable_pin: None,
                    skip_on_error: None,
                },
                DagNodeDefinition {
                    id: "join".to_string(),
                    tool: "joint".to_string(),
                    label: None,
                    executor: None,
                    inputs: HashMap::new(),
                    metadata: HashMap::new(),
                    is_batch: false,
                    max_concurrency: None,
                    iterable_pin: None,
                    skip_on_error: None,
                },
                DagNodeDefinition {
                    id: "end".to_string(),
                    tool: "end".to_string(),
                    label: None,
                    executor: None,
                    inputs: HashMap::new(),
                    metadata: HashMap::new(),
                    is_batch: false,
                    max_concurrency: None,
                    iterable_pin: None,
                    skip_on_error: None,
                },
            ],
            edges: vec![
                DagEdgeDefinition {
                    from: "start.trigger".to_string(),
                    to: "seq.in".to_string(),
                },
                DagEdgeDefinition {
                    from: "seq.in".to_string(),
                    to: "b.trigger".to_string(),
                },
                DagEdgeDefinition {
                    from: "seq.in".to_string(),
                    to: "c.trigger".to_string(),
                },
                DagEdgeDefinition {
                    from: "b.out_val".to_string(),
                    to: "join.a".to_string(),
                },
                DagEdgeDefinition {
                    from: "c.out_val".to_string(),
                    to: "join.b".to_string(),
                },
                DagEdgeDefinition {
                    from: "join.out_array".to_string(),
                    to: "end.merged_outputs".to_string(),
                },
            ],
        };

        let out = master_orch
            .execute(&master_doc, "master_1", HashMap::new(), CancellationToken::new())
            .await
            .unwrap();
        let merged = out.get("merged_outputs").and_then(|v| v.as_array()).unwrap();
        assert_eq!(merged.len(), 2);
        assert!(merged.contains(&json!("mesh_b")));
        assert!(merged.contains(&json!("mesh_c")));

        // Verify Master rejects raw script / MakeStruct nodes
        let invalid_master = DagPipelineDocument {
            name: "invalid_master".to_string(),
            version: None,
            kind: Some("master".to_string()),
            executor: None,
            nodes: vec![DagNodeDefinition {
                id: "bad".to_string(),
                tool: "local:script:blender/hello".to_string(),
                label: None,
                executor: None,
                inputs: HashMap::new(),
                metadata: HashMap::new(),
                is_batch: false,
                max_concurrency: None,
                iterable_pin: None,
                skip_on_error: None,
            }],
            edges: vec![],
        };
        let err = master_orch
            .execute(&invalid_master, "master_bad", HashMap::new(), CancellationToken::new())
            .await
            .unwrap_err();
        assert!(err.to_string().contains("unsupported node"));

        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn test_execution_bundle_dto_runs_without_sqlite_db() {
        use crate::core::bundle::{BundleResourceResolver, ExecutionBundle};
        use crate::core::traits::ResourceResolver;

        let bundle_json = json!({
            "runId": "dto_run_1",
            "pipelineKind": "component",
            "runtimeInputs": {
                "character_name": "Kira"
            },
            "constants": {
                "local:constant:realm": "Fantasy"
            },
            "components": {},
            "scripts": {},
            "rootPipeline": {
                "name": "dto_comp",
                "kind": "component",
                "nodes": [
                    { "id": "start", "tool": "start" },
                    { "id": "c1", "tool": "local:constant:realm" },
                    { "id": "mk", "tool": "local:struct:make:hero" },
                    { "id": "end", "tool": "end" }
                ],
                "edges": [
                    { "from": "start.character_name", "to": "mk.name" },
                    { "from": "c1.value", "to": "mk.realm" },
                    { "from": "mk.struct_out", "to": "end.hero" }
                ]
            }
        });

        let bundle: ExecutionBundle = serde_json::from_value(bundle_json).unwrap();
        let resolver: Arc<dyn ResourceResolver> =
            Arc::new(BundleResourceResolver::from_bundle(&bundle));
        let sink: Arc<dyn EventSink> = Arc::new(NullEventSink);
        let temp_dir = std::env::temp_dir().join(format!("forgity_dto_{}", uuid::Uuid::new_v4()));
        let dispatcher = Arc::new(StageDispatcher::new(
            sink.clone(),
            Arc::new(ActiveStageManager::new()),
            Arc::new(DccPool::new(temp_dir.clone())),
            None,
        ));
        let comp_orch = Arc::new(ComponentOrchestrator::new(
            dispatcher,
            resolver,
            sink,
            Arc::new(UnlimitedQuotaGate),
        ));

        let outputs = comp_orch
            .execute(
                Arc::new(bundle.root_pipeline),
                "dto_run_1".to_string(),
                bundle.runtime_inputs,
                None,
                CancellationToken::new(),
            )
            .await
            .unwrap();

        let hero = outputs.get("hero").unwrap();
        assert_eq!(hero.get("name"), Some(&json!("Kira")));
        assert_eq!(hero.get("realm"), Some(&json!("Fantasy")));

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
