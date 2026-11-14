"""Read-only commandlet smoke test; FORGITY_TEST_PACKAGE_CACHE supplies the cache."""
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from stage_runner_guest import inject_site_packages

inject_site_packages(os.environ["FORGITY_TEST_PACKAGE_CACHE"])
import unreal
import pydantic
import pydantic_core
from openai import OpenAI


class Probe(pydantic.BaseModel):
    value: int


assert Probe(value="42").model_dump() == {"value": 42}
assert callable(OpenAI)
unreal.log(f"FORGITY_PACKAGE_SMOKE_OK Python={sys.version} pydantic={pydantic.__version__} core={pydantic_core.__file__}")
