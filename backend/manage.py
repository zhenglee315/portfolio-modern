"""Start and supervise FastAPI and APScheduler as one service."""

import argparse
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

BACKEND_DIR = Path(__file__).resolve().parent


def stop_children(processes, grace):
    # Each child owns a process group, including Uvicorn's worker processes.
    for process in processes:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    deadline = time.monotonic() + grace
    while any(process.poll() is None for process in processes) and time.monotonic() < deadline:
        time.sleep(0.05)
    for process in processes:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        except PermissionError:
            # Some POSIX sandboxes disallow signalling an already reaped
            # process group. A live direct child still needs to be terminated.
            if process.poll() is None:
                process.kill()
    for process in processes:
        process.wait()


def supervise(commands, *, grace=45, cwd=BACKEND_DIR):
    processes = []
    requested_signal = None

    def request_stop(signum, _frame):
        nonlocal requested_signal
        requested_signal = signum

    previous = {sig: signal.signal(sig, request_stop) for sig in (signal.SIGINT, signal.SIGTERM)}
    try:
        for command in commands:
            processes.append(subprocess.Popen(command, cwd=cwd, env=os.environ.copy(), start_new_session=True))
        while requested_signal is None:
            for process in processes:
                code = process.poll()
                if code is not None:
                    print(
                        f"[manage] Child PID {process.pid} exited ({code}); stopping service.",
                        file=sys.stderr,
                    )
                    return (128 - code) if code < 0 else (code or 1)
            time.sleep(0.1)
        return 0
    finally:
        try:
            stop_children(processes, grace)
        finally:
            for sig, handler in previous.items():
                signal.signal(sig, handler)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Start FastAPI and APScheduler together")
    parser.add_argument(
        "--node",
        action="store_true",
        help="Compatibility flag; every node loads its own schedules",
    )
    parser.add_argument(
        "--shutdown-timeout",
        type=float,
        default=45,
        help="Seconds before killing remaining child groups",
    )
    args = parser.parse_args(argv)
    if args.shutdown_timeout <= 0:
        parser.error("--shutdown-timeout must be positive")
    return supervise(
        [
            [sys.executable, str(BACKEND_DIR / "manage_fastapi.py")],
            [sys.executable, str(BACKEND_DIR / "manage_apscheduler.py"), "--run"],
        ],
        grace=args.shutdown_timeout,
    )


if __name__ == "__main__":
    raise SystemExit(main())
