//! Integration tests for the Phase 0 template dependency scanner (BL-057).

use forgity_core::template_manifest::{
    build_template_dependency_manifest, ManifestDiagnostic, TemplateDependencyManifest,
};
use forgity_core::workspace_db::WorkspaceDb;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tempfile::TempDir;

struct Fixture {
    dir: TempDir,
}

impl Fixture {
    fn new() -> Self {
        let dir = tempfile::tempdir().expect("temp dir");
        let root = dir.path();
        std::fs::create_dir_all(root.join(".forgity")).expect("create .forgity");
        std::fs::write(
            root.join(".forgity").join("workspace.json"),
            r#"{
                "version": 1,
                "scriptsDir": "pipeline-scripts",
                "pipelinesDir": "pipelines",
                "ignorePatterns": ["presets"]
            }"#,
        )
        .expect("write workspace.json");
        Self { dir }
    }

    fn root(&self) -> &Path {
        self.dir.path()
    }

    fn write(&self, relative: &str, content: &str) -> PathBuf {
        let path = self.dir.path().join(relative);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).expect("create parent dir");
        }
        std::fs::write(&path, content).expect("write fixture file");
        path
    }

    fn abs(&self, relative: &str) -> String {
        self.dir
            .path()
            .join(relative)
            .to_string_lossy()
            .replace('\\', "/")
    }

    fn save_palette(&self, items: &[(&str, &str)]) {
        let db = WorkspaceDb::open(self.dir.path()).expect("open workspace db");
        let mut map = serde_json::Map::new();
        for (key, full_path) in items {
            map.insert(
                key.to_string(),
                json!({
                    "key": key,
                    "fileName": Path::new(full_path)
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default(),
                    "fullPath": full_path,
                    "folderRoot": "",
                    "namespace": "",
                    "relativePath": full_path,
                    "suggestedName": key,
                    "suggestedLabel": key,
                    "executor": "blender",
                    "description": null,
                    "contentHash": format!("hash-of-{}", key),
                    "sourceCode": format!("print('{}')", key),
                    "inputs": [],
                    "outputs": [],
                    "detectedStructs": [],
                    "dependencies": [
                        { "module": "numpy", "packageName": "numpy" }
                    ],
                    "lastModifiedMs": 0
                }),
            );
        }
        let palette = Value::Object(map).to_string();
        db.save_palette_json(&palette).expect("save palette");
    }

    fn save_snapshot(&self, slug: &str, snapshot: &Value) {
        let db = WorkspaceDb::open(self.dir.path()).expect("open workspace db");
        db.save_pipeline_snapshot(slug, &snapshot.to_string())
            .expect("save snapshot");
    }

    fn scan(&self, root_pipelines: &[&str], persist: bool) -> TemplateDependencyManifest {
        let paths: Vec<String> = root_pipelines.iter().map(|p| self.abs(p)).collect();
        build_template_dependency_manifest(self.dir.path(), &paths, persist)
    }
}

fn snapshot(nodes: Vec<Value>, edges: Vec<Value>) -> Value {
    json!({ "nodes": nodes, "edges": edges })
}

fn snapshot_node(id: &str, ref_id: &str, config: Value) -> Value {
    json!({
        "id": id,
        "refId": ref_id,
        "label": id,
        "configValues": config,
        "position": { "x": 0, "y": 0 }
    })
}

fn find_diag<'a>(
    manifest: &'a TemplateDependencyManifest,
    code: &str,
) -> Vec<&'a ManifestDiagnostic> {
    manifest
        .diagnostics
        .iter()
        .filter(|diag| diag.code == code)
        .collect()
}

