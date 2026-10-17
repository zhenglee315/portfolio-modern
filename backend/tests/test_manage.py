"""Process supervision regressions using disposable child processes."""

import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest

BACKEND = Path(__file__).resolve().parents[1]


class SupervisorTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.env = {**os.environ, "PYTHONPATH": str(BACKEND)}
        self.processes = []
        self.child = self.root / "child.py"
        self.child.write_text(
            "import pathlib,signal,subprocess,sys,time\n"
            "root=pathlib.Path(sys.argv[1]); mode=sys.argv[2]\n"
            "def stop(*_):\n"
            " (root/(mode+'.stopped')).write_text('stopped'); sys.exit(0)\n"
            "signal.signal(signal.SIGTERM, signal.SIG_IGN if mode=='stuck' else stop)\n"
            "if mode=='tree':\n"
            " subprocess.Popen([sys.executable,__file__,str(root),'grandchild'])\n"
            "(root/(mode+'.ready')).write_text(str(__import__('os').getpid()))\n"
            "if mode.startswith('exit'):\n"
            " time.sleep(.2); sys.exit(int(mode[4:]))\n"
            "while True: time.sleep(.05)\n"
        )

    def tearDown(self):
        for process in self.processes:
            if process.poll() is None:
                process.kill()
            process.communicate(timeout=5)
        self.directory.cleanup()

    def start(self, modes, grace=0.3):
        commands = [[sys.executable, str(self.child), str(self.root), mode] for mode in modes]
        script = f"import manage; raise SystemExit(manage.supervise({commands!r},grace={grace!r}))"
        process = subprocess.Popen(
            [sys.executable, "-c", script],
            cwd=self.root,
            env=self.env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        self.processes.append(process)
        return process

    def ready(self, name):
        path = self.root / f"{name}.ready"
        deadline = time.monotonic() + 4
        while not path.exists():
            if time.monotonic() >= deadline:
                self.fail(f"Child did not start: {name}")
            time.sleep(0.01)
        return int(path.read_text())

    def test_child_failure_stops_sibling_and_preserves_exit_status(self):
        process = self.start(["alive", "exit7"])
        self.ready("alive")
        stdout, stderr = process.communicate(timeout=5)
        self.assertEqual(process.returncode, 7, (stdout, stderr))
        self.assertTrue((self.root / "alive.stopped").exists())

    def test_unexpected_success_exit_also_stops_whole_service(self):
        process = self.start(["alive", "exit0"])
        self.ready("alive")
        process.communicate(timeout=5)
        self.assertEqual(process.returncode, 1)
        self.assertTrue((self.root / "alive.stopped").exists())

    def test_sigterm_reaches_both_children_and_grandchild(self):
        process = self.start(["alive", "tree"])
        for name in ("alive", "tree", "grandchild"):
            self.ready(name)
        process.send_signal(signal.SIGTERM)
        output = process.communicate(timeout=5)
        self.assertEqual(process.returncode, 0, output)
        for name in ("alive", "tree", "grandchild"):
            self.assertTrue((self.root / f"{name}.stopped").exists(), name)

    def test_sigint_gracefully_stops_service(self):
        process = self.start(["alive", "other"])
        self.ready("alive")
        self.ready("other")
        process.send_signal(signal.SIGINT)
        output = process.communicate(timeout=5)
        self.assertEqual(process.returncode, 0, output)
        self.assertTrue((self.root / "alive.stopped").exists())
        self.assertTrue((self.root / "other.stopped").exists())

    def test_stuck_child_is_killed_after_grace_period(self):
        process = self.start(["stuck", "alive"], grace=0.15)
        stuck_pid = self.ready("stuck")
        self.ready("alive")
        process.send_signal(signal.SIGTERM)
        output = process.communicate(timeout=5)
        self.assertEqual(process.returncode, 0, output)
        with self.assertRaises(ProcessLookupError):
            os.kill(stuck_pid, 0)

    def test_second_spawn_failure_still_stops_first_child(self):
        commands = [
            [sys.executable, str(self.child), str(self.root), "alive"],
            ["/no/such/executable"],
        ]
        script = f"import manage; manage.supervise({commands!r},grace=.1)"
        result = subprocess.run(
            [sys.executable, "-c", script],
            cwd=self.root,
            env=self.env,
            capture_output=True,
            timeout=5,
        )
        self.assertNotEqual(result.returncode, 0)
        ready = self.root / "alive.ready"
        if ready.exists():
            with self.assertRaises(ProcessLookupError):
                os.kill(int(ready.read_text()), 0)


if __name__ == "__main__":
    unittest.main()
