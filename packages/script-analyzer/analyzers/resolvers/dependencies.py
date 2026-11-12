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
            # Ultra-fast path: scan site-packages directly in O(N) dirs (< 20ms) instead of importlib.metadata (which takes 2.7s on Windows)
            dists: Dict[str, List[str]] = {}
            try:
                import os
                for p in sys.path:
                    if not (os.path.isdir(p) and "site-packages" in p):
                        continue
                    for entry in os.scandir(p):
                        if entry.name.endswith(".dist-info") and entry.is_dir():
                            # Extract package distribution name from folder prefix (e.g. pydantic-2.10.1.dist-info -> pydantic)
                            pkg_name = entry.name.split("-")[0]
                            top_file = os.path.join(entry.path, "top_level.txt")
                            if os.path.isfile(top_file):
                                try:
                                    with open(top_file, "r", encoding="utf-8") as f:
                                        for line in f:
                                            mod = line.strip()
                                            if mod:
                                                dists.setdefault(mod, []).append(pkg_name)
                                except Exception:
                                    pass
                            else:
                                # When no top_level.txt, package name usually matches import name
                                dists.setdefault(pkg_name.lower(), []).append(pkg_name)
                self._cached_distributions = dists
            except Exception:
                self._cached_distributions = {}
        return self._cached_distributions

    def resolve(self, imported_modules: Set[str], dcc_builtins: Set[str]) -> List[Dict[str, str]]:
        external_modules = imported_modules - STDLIB_MODULES - dcc_builtins
        if not external_modules:
            return []

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