#[test]
fn scans_master_and_transitive_components() {
    let fixture = Fixture::new();
    fixture.write(
        "pipelines/components/child_leaf.component.yaml",
        "name: child-leaf\nversion: draft\nnodes:\n  - id: start\n    tool: Start\n  - id: work\n    tool: local:blender/save_scene\n",
    );
    fixture.write(
        "pipelines/components/child_root.component.yaml",
        "name: child-root\nversion: draft\nnodes:\n  - id: start\n    tool: Start\n  - id: nested\n    tool: local:component:child_leaf\n",
    );
    fixture.write(
        "pipelines/master/demo.pipeline.yaml",
        "name: demo\nversion: draft\nnodes:\n  - id: start\n    tool: Start\n  - id: comp\n    tool: local:component:child_root\n",
    );
    fixture.write("pipeline-scripts/blender/save_scene.py", "print('save')\n");
    fixture.save_palette(&[(
        "blender/save_scene",
        &fixture.abs("pipeline-scripts/blender/save_scene.py"),
    )]);

    let manifest = fixture.scan(&["pipelines/master/demo.pipeline.yaml"], false);

    assert_eq!(manifest.pipelines.len(), 3);
    assert_eq!(manifest.totals.master_count, 1);
    assert_eq!(manifest.totals.component_count, 2);

    let master = &manifest.pipelines[0];
    assert_eq!(master.slug, "demo");
    assert_eq!(master.kind, "master");
    assert_eq!(master.graph_source, "yaml");
    assert_eq!(master.depends_on, vec!["child_root".to_string()]);
    assert_eq!(master.graph_hash.len(), 64);

    let child_root = manifest
        .pipelines
        .iter()
        .find(|p| p.slug == "child_root")
        .expect("child_root present");
    assert_eq!(child_root.depends_on, vec!["child_leaf".to_string()]);
    assert!(child_root.script_keys.is_empty());

    let child_leaf = manifest
        .pipelines
        .iter()
        .find(|p| p.slug == "child_leaf")
        .expect("child_leaf present");
    assert_eq!(child_leaf.script_keys, vec!["blender/save_scene".to_string()]);

    assert_eq!(manifest.scripts.len(), 1);
    assert_eq!(manifest.scripts[0].requirements, vec!["numpy".to_string()]);
}

#[test]
fn prefers_snapshot_over_yaml() {
    let fixture = Fixture::new();
    fixture.write("pipeline-scripts/blender/from_yaml.py", "print('yaml')\n");
    fixture.write("pipeline-scripts/blender/from_snapshot.py", "print('snap')\n");
    fixture.save_palette(&[
        (
            "blender/from_yaml",
            &fixture.abs("pipeline-scripts/blender/from_yaml.py"),
        ),
        (
            "blender/from_snapshot",
            &fixture.abs("pipeline-scripts/blender/from_snapshot.py"),
        ),
    ]);

    fixture.write(
        "pipelines/master/demo.pipeline.yaml",
        "name: demo\nversion: draft\nnodes:\n  - id: start\n    tool: Start\n  - id: work\n    tool: local:blender/from_yaml\n    inputs:\n      resolution: 2048\n",
    );
    fixture.save_snapshot(
        "demo",
        &snapshot(
            vec![
                snapshot_node("start", "Start", json!({})),
                snapshot_node(
                    "work",
                    "local:blender/from_snapshot",
                    json!({ "resolution": 4096 }),
                ),
            ],
            vec![],
        ),
    );

    let manifest = fixture.scan(&["pipelines/master/demo.pipeline.yaml"], false);

    assert_eq!(manifest.pipelines.len(), 1);
    assert_eq!(manifest.pipelines[0].graph_source, "snapshot");
    assert_eq!(
        manifest.pipelines[0].script_keys,
        vec!["blender/from_snapshot".to_string()]
    );
    assert_eq!(find_diag(&manifest, "GRAPH_DIVERGED").len(), 1);
    assert_eq!(find_diag(&manifest, "GRAPH_DIVERGED")[0].level, "warning");
    assert_eq!(manifest.totals.error_count, 0);
}

#[test]
fn falls_back_to_yaml_when_snapshot_invalid() {
    let fixture = Fixture::new();
    fixture.write("pipeline-scripts/blender/save_scene.py", "print('save')\n");
    fixture.save_palette(&[(
        "blender/save_scene",
        &fixture.abs("pipeline-scripts/blender/save_scene.py"),
    )]);
    fixture.write(
        "pipelines/master/broken_snapshot.pipeline.yaml",
        "name: broken-snapshot\nversion: draft\nnodes:\n  - id: start\n    tool: Start\n  - id: work\n    tool: local:blender/save_scene\n",
    );
    {
        let db = WorkspaceDb::open(fixture.root()).expect("open db");
        db.save_pipeline_snapshot("broken_snapshot", "{ not valid json")
            .expect("save broken snapshot");
    }

    let manifest = fixture.scan(&["pipelines/master/broken_snapshot.pipeline.yaml"], false);

    assert_eq!(manifest.pipelines.len(), 1);
    assert_eq!(manifest.pipelines[0].graph_source, "yaml");
    assert_eq!(
        manifest.pipelines[0].script_keys,
        vec!["blender/save_scene".to_string()]
    );
    assert_eq!(find_diag(&manifest, "SNAPSHOT_PARSE_FAILED").len(), 1);
    assert_eq!(find_diag(&manifest, "SNAPSHOT_PARSE_FAILED")[0].level, "warning");
    assert!(find_diag(&manifest, "SNAPSHOT_MISSING").is_empty());
}

