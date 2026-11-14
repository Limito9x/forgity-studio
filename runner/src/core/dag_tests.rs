#[cfg(test)]
mod tests {
    use super::super::dag::*;
    use super::super::pure_nodes::*;
    use serde_json::json;
    use std::collections::HashMap;

    #[test]
    fn test_pure_make_and_break_struct() {
        let mut make_inputs = HashMap::new();
        make_inputs.insert("duf_path".to_string(), json!("D:/models/char.duf"));
        make_inputs.insert("resolution".to_string(), json!(2048));

        // 1. Make Struct
        let make_res = execute_pure_node("local:struct:make:character_manifest", &make_inputs);
        let struct_output = match make_res {
            PureNodeResult::Outputs(outs) => outs.get("struct_out").cloned().expect("struct_out must exist"),
            _ => panic!("Expected pure node outputs"),
        };

        assert_eq!(struct_output["duf_path"], "D:/models/char.duf");
        assert_eq!(struct_output["resolution"], 2048);

        // 2. Break Struct
        let mut break_inputs = HashMap::new();
        break_inputs.insert("struct_in".to_string(), struct_output);

        let break_res = execute_pure_node("local:struct:break:character_manifest", &break_inputs);
        match break_res {
            PureNodeResult::Outputs(outs) => {
                assert_eq!(outs.get("duf_path").unwrap(), "D:/models/char.duf");
                assert_eq!(outs.get("resolution").unwrap(), 2048);
            }
            _ => panic!("Expected pure node outputs for break"),
        }
    }

    #[test]
    fn test_pure_joint_array() {
        let mut inputs = HashMap::new();
        inputs.insert("branch_a".to_string(), json!(["body.fbx"]));
        inputs.insert("branch_b".to_string(), json!(["cloth_1.fbx", "cloth_2.fbx"]));

        let res = execute_pure_node("joint", &inputs);
        match res {
            PureNodeResult::Outputs(outs) => {
                let merged = outs.get("out_array").unwrap().as_array().unwrap();
                assert_eq!(merged.len(), 3);
                assert_eq!(merged[0], "body.fbx");
                assert_eq!(merged[1], "cloth_1.fbx");
                assert_eq!(merged[2], "cloth_2.fbx");
            }
            _ => panic!("Expected joint pure node output"),
        }
    }

    #[test]
    fn test_dag_scheduler_dependency_flow() {
        let yaml_doc = r#"
name: "Test DAG Flow"
nodes:
  - id: start
    tool: Start
    inputs:
      raw_file: "test.duf"
  - id: bake_body
    tool: "scripts/bake_body.py"
  - id: bake_clothes
    tool: "scripts/bake_clothes.py"
  - id: joint_files
    tool: Joint
  - id: unreal_ingest
    tool: "scripts/unreal_ingest.py"
edges:
  - from: "start.raw_file"
    to: "bake_body.duf_path"
  - from: "start.raw_file"
    to: "bake_clothes.duf_path"
  - from: "bake_body.fbx_file"
    to: "joint_files.body"
  - from: "bake_clothes.fbx_files"
    to: "joint_files.clothes"
  - from: "joint_files.out_array"
    to: "unreal_ingest.fbx_paths"
"#;

        let doc: DagPipelineDocument = serde_yaml::from_str(yaml_doc).expect("Failed to parse YAML");
        let mut scheduler = DagScheduler::new(doc);

        // 1. Chỉ node Start được sẵn sàng ban đầu (không phụ thuộc ai)
        let first_node = scheduler.pop_ready_node().expect("Start node must be ready");
        assert_eq!(first_node.id, "start");

        let mut start_outs = HashMap::new();
        start_outs.insert("raw_file".to_string(), json!("test.duf"));
        scheduler.mark_node_completed("start", start_outs);

        // 2. Cả bake_body và bake_clothes cùng được mở khóa và sẵn sàng chạy song song!
        let mut parallel_ready = Vec::new();
        while let Some(node) = scheduler.pop_ready_node() {
            parallel_ready.push(node.id);
        }
        assert_eq!(parallel_ready.len(), 2);
        assert!(parallel_ready.contains(&"bake_body".to_string()));
        assert!(parallel_ready.contains(&"bake_clothes".to_string()));

        // 3. Hoàn tất bake_body trước -> Joint vẫn chưa sẵn sàng (remaining = 1)
        let mut body_outs = HashMap::new();
        body_outs.insert("fbx_file".to_string(), json!(["body.fbx"]));
        scheduler.mark_node_completed("bake_body", body_outs);
        assert!(scheduler.pop_ready_node().is_none(), "Joint must not be ready until clothes complete");

        // 4. Hoàn tất bake_clothes -> Joint sẵn sàng!
        let mut clothes_outs = HashMap::new();
        clothes_outs.insert("fbx_files".to_string(), json!(["c1.fbx", "c2.fbx"]));
        scheduler.mark_node_completed("bake_clothes", clothes_outs);

        let joint_node = scheduler.pop_ready_node().expect("Joint node must be ready now");
        assert_eq!(joint_node.id, "joint_files");

    #[test]
    fn test_pure_constant_template_interpolation() {
        let mut inputs = HashMap::new();
        inputs.insert("virtual_path".to_string(), json!("/Game/Characters/Genesis9/{character_name}"));
        inputs.insert("character_name".to_string(), json!("Eva"));

        let res = execute_pure_node("local:constant:CHAR_DEST", &inputs);
        match res {
            PureNodeResult::Outputs(outs) => {
                assert_eq!(outs.get("virtual_path"), Some(&json!("/Game/Characters/Genesis9/Eva")));
            }
            PureNodeResult::NotPure => panic!("local:constant:* must be treated as pure node"),
        }
    }

        // 5. Giải quyết inputs của Joint từ Blackboard
        let joint_inputs = scheduler.resolve_node_inputs("joint_files");
        assert_eq!(joint_inputs.get("body").unwrap(), &json!(["body.fbx"]));
        assert_eq!(joint_inputs.get("clothes").unwrap(), &json!(["c1.fbx", "c2.fbx"]));

        // Thực thi Joint và trả về out_array
        if let PureNodeResult::Outputs(j_outs) = execute_pure_node(&joint_node.tool, &joint_inputs) {
            scheduler.mark_node_completed("joint_files", j_outs);
        }

        // 6. Unreal Ingest sẵn sàng với mảng gộp đầy đủ 3 files!
        let unreal_node = scheduler.pop_ready_node().expect("Unreal Ingest must be ready");
        assert_eq!(unreal_node.id, "unreal_ingest");

        let unreal_inputs = scheduler.resolve_node_inputs("unreal_ingest");
        let all_fbx = unreal_inputs.get("fbx_paths").unwrap().as_array().unwrap();
        assert_eq!(all_fbx.len(), 3);
        assert_eq!(all_fbx[0], "body.fbx");
        assert_eq!(all_fbx[1], "c1.fbx");
        assert_eq!(all_fbx[2], "c2.fbx");

        scheduler.mark_node_completed("unreal_ingest", HashMap::new());
        assert!(scheduler.is_completed());
    }

