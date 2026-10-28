#!/usr/bin/env python3
"""
Backward compatibility bridge for python_script_analyzer.py.
Forwards all calls to the modular analyzers package.
"""

import os
import sys

current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from analyzers.analyzer import PythonScriptAnalyzer
from analyzers.context import ASTAnalysisContext, STDLIB_MODULES
from analyzers.docstring import clean_docstring, extract_options_from_docstring
from analyzers.resolvers import DynamicDependencyResolver
from analyzers.strategies import (
    BlenderExecutorStrategy,
    DEFAULT_EXECUTOR_STRATEGIES,
    DEFAULT_OUTPUT_STRATEGIES,
    DocstringOutputsStrategy,
    ExecutorStrategy,
    GenericPythonExecutorStrategy,
    OutputDiscoveryStrategy,
    ReturnDictInspectionStrategy,
    UnrealExecutorStrategy,
)
from analyzers.typing_utils import (
    extract_default_value,
    extract_literal_options,
    normalize_type_and_cardinality,
)
from analyzers.__main__ import main

__all__ = [
    "PythonScriptAnalyzer",
    "ASTAnalysisContext",
    "STDLIB_MODULES",
    "ExecutorStrategy",
    "OutputDiscoveryStrategy",
    "BlenderExecutorStrategy",
    "UnrealExecutorStrategy",
    "GenericPythonExecutorStrategy",
    "ReturnDictInspectionStrategy",
    "DocstringOutputsStrategy",
    "DynamicDependencyResolver",
    "clean_docstring",
    "extract_options_from_docstring",
    "normalize_type_and_cardinality",
    "extract_literal_options",
    "extract_default_value",
    "main",
]

if __name__ == "__main__":
    main()
