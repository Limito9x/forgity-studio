import ast
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Set
from ..context import ASTAnalysisContext


class ExecutorStrategy(ABC):
    """Abstract Strategy for DCC/Host executor matching and builtins filtering."""
    name: str
    dcc_builtins: Set[str]

    @abstractmethod
    def matches(self, ctx: ASTAnalysisContext) -> bool:
        """Determines if the script belongs to this executor."""
        pass


class OutputDiscoveryStrategy(ABC):
    """Abstract Strategy for discovering script outputs and their cardinalities."""

    @abstractmethod
    def discover(self, func_node: ast.FunctionDef, raw_doc: Optional[str]) -> List[Dict[str, Any]]:
        """Returns list of discovered output pins."""
        pass
