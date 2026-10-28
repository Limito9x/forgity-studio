import sys
from typing import Dict, List, Optional, Set
from ..context import STDLIB_MODULES


class DynamicDependencyResolver:
    """
    Resolves external pip dependencies dynamically using Python's
    importlib.metadata.packages_distributions() without manual dictionaries.
    """

    def __init__(self):
        self._cached_distributions: Optional[Dict[str, List[str]]] = None

    def _get_distributions(self) -> Dict[str, List[str]]:
        if self._cached_distributions is None:
            try:
                import importlib.metadata
                self._cached_distributions = importlib.metadata.packages_distributions()
            except Exception:
                self._cached_distributions = {}
        return self._cached_distributions

    def resolve(self, imported_modules: Set[str], dcc_builtins: Set[str]) -> List[Dict[str, str]]:
        external_modules = imported_modules - STDLIB_MODULES - dcc_builtins
        dist_map = self._get_distributions()
        results: List[Dict[str, str]] = []

        for mod in sorted(external_modules):
            # Dynamic lookup in host site-packages
            known_pkgs = dist_map.get(mod)
            if known_pkgs:
                pkg_name = known_pkgs[0]
            else:
                # Fallback to direct name if distribution not yet installed on host
                pkg_name = mod

            results.append({
                "module": mod,
                "packageName": pkg_name
            })

        return results