#[test]
fn canonical_hash_stable_across_sources() {
    let fixture = Fixture::new();
    fixture.write("pipeline-scripts/blender/save_scene.py", "print('save')\n");
    fixture.save_palette(&[(
        "blender/save_scene",
        &fixture.abs("pipeline-scripts/blender/save_scene.py"),
    )]);

    fixture.write(
        "pipelines/master/stable.pipeline.yaml",
        "name: stable\nversion: draft\nnodes:\n  - id: start\n    tool: Start\n  - id: work\n    tool: local:blender/save_scene\n    label: Work\n    inputs:\n      resolution: 4096\n      label_mode: keep\n    isBatch: true\n    maxConcurrency: 3\n    iterablePin: items\n    skipOnError: true\nedges:\n  - from: start.out\n    to: work.in\n",
    );

    let yaml_manifest = fixture.scan(&["pipelines/master/stable.pipeline.yaml"], false);
    let yaml_hash = yaml_manifest.pipelines[0].graph_hash.clone();
    assert_eq!(yaml_manifest.pipelines[0].graph_source, "yaml");

    fixture.save_snapshot(
        "stable",
        &snapshot(
            vec![
                snapshot_node(
                    "work",
                    "local:blender/save_scene",
                    json!({
                        "_isBatch": true,
                        "_maxConcurrency": 3,
                        "_iterablePin": "items",
                        "_skipOnError": true,
                        "label_mode": "keep",
                        "resolution": 4096
                    }),
                ),
                snapshot_node("start", "Start", json!({})),
            ],
            vec![json!({
                "sourceNodeId": "start",
                "sourcePin": "out",
                "targetNodeId": "work",
                "targetPin": "in"
            })],
        ),
    );

    let snapshot_manifest = fixture.scan(&["pipelines/master/stable.pipeline.yaml"], false);
    assert_eq!(snapshot_manifest.pipelines[0].graph_source, "snapshot");
    assert_eq!(snapshot_manifest.pipelines[0].graph_hash, yaml_hash);
    assert!(
        find_diag(&snapshot_manifest, "GRAPH_DIVERGED").is_empty(),
        "equivalent graphs must not report divergence"
    );

    fixture.save_snapshot(
        "stable",
        &snapshot(
            vec![
                snapshot_node(
                    "work",
                    "local:blender/save_scene",
                    json!({
                        "_isBatch": true,
                        "_maxConcurrency": 3,
                        "_iterablePin": "items",
                        "_skipOnError": true,
                        "label_mode": "keep",
                        "resolution": 2048
                    }),
                ),
                snapshot_node("start", "Start", json!({})),
            ],
            vec![json!({
                "sourceNodeId": "start",
                "sourcePin": "out",
                "targetNodeId": "work",
                "targetPin": "in"
            })],
        ),
    );

    let changed_manifest = fixture.scan(&["pipelines/master/stable.pipeline.yaml"], false);
    assert_ne!(changed_manifest.pipelines[0].graph_hash, yaml_hash);
    assert_eq!(find_diag(&changed_manifest, "GRAPH_DIVERGED").len(), 1);
}

#[test]
fn detects_dangling_script_and_missing_component() {
    let fixture = Fixture::new();
    fixture.write(
        "pipelines/master/broken.pipeline.yaml",
        "name: broken\nversion: draft\nnodes:\n  - id: start\n    tool: Start\n  - id: gone\n    tool: local:ghost/script\n  - id: comp\n    tool: local:component:ghost_component\n",
    );

    let manifest = fixture.scan(&["pipelines/master/broken.pipeline.yaml"], false);

    assert_eq!(manifest.pipelines.len(), 1);
    assert_eq!(find_diag(&manifest, "DANGLING_SCRIPT").len(), 1);
    assert_eq!(find_diag(&manifest, "MISSING_COMPONENT").len(), 1);
    assert_eq!(find_diag(&manifest, "DANGLING_SCRIPT")[0].level, "error");
    assert_eq!(manifest.totals.error_count, 2);
}

