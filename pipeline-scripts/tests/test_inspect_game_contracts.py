"""Scoped discovery tests; synthetic name tables do not validate UE serialization fidelity."""
import importlib.util
from pathlib import Path
import struct
import tempfile
import unittest


spec = importlib.util.spec_from_file_location(
    "inspect_game_contracts", Path(__file__).parents[1] / "unreal/inspect_game_contracts.py"
)
inspector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inspector)


class ContractDiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.project = self.root / "Game.uproject"
        self.project.write_text("{}", encoding="utf-8")
        self.content = self.root / "Content"
        self.write_asset("Shared/M_Skin.uasset", ["Material"])
        self.write_asset("Shared/PDA_Character.uasset", ["BlueprintGeneratedClass", "PrimaryDataAsset"])
        config = self.root / "Config"
        config.mkdir()
        self.tags = config / "DefaultGameplayTags.ini"
        self.tags.write_text('+GameplayTagList=(Tag="System.Wardrobe.Slots.Body",DevComment="")\n', encoding="utf-8")

    def write_asset(self, relative, names):
        path = self.content / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        package = ("/Game/" + relative.removesuffix(".uasset") + "\0").encode()
        table = b""
        for name in names:
            encoded = (name + "\0").encode()
            table += struct.pack("<i", len(encoded)) + encoded + bytes(4)
        header = struct.pack("<i", len(package)) + package
        path.write_bytes(header + struct.pack("<III", 0, len(names), len(header) + 12) + table)
        return path

    def run_inspect(self, **overrides):
        args = dict(project_path=str(self.project), material_folders=["Shared"], pda_folders=["Shared"])
        args.update(overrides)
        return inspector.main(**args)

    def test_shared_folder_filters_and_existing_output_contract(self):
        (self.content / "Shared/MI_Ignore.uasset").write_bytes(b"unrelated")
        self.write_asset("Outside/M_Excluded.uasset", ["Material"])
        result = self.run_inspect()
        self.assertEqual(result["materials_count"], 1)
        self.assertEqual(result["schemas_count"], 1)
        self.assertEqual(result["skeletons_count"], 0)
        self.assertEqual(set(result["contracts"]), {"materials", "schemas", "skeletons", "gameplay_tags", "wardrobe_slots"})
        self.assertEqual(result["slots_count"], 1)

    def test_multiple_overlapping_folders_and_custom_pattern(self):
        self.write_asset("Other/Nested/M_Cloth.uasset", ["Material"])
        self.write_asset("Other/Contract.uasset", ["BlueprintGeneratedClass", "DataAsset"])
        result = self.run_inspect(material_folders=["Shared", "Other", "Other/Nested"],
                                  pda_folders=["Other"], pda_pattern="Contract.uasset")
        self.assertEqual(result["materials_count"], 2)
        self.assertIn("Contract", result["contracts"]["schemas"])

    def test_rejects_absolute_and_parent_paths(self):
        for folder in [str(self.content / "Shared"), "../Other", "C:/Outside", "/Game/Shared", "Shared/../../Other"]:
            with self.subTest(folder=folder), self.assertRaisesRegex(ValueError, "relative to Content"):
                self.run_inspect(material_folders=[folder])

    def test_rejects_non_filename_patterns(self):
        for pattern in ["../*.uasset", "Shared/*.uasset", "", "C:*.uasset"]:
            with self.subTest(pattern=pattern), self.assertRaisesRegex(ValueError, "filename pattern"):
                self.run_inspect(material_pattern=pattern)

    def test_missing_folder_and_no_matches(self):
        with self.assertRaisesRegex(FileNotFoundError, "material folder"):
            self.run_inspect(material_folders=["Missing"])
        with self.assertRaisesRegex(ValueError, "No material"):
            self.run_inspect(material_pattern="M_Missing*.uasset")
        with self.assertRaisesRegex(ValueError, "non-empty list"):
            self.run_inspect(pda_folders=[])

    def test_corrupt_asset_is_not_silently_skipped(self):
        (self.content / "Shared/M_Broken.uasset").write_bytes(b"broken")
        with self.assertRaisesRegex(ValueError, "Cannot read material"):
            self.run_inspect()

    def test_type_markers_checked_after_filename_filter(self):
        self.write_asset("Shared/M_Wrong.uasset", ["Texture2D"])
        with self.assertRaisesRegex(ValueError, "expected material type"):
            self.run_inspect()
        (self.content / "Shared/M_Wrong.uasset").unlink()
        self.write_asset("Shared/PDA_Wrong.uasset", ["BlueprintGeneratedClass", "Actor"])
        with self.assertRaisesRegex(ValueError, "expected pda type"):
            self.run_inspect()

    def test_duplicate_contract_names_fail(self):
        self.write_asset("Shared/Nested/M_Skin.uasset", ["Material"])
        with self.assertRaisesRegex(ValueError, "Duplicate material contract 'Skin'"):
            self.run_inspect()
        (self.content / "Shared/Nested/M_Skin.uasset").unlink()
        self.write_asset("Shared/Nested/PDA_Character.uasset", ["BlueprintGeneratedClass", "PrimaryDataAsset"])
        with self.assertRaisesRegex(ValueError, "Duplicate pda contract"):
            self.run_inspect()

    def test_project_and_config_must_exist_without_fallback_search(self):
        with self.assertRaisesRegex(ValueError, "absolute .uproject"):
            self.run_inspect(project_path="Game.uproject")
        self.tags.unlink()
        with self.assertRaisesRegex(FileNotFoundError, "GameplayTags file"):
            self.run_inspect()


if __name__ == "__main__":
    unittest.main()
