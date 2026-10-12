"""Trace only the new raised sign arm; existing cow and desk artwork stays intact."""

from pathlib import Path
import subprocess
import sys


FRONTEND = Path(__file__).resolve().parents[1]
ASSETS = FRONTEND / 'src/assets/cow-workspace/access-denied'
subprocess.run([
    sys.executable, str(FRONTEND / 'scripts/trace-cow-rig.py'),
    str(ASSETS / 'arm-build-manifest.json'), '--output', str(ASSETS),
], check=True)
arm = ASSETS / 'rig-cowArmLeftNoEntry.svg'
arm.write_text(arm.read_text().replace(
    '<g data-rig-part="cowArmLeftNoEntry">',
    '<g id="denied-left-arm" data-rig-part="cowArmLeftNoEntry">',
))
# The runtime resolves an external SVG fragment; do not duplicate path data in JavaScript.
(ASSETS / 'rig.ts').unlink()