#[test]
fn collects_constants_and_assets() {
    let fixture = Fixture::new();
    fixture.write(
        "contracts.yaml",
        "version: 1\nconstants:\n  - key: CHARACTER_FOLDER\n    dataType: String\n    scope: General\n    value: D:/Work/Characters\n",
    );

    let preset = fixture.write(
        "pipeline-scripts/presets/daz.easy_import_daz/DazBodyUE5.py",
        "print('preset')\n",
    );
    let script = fixture.write("pipeline-scripts/blender/save_scene.py", "print('save')\n");
    fixture.save_palette(&[(
        "blender/save_scene",
        &script.to_string_lossy().replace('\\', "/"),
    )]);

    let preset_path = preset.to_string_lossy().replace('\\', "/");
    let script_path = script.to_string_lossy().replace('\\', "/");
    fixture.write(
        "pipelines/master/assets.pipeline.yaml",
        &format!(
            "name: assets\nversion: draft\nnodes:\n  - id: start\n    tool: Start\n  - id: folder\n    tool: local:constant:CHARACTER_FOLDER\n  - id: import\n    tool: local:blender/save_scene\n    inputs:\n      target_folder: ${{CHARACTER_FOLDER}}\n      unknown: ${{NOT_DECLARED}}\n      preset_path: \"{}\"\n      script_path: \"{}\"\n",
            preset_path, script_path
        ),
    );

    let manifest = fixture.scan(&["pipelines/master/assets.pipeline.yaml"], false);

    assert_eq!(manifest.constants.len(), 1);
    let constant = &manifest.constants[0];
    assert_eq!(constant.key, "CHARACTER_FOLDER");
    assert_eq!(constant.data_type, "String");
    assert_eq!(constant.scope, "General");
    assert_eq!(
        constant.used_by,
        vec!["assets".to_string()],
        "constant must be attributed to the pipeline that references it"
    );

    assert_eq!(find_diag(&manifest, "DANGLING_CONSTANT_REF").len(), 1);
    assert!(find_diag(&manifest, "DANGLING_CONSTANT_REF")[0]
        .message
        .contains("NOT_DECLARED"));

    assert_eq!(manifest.assets.len(), 1, "referenced script must not be an asset");
    let asset = &manifest.assets[0];
    assert_eq!(asset.name, "DazBodyUE5.py");
    assert_eq!(
        asset.relative_path,
        "pipeline-scripts/presets/daz.easy_import_daz/DazBodyUE5.py"
    );
    assert_eq!(asset.size_bytes, 16);
    assert_eq!(asset.hash.len(), 64);
    assert_eq!(manifest.totals.asset_bytes, 16);
}

#[test]
fn dedupes_shared_script_and_asset() {
    let fixture = Fixture::new();
    let preset = fixture.write("pipeline-scripts/presets/shared/Shared.py", "shared\n");
    fixture.write("pipeline-scripts/blender/shared.py", "shared\n");
    fixture.save_palette(&[(
        "blender/shared",
        &fixture.abs("pipeline-scripts/blender/shared.py"),
    )]);

    let preset_path = preset.to_string_lossy().replace('\\', "/");
    for slug in ["first", "second"] {
        fixture.write(
            &format!("pipelines/components/{}.component.yaml", slug),
            &format!(
                "name: {}\nversion: draft\nnodes:\n  - id: start\n    tool: Start\n  - id: shared\n    tool: local:blender/shared\n    inputs:\n      preset_path: \"{}\"\n",
                slug, preset_path
            ),
        );
    }
    fixture.write(
        "pipelines/master/shared.pipeline.yaml",
        "name: shared\nversion: draft\nnodes:\n  - id: start\n    tool: Start\n  - id: first\n    tool: local:component:first\n  - id: second\n    tool: local:component:second\n",
    );

    let manifest = fixture.scan(&["pipelines/master/shared.pipeline.yaml"], false);

    assert_eq!(manifest.scripts.len(), 1);
    assert_eq!(
        manifest.scripts[0].used_by,
        vec!["first".to_string(), "second".to_string()]
    );
    assert_eq!(manifest.assets.len(), 1);
    assert_eq!(
        manifest.assets[0].relative_path,
        "pipeline-scripts/presets/shared/Shared.py"
    );
}

