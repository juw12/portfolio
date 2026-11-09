"""Village server for UI tests: serves test/probe_build.html and keeps its data in a throwaway file.

Usage: python ui_server.py PORT DATA_FILE   (set COZY_CAT_VISIT_S for short cat visits)
"""
import os
import sys
from pathlib import Path

port, data_file = sys.argv[1], sys.argv[2]
os.environ["COZY_DATA"] = data_file
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "server"))

import village_server  # noqa: E402  (env must be set before import)

village_server.GAME_FILE = Path(__file__).resolve().parent / "probe_build.html"
sys.argv = ["village_server.py", "--port", port]
village_server.main()
