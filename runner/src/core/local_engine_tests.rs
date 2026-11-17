#[cfg(test)]
mod tests {
    use serde_json::json;
    use std::collections::HashMap;
    use std::sync::Arc;
    use tokio_util::sync::CancellationToken;

    use crate::core::batch::BatchExecutionConfig;
    use crate::core::bundle::{BundleResourceResolver, ExecutionBundle};
    use crate::core::component_orchestrator::ComponentOrchestrator;
    use crate::core::dag::{DagEdgeDefinition, DagNodeDefinition, DagPipelineDocument};
    use crate::core::dispatcher::StageDispatcher;
    use crate::core::master_orchestrator::MasterOrchestrator;
    use crate::core::traits::{
        EventSink, NullEventSink, ResolvedConstantSpec, RunnerExecutionEvent, UnlimitedQuotaGate,
    };
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

    #[tokio::test]
    async fn test_component_orchestrator_pure_and_batch_execution() {
        let root = std::env::temp_dir().join(format!("forgity_test_comp_{}", uuid::Uuid::new_v4()));
        let bundle = ExecutionBundle {
            bundle_version: 2,
            run_id: Some("run_1".to_string()),
            pipeline_kind: "component".to_string(),
            cloud_lease: None,
            root_pipeline: DagPipelineDocument {
                name: "empty".to_string(),
                version: None,
                kind: None,
                executor: None,
                nodes: vec![],
                edges: vec![],
            },
            runtime_inputs: HashMap::new(),
            scripts: HashMap::new(),
            components: HashMap::new(),
            constants: HashMap::from([(
                "base_tag".to_string(),
                ResolvedConstantSpec {
                    outputs: HashMap::from([("value".to_string(), json!("Genesis9"))]),
                    template_vars: Vec::new(),
                },
            )]),
        };

        let sink = Arc::new(CollectingEventSink::new());
        let resolver = Arc::new(BundleResourceResolver::from_bundle(&bundle));
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
                    from: "start.character_name".to_string(),
                    to: "make_info.name".to_string(),
                },
                DagEdgeDefinition {
                    from: "const_tag.value".to_string(),
                    to: "make_info.base".to_string(),
                },
                DagEdgeDefinition {
                    from: "make_info.out".to_string(),
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
        assert_eq!(results.len(), 6);
        let flattened: Vec<String> = results
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect();
        assert!(flattened.contains(&"Alice".to_string()));
        assert!(flattened.contains(&"Bob".to_string()));
        assert!(flattened.contains(&"Cara".to_string()));
        assert!(flattened.contains(&"Genesis9".to_string()));

        let events = sink.events.lock().await;
        assert!(!events.is_empty());

        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn test_master_orchestrator_sequence_joint_and_rejects_raw_script() {
        let root = std::env::temp_dir().join(format!("forgity_test_master_{}", uuid::Uuid::new_v4()));

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
                    inputs: HashMap::from([("val".to_string(), json!(suffix))]),
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
                from: "start.val".to_string(),
                to: "end.out_val".to_string(),
            }],
        };

        let bundle = ExecutionBundle {
            bundle_version: 2,
            run_id: Some("master_1".to_string()),
            pipeline_kind: "master".to_string(),
            root_pipeline: DagPipelineDocument {
                name: "empty".to_string(),
                version: None,
                kind: None,
                executor: None,
                nodes: vec![],
                edges: vec![],
            },
            runtime_inputs: HashMap::new(),
            scripts: HashMap::new(),
            components: HashMap::from([
                ("comp_b".to_string(), make_simple_comp("comp_b", "mesh_b")),
                ("comp_c".to_string(), make_simple_comp("comp_c", "mesh_c")),
            ]),
            constants: HashMap::new(),
            cloud_lease: None,
        };

        let resolver = Arc::new(BundleResourceResolver::from_bundle(&bundle));
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
            "bundleVersion": 2,
            "runId": "dto_run_1",
            "pipelineKind": "component",
            "runtimeInputs": {
                "character_name": "Kira"
            },
            "constants": {
                "realm": {
                    "outputs": { "value": "Fantasy" },
                    "templateVars": []
                }
            },
            "components": {},
            "scripts": {},
            "rootPipeline": {
                "name": "dto_comp",
                "kind": "component",
                "nodes": [
                    { "id": "start", "tool": "start" },
                    { "id": "c1", "tool": "local:constant:realm" },
                    { "id": "mk", "tool": "joint" },
                    { "id": "end", "tool": "end" }
                ],
                "edges": [
                    { "from": "start.character_name", "to": "mk.name" },
                    { "from": "c1.value", "to": "mk.realm" },
                    { "from": "mk.out", "to": "end.hero" }
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

        let hero = outputs.get("hero").and_then(|v| v.as_array()).unwrap();
        assert!(hero.contains(&json!("Kira")));
        assert!(hero.contains(&json!("Fantasy")));

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_run_bundle_rejects_v1_and_accepts_v2() {
        let v1_json = json!({
            "bundleVersion": 1,
            "pipelineKind": "component",
            "rootPipeline": { "name": "test", "nodes": [], "edges": [] }
        })
        .to_string();
        let err = crate::cli::run_local::parse_and_validate_bundle(&v1_json).unwrap_err();
        assert!(err.to_string().contains("bundleVersion >= 2"));

        let v2_json = json!({
            "bundleVersion": 2,
            "pipelineKind": "component",
            "rootPipeline": { "name": "test", "nodes": [], "edges": [] }
        })
        .to_string();
        let bundle = crate::cli::run_local::parse_and_validate_bundle(&v2_json).unwrap();
        assert_eq!(bundle.bundle_version, 2);
    }

    #[tokio::test]
    async fn test_joint_multi_wire_fan_in_and_one_to_one_channel_mapping() {
        let make_branch = |name: &str, meshes: serde_json::Value, tex: serde_json::Value| DagPipelineDocument {
            name: name.to_string(),
            version: Some("1.0".to_string()),
            kind: Some("component".to_string()),
            executor: None,
            nodes: vec![
                DagNodeDefinition {
                    id: "start".to_string(),
                    tool: "Start".to_string(),
                    label: None,
                    executor: None,
                    inputs: HashMap::from([
                        ("meshes".to_string(), meshes),
                        ("tex".to_string(), tex),
                    ]),
                    metadata: HashMap::new(),
                    is_batch: false,
                    max_concurrency: None,
                    iterable_pin: None,
                    skip_on_error: None,
                },
                DagNodeDefinition {
                    id: "return".to_string(),
                    tool: "Return".to_string(),
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
                    from: "start.meshes".to_string(),
                    to: "return.meshes".to_string(),
                },
                DagEdgeDefinition {
                    from: "start.tex".to_string(),
                    to: "return.tex".to_string(),
                },
            ],
        };

        let master_doc = DagPipelineDocument {
            name: "master_joint_channels".to_string(),
            version: Some("1.0".to_string()),
            kind: Some("master".to_string()),
            executor: None,
            nodes: vec![
                DagNodeDefinition {
                    id: "start".to_string(),
                    tool: "Start".to_string(),
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
                    tool: "Sequence".to_string(),
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
                    id: "b1".to_string(),
                    tool: "local:component:b1".to_string(),
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
                    id: "b2".to_string(),
                    tool: "local:component:b2".to_string(),
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
                    id: "joint".to_string(),
                    tool: "Joint".to_string(),
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
                    id: "return".to_string(),
                    tool: "Return".to_string(),
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
                DagEdgeDefinition { from: "start.exec_out".to_string(), to: "seq.exec_in".to_string() },
                DagEdgeDefinition { from: "seq.then_0".to_string(), to: "b1.exec_in".to_string() },
                DagEdgeDefinition { from: "seq.then_1".to_string(), to: "b2.exec_in".to_string() },
                // 2 wires into Joint.in_1
                DagEdgeDefinition { from: "b1.meshes".to_string(), to: "joint.in_1".to_string() },
                DagEdgeDefinition { from: "b2.meshes".to_string(), to: "joint.in_1".to_string() },
                // 2 wires into Joint.in_2
                DagEdgeDefinition { from: "b1.tex".to_string(), to: "joint.in_2".to_string() },
                DagEdgeDefinition { from: "b2.tex".to_string(), to: "joint.in_2".to_string() },
                // Channel outputs out_1 and out_2
                DagEdgeDefinition { from: "joint.out_1".to_string(), to: "return.all_meshes".to_string() },
                DagEdgeDefinition { from: "joint.out_2".to_string(), to: "return.all_tex".to_string() },
            ],
        };

        let bundle = ExecutionBundle {
            bundle_version: 2,
            run_id: Some("joint_channel_test".to_string()),
            pipeline_kind: "master".to_string(),
            root_pipeline: master_doc.clone(),
            runtime_inputs: HashMap::new(),
            scripts: HashMap::new(),
            components: HashMap::from([
                ("b1".to_string(), make_branch("b1", json!(["body.fbx"]), json!("body_bc.png"))),
                ("b2".to_string(), make_branch("b2", json!(["dress.fbx", "hat.fbx"]), json!("dress_bc.png"))),
            ]),
            constants: HashMap::new(),
            cloud_lease: None,
        };

        let root = std::env::temp_dir().join(format!("forgity_test_joint_{}", uuid::Uuid::new_v4()));
        let sink: Arc<dyn EventSink> = Arc::new(NullEventSink);
        let resolver = Arc::new(BundleResourceResolver::from_bundle(&bundle));
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

        let outputs = master_orch
            .execute(&master_doc, "joint_channel_test", HashMap::new(), CancellationToken::new())
            .await
            .unwrap();

        assert_eq!(
            outputs.get("all_meshes"),
            Some(&json!(["body.fbx", "dress.fbx", "hat.fbx"]))
        );
        assert_eq!(
            outputs.get("all_tex"),
            Some(&json!(["body_bc.png", "dress_bc.png"]))
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn test_master_joint_micro_batch_waves_and_free_busy_state() {
        let make_producer = |name: &str, items: serde_json::Value| DagPipelineDocument {
            name: name.to_string(),
            version: Some("1.0".to_string()),
            kind: Some("component".to_string()),
            executor: Some("blender".to_string()),
            nodes: vec![
                DagNodeDefinition {
                    id: "start".to_string(),
                    tool: "Start".to_string(),
                    label: None,
                    executor: None,
                    inputs: HashMap::from([("out_files".to_string(), items)]),
                    metadata: HashMap::new(),
                    is_batch: false,
                    max_concurrency: None,
                    iterable_pin: None,
                    skip_on_error: None,
                },
                DagNodeDefinition {
                    id: "return".to_string(),
                    tool: "Return".to_string(),
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
                from: "start.out_files".to_string(),
                to: "return.fbx_files".to_string(),
            }],
        };

        // Downstream Unreal component that takes an Array `fbx_files` and returns `imported_meshes`
        let unreal_comp = DagPipelineDocument {
            name: "fbx_to_unreal".to_string(),
            version: Some("1.0".to_string()),
            kind: Some("component".to_string()),
            executor: Some("unreal".to_string()),
            nodes: vec![
                DagNodeDefinition {
                    id: "start".to_string(),
                    tool: "Start".to_string(),
                    label: None,
                    executor: None,
                    inputs: HashMap::from([("fbx_files".to_string(), json!([]))]),
                    metadata: HashMap::new(),
                    is_batch: false,
                    max_concurrency: None,
                    iterable_pin: None,
                    skip_on_error: None,
                },
                DagNodeDefinition {
                    id: "return".to_string(),
                    tool: "Return".to_string(),
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
                from: "start.fbx_files".to_string(),
                to: "return.imported_meshes".to_string(),
            }],
        };

        let master_doc = DagPipelineDocument {
            name: "master_wave_test".to_string(),
            version: Some("1.0".to_string()),
            kind: Some("master".to_string()),
            executor: None,
            nodes: vec![
                DagNodeDefinition {
                    id: "start".to_string(),
                    tool: "Start".to_string(),
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
                    tool: "Sequence".to_string(),
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
                    id: "p1".to_string(),
                    tool: "local:component:p1".to_string(),
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
                    id: "p2".to_string(),
                    tool: "local:component:p2".to_string(),
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
                    id: "joint".to_string(),
                    tool: "Joint".to_string(),
                    label: None,
                    executor: None,
                    inputs: HashMap::from([("take".to_string(), json!(5))]),
                    metadata: HashMap::new(),
                    is_batch: false,
                    max_concurrency: None,
                    iterable_pin: None,
                    skip_on_error: None,
                },
                DagNodeDefinition {
                    id: "unreal".to_string(),
                    tool: "local:component:fbx_to_unreal".to_string(),
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
                    id: "return".to_string(),
                    tool: "Return".to_string(),
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
                DagEdgeDefinition { from: "start.exec_out".to_string(), to: "seq.exec_in".to_string() },
                DagEdgeDefinition { from: "seq.then_0".to_string(), to: "p1.exec_in".to_string() },
                DagEdgeDefinition { from: "seq.then_1".to_string(), to: "p2.exec_in".to_string() },
                DagEdgeDefinition { from: "p1.fbx_files".to_string(), to: "joint.in".to_string() },
                DagEdgeDefinition { from: "p2.fbx_files".to_string(), to: "joint.in".to_string() },
                DagEdgeDefinition { from: "joint.out".to_string(), to: "unreal.fbx_files".to_string() },
                DagEdgeDefinition { from: "unreal.imported_meshes".to_string(), to: "return.final_meshes".to_string() },
            ],
        };

        let bundle = ExecutionBundle {
            bundle_version: 2,
            run_id: Some("wave_test".to_string()),
            pipeline_kind: "master".to_string(),
            root_pipeline: master_doc.clone(),
            runtime_inputs: HashMap::new(),
            scripts: HashMap::new(),
            components: HashMap::from([
                ("p1".to_string(), make_producer("p1", json!(["f1", "f2", "f3", "f4", "f5", "f6", "f7"]))),
                ("p2".to_string(), make_producer("p2", json!(["f8", "f9", "f10", "f11", "f12"]))),
                ("fbx_to_unreal".to_string(), unreal_comp),
            ]),
            constants: HashMap::new(),
            cloud_lease: None,
        };

        let root = std::env::temp_dir().join(format!("forgity_test_wave_{}", uuid::Uuid::new_v4()));
        let sink: Arc<dyn EventSink> = Arc::new(NullEventSink);
        let resolver = Arc::new(BundleResourceResolver::from_bundle(&bundle));
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

        let outputs = master_orch
            .execute(&master_doc, "wave_test", HashMap::new(), CancellationToken::new())
            .await
            .unwrap();

        let final_arr = outputs
            .get("final_meshes")
            .and_then(|v| v.as_array())
            .expect("final_meshes should be an array");
        assert_eq!(final_arr.len(), 12);
        let _ = std::fs::remove_dir_all(&root);
    }
}

