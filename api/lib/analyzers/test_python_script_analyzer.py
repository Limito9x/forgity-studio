#!/usr/bin/env python3
"""
Unit Test Suite for PythonScriptAnalyzer and its modular strategies.
Tests Strategy Pattern, Dynamic Dependency Resolution, Output Discovery,
Literal Extraction, and Subprocess Directory Invocation.
"""

import json
import os
import subprocess
import sys
import unittest

# Ensure parent directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from analyzers import (
    ASTAnalysisContext,
    BlenderExecutorStrategy,
    DynamicDependencyResolver,
    GenericPythonExecutorStrategy,
    PythonScriptAnalyzer,
    UnrealExecutorStrategy,
)
from analyzers.docstring import clean_docstring, extract_options_from_docstring


class TestPythonScriptAnalyzer(unittest.TestCase):
    def setUp(self):
        self.analyzer = PythonScriptAnalyzer()

    def test_literal_and_defaults_extraction(self):
        code = '''
from typing import Literal, Optional, List

def main(
    provider: Literal["gemini", "openai", "claude"] = "gemini",
    temperature: float = 0.7,
    enable_cache: bool = True,
    tags: Optional[List[str]] = None,
    prompt: str = ""
):
    """
    Generate completions from LLM.
    Full markdown explanation of this prompt node.

    Args:
        provider: Target AI provider.
        temperature: Sampling temperature.
        prompt: User input prompt.
    """
    return {"result": "success"}
'''
        result = self.analyzer.analyze(code, "generate_llm.py")

        self.assertEqual(result["executor"], "python")
        self.assertEqual(result["suggestedName"], "generate_llm")
        self.assertEqual(result["suggestedLabel"], "Generate Llm")
        self.assertEqual(result["summary"], "Generate completions from LLM.")
        self.assertIn("Full markdown explanation", result["description"])
        self.assertNotIn("Args:", result["description"])

        inputs_by_name = {inp["name"]: inp for inp in result["inputs"]}

        # Check provider (Literal Dropdown)
        provider_pin = inputs_by_name["provider"]
        self.assertEqual(provider_pin["dataType"], "Text")
        self.assertEqual(provider_pin["cardinality"], "Single")
        self.assertEqual(provider_pin["defaultValue"], "gemini")
        self.assertFalse(provider_pin["required"])
        self.assertEqual(provider_pin["options"], ["gemini", "openai", "claude"])
        self.assertEqual(
            json.loads(provider_pin["metadata"]),
            {"type": "select", "options": ["gemini", "openai", "claude"]}
        )
        self.assertEqual(provider_pin["description"], "Target AI provider.")

        # Check temperature (Number)
        temp_pin = inputs_by_name["temperature"]
        self.assertEqual(temp_pin["dataType"], "Number")
        self.assertEqual(temp_pin["defaultValue"], 0.7)

        # Check enable_cache (Boolean)
        cache_pin = inputs_by_name["enable_cache"]
        self.assertEqual(cache_pin["dataType"], "Boolean")
        self.assertTrue(cache_pin["defaultValue"])

        # Check tags (Array)
        tags_pin = inputs_by_name["tags"]
        self.assertEqual(tags_pin["cardinality"], "Array")

    def test_docstring_fallback_options_extraction(self):
        code = '''
def main(
    mode: str = "fast",
    device: str = "cuda"
):
    """
    Test docstring fallback options.

    Args:
        mode: Execution speed ('fast', 'quality', 'ultra').
        device: Target compute device: ['cpu', 'cuda', 'mps'].
    """
    return {}
'''
        result = self.analyzer.analyze(code, "test_doc_options.py")
        inputs_by_name = {inp["name"]: inp for inp in result["inputs"]}

        self.assertEqual(inputs_by_name["mode"]["options"], ["fast", "quality", "ultra"])
        self.assertEqual(
            json.loads(inputs_by_name["mode"]["metadata"]),
            {"type": "select", "options": ["fast", "quality", "ultra"]}
        )
        self.assertEqual(inputs_by_name["device"]["options"], ["cpu", "cuda", "mps"])

    def test_blender_executor_strategy(self):
        code = '''
import bpy
import bmesh
from mathutils import Vector

def export_fbx(filepath: str, selected_only: bool = True):
    """Export scene to FBX."""
    return {"exported_path": filepath}
'''
        result = self.analyzer.analyze(code, "export_fbx.py")
        self.assertEqual(result["executor"], "blender")

        dep_modules = [d["module"] for d in result["dependencies"]]
        self.assertNotIn("bpy", dep_modules)
        self.assertNotIn("bmesh", dep_modules)
        self.assertNotIn("mathutils", dep_modules)

    def test_unreal_executor_strategy(self):
        code = '''
import unreal

def import_asset(asset_path: str):
    """Import an asset into Unreal Engine content browser."""
    return {"success": True}
'''
        result = self.analyzer.analyze(code, "import_asset.py")
        self.assertEqual(result["executor"], "unreal")

        dep_modules = [d["module"] for d in result["dependencies"]]
        self.assertNotIn("unreal", dep_modules)

    def test_dynamic_dependency_resolution_filters_stdlib(self):
        code = '''
import os
import sys
import json
import pathlib
import typing
import non_existent_custom_pkg_xyz

def main():
    pass
'''
        result = self.analyzer.analyze(code, "test_deps.py")
        dep_modules = [d["module"] for d in result["dependencies"]]

        self.assertNotIn("os", dep_modules)
        self.assertNotIn("sys", dep_modules)
        self.assertNotIn("json", dep_modules)
        self.assertNotIn("pathlib", dep_modules)
        self.assertNotIn("typing", dep_modules)

        self.assertIn("non_existent_custom_pkg_xyz", dep_modules)

    def test_return_dict_output_variable_tracing(self):
        code = '''
from typing import List, Dict

def main():
    body_mesh: List[str] = ["Head", "Torso"]
    cloth_mapping: Dict[str, str] = {"shirt": "cotton"}
    is_valid: bool = True

    return {
        "body_mesh": body_mesh,
        "cloth_mapping": cloth_mapping,
        "is_valid": is_valid
    }
'''
        result = self.analyzer.analyze(code, "trace_outputs.py")
        outputs_by_name = {out["name"]: out for out in result["outputs"]}

        self.assertEqual(outputs_by_name["body_mesh"]["cardinality"], "Array")
        self.assertEqual(outputs_by_name["cloth_mapping"]["cardinality"], "Map")
        self.assertEqual(outputs_by_name["is_valid"]["cardinality"], "Single")

    def test_docstring_fallback_outputs(self):
        code = '''
def main():
    """
    Process assets without explicit return dictionary.

    Outputs:
        - generated_meshes (list): List of created meshes
        - config_map (dict): Output configuration
        - log_path: Path to execution log
    """
    pass
'''
        result = self.analyzer.analyze(code, "docstring_outputs.py")
        outputs_by_name = {out["name"]: out for out in result["outputs"]}

        self.assertIn("generated_meshes", outputs_by_name)
        self.assertEqual(outputs_by_name["generated_meshes"]["cardinality"], "Array")
        self.assertIn("config_map", outputs_by_name)
        self.assertEqual(outputs_by_name["config_map"]["cardinality"], "Map")
        self.assertIn("log_path", outputs_by_name)
        self.assertEqual(outputs_by_name["log_path"]["cardinality"], "Single")

    def test_syntax_error_graceful_handling(self):
        code = '''
def broken_syntax(
    this is invalid python code!
'''
        result = self.analyzer.analyze(code, "broken.py")
        self.assertIn("error", result)
        self.assertIn("Syntax Error", result["error"])
        self.assertEqual(result["inputs"], [])
        self.assertEqual(result["outputs"], [])

    def test_union_dict_string_resolves_to_map(self):
        code = '''
from typing import Union, Dict, Any, Optional

def main(
    raw_manifest: Union[Dict[str, Any], str],
    contracts: Optional[Dict[str, Any]] = None,
    options: Dict[str, Any] | str = "{}"
):
    return {"status": "ok"}
'''
        result = self.analyzer.analyze(code, "union_test.py")
        inputs_by_name = {inp["name"]: inp for inp in result["inputs"]}

        self.assertEqual(inputs_by_name["raw_manifest"]["cardinality"], "Map")
        self.assertEqual(inputs_by_name["contracts"]["cardinality"], "Map")
        self.assertEqual(inputs_by_name["options"]["cardinality"], "Map")

    def test_real_pipeline_script(self):
        script_path = os.path.join(
            os.path.dirname(__file__),
            "../../../pipeline-scripts/ai/classify_mesh_types.py"
        )
        if os.path.isfile(script_path):
            with open(script_path, "r", encoding="utf-8") as f:
                code = f.read()
            result = self.analyzer.analyze(code, "classify_mesh_types.py")

            self.assertEqual(result["executor"], "python")
            inputs_by_name = {inp["name"]: inp for inp in result["inputs"]}
            self.assertIn("provider", inputs_by_name)
            self.assertIn("model", inputs_by_name)
            # Options detected either from Literal or Docstring
            self.assertEqual(
                inputs_by_name["provider"]["options"],
                ["groq", "gemini", "ollama", "openai", "deepseek", "openrouter"]
            )

            output_names = [out["name"] for out in result["outputs"]]
            self.assertIn("body_meshes", output_names)
            self.assertIn("cloth_map", output_names)

    def test_subprocess_cli_invocation_via_stdin(self):
        """Simulate how C# will invoke the analyzer folder via subprocess piping stdin."""
        package_dir = os.path.dirname(os.path.abspath(__file__))
        test_code = "def main(role: str = 'admin'):\n    return {'status': 'ok'}"

        proc = subprocess.Popen(
            [sys.executable, package_dir, "-"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        stdout, stderr = proc.communicate(input=test_code)
        self.assertEqual(proc.returncode, 0, f"Subprocess failed: {stderr}")

        parsed = json.loads(stdout)
        self.assertEqual(parsed["executor"], "python")
        self.assertEqual(parsed["inputs"][0]["name"], "role")
        self.assertEqual(parsed["inputs"][0]["defaultValue"], "admin")
        self.assertEqual(parsed["outputs"][0]["name"], "status")


if __name__ == "__main__":
    unittest.main()