    #[tokio::test]
    async fn test_batch_execution_concurrency_and_skip() {
        use super::super::batch::{execute_batch_concurrent, BatchExecutionConfig};

        let mut base_inputs = HashMap::new();
        // Mảng gồm 5 bộ quần áo: cloth_1, cloth_2 (lỗi), cloth_3, cloth_4, cloth_5
        base_inputs.insert(
            "clothes".to_string(),
            json!(["cloth_1.duf", "cloth_2_corrupted.duf", "cloth_3.duf", "cloth_4.duf", "cloth_5.duf"]),
        );
        base_inputs.insert("resolution".to_string(), json!(2048));

        let config = BatchExecutionConfig {
            max_concurrency: 2, // Giới hạn tối đa 2 worker song song
            iterable_pin_name: "clothes".to_string(),
            skip_on_error: true, // Bỏ qua file lỗi, tiếp tục các file khác
        };

        // Giả lập worker DCC xử lý từng phần tử
        let result = execute_batch_concurrent(config, base_inputs, |_index, item, broadcast| async move {
            let file_str = item.as_str().unwrap();
            let res = broadcast.get("resolution").unwrap().as_i64().unwrap();

            // Giả lập file 2 bị hỏng
            if file_str.contains("corrupted") {
                return Err(format!("Corrupted mesh file: {}", file_str));
            }

            // Trả về output giả lập file .fbx sinh ra
            let mut outs = HashMap::new();
            outs.insert("baked_fbx".to_string(), json!(format!("D:/output/{}_{}p.fbx", file_str, res)));
            Ok(outs)
        }).await.expect("Batch execution should succeed with skipped errors");

        // 5 file đầu vào, 1 file lỗi -> 4 thành công, 1 skip
        assert_eq!(result.total_items, 5);
        assert_eq!(result.succeeded_count, 4);
        assert_eq!(result.skipped_count, 1);

        // Kiểm tra mảng kết quả gom lại
        let baked_files = result.gathered_outputs.get("baked_fbx").unwrap().as_array().unwrap();
        assert_eq!(baked_files.len(), 4);
        assert_eq!(baked_files[0], "D:/output/cloth_1.duf_2048p.fbx");
        assert_eq!(baked_files[1], "D:/output/cloth_3.duf_2048p.fbx");
        assert_eq!(baked_files[2], "D:/output/cloth_4.duf_2048p.fbx");
        assert_eq!(baked_files[3], "D:/output/cloth_5.duf_2048p.fbx");
    }
}