#[test]
fn persists_dependencies_idempotently() {
    let fixture = Fixture::new();
    fixture.write("pipeline-scripts/blender/save_scene.py", "print('save')\n");
    fixture.save_palette(&[(
        "blender/save_scene",
        &fixture.abs("pipeline-scripts/blender/save_scene.py"),
    )]);
    fixture.write(
        "pipelines/components/leaf.component.yaml",
        "name: leaf\nversion: draft\nnodes:\n  - id: start\n    tool: Start\n  - id: work\n    tool: local:blender/save_scene\n",
    );
    fixture.write(
        "pipelines/master/persist.pipeline.yaml",
        "name: persist\nversion: draft\nnodes:\n  - id: start\n    tool: Start\n  - id: leaf\n    tool: local:component:leaf\n",
    );

    let first = fixture.scan(&["pipelines/master/persist.pipeline.yaml"], true);
    assert!(first.persisted);

    let db = WorkspaceDb::open(fixture.root()).expect("open db");
    let first_rows = db
        .load_dependencies("pipeline", "persist")
        .expect("load dependencies");
    let leaf_rows = db
        .load_dependencies("pipeline", "leaf")
        .expect("load leaf dependencies");

    let second = fixture.scan(&["pipelines/master/persist.pipeline.yaml"], true);
    assert!(second.persisted);
    let second_rows = db
        .load_dependencies("pipeline", "persist")
        .expect("load dependencies again");

    assert_eq!(first_rows, second_rows);
    assert_eq!(first_rows, vec![("component".to_string(), "leaf".to_string())]);
    assert_eq!(
        leaf_rows,
        vec![("script".to_string(), "blender/save_scene".to_string())]
    );
}

#[test]
fn never_writes_yaml() {
    let fixture = Fixture::new();
    fixture.write("pipeline-scripts/blender/save_scene.py", "print('save')\n");
    fixture.save_palette(&[(
        "blender/save_scene",
        &fixture.abs("pipeline-scripts/blender/save_scene.py"),
    )]);
    let yaml_path = fixture.write(
        "pipelines/master/frozen.pipeline.yaml",
        "name: frozen\nversion: draft\nnodes:\n  - id: start\n    tool: Start\n  - id: work\n    tool: local:blender/save_scene\n    inputs:\n      resolution: 2048\n",
    );

    fixture.save_snapshot(
        "frozen",
        &snapshot(
            vec![
                snapshot_node("start", "Start", json!({})),
                snapshot_node(
                    "work",
                    "local:blender/save_scene",
                    json!({ "resolution": 4096 }),
                ),
            ],
            vec![],
        ),
    );

    let before_bytes = std::fs::read(&yaml_path).expect("read yaml before");
    let before_modified = std::fs::metadata(&yaml_path)
        .and_then(|meta| meta.modified())
        .expect("yaml mtime before");

    let manifest = fixture.scan(&["pipelines/master/frozen.pipeline.yaml"], true);
    assert_eq!(find_diag(&manifest, "GRAPH_DIVERGED").len(), 1);

    let after_bytes = std::fs::read(&yaml_path).expect("read yaml after");
    let after_modified = std::fs::metadata(&yaml_path)
        .and_then(|meta| meta.modified())
        .expect("yaml mtime after");

    assert_eq!(before_bytes, after_bytes);
    assert_eq!(before_modified, after_modified);
}

#[test]
fn rejects_path_escape() {
    let fixture = Fixture::new();
    let outside = fixture
        .root()
        .parent()
        .expect("temp parent")
        .join("bl-057-secret.txt");
    std::fs::write(&outside, "secret").expect("write outside file");

    fixture.write("pipeline-scripts/blender/save_scene.py", "print('save')\n");
    fixture.save_palette(&[(
        "blender/save_scene",
        &fixture.abs("pipeline-scripts/blender/save_scene.py"),
    )]);
    fixture.write(
        "pipelines/master/escape.pipeline.yaml",
        "name: escape\nversion: draft\nnodes:\n  - id: start\n    tool: Start\n  - id: leak\n    tool: local:blender/save_scene\n    inputs:\n      preset_path: \"../bl-057-secret.txt\"\n",
    );

    let manifest = fixture.scan(&["pipelines/master/escape.pipeline.yaml"], false);

    let _ = std::fs::remove_file(&outside);
    assert!(manifest.assets.is_empty());
    assert_eq!(find_diag(&manifest, "PATH_ESCAPE").len(), 1);
    assert_eq!(find_diag(&manifest, "PATH_ESCAPE")[0].level, "error");
}
