#!/usr/bin/env python3
"""
Persistent Linux PTY Shell Worker for JARVISOS Cloud Terminal.
Allocates a real Linux PTY (/dev/pts/N), optionally drops kernel privileges
irreversibly via initgroups/setgid/setuid for non-root USER MODE, and streams
live output + kernel-verified UID/user/cwd state back over JSON lines.
"""

import fcntl
import json
import os
import pty
import pwd
import select
import signal
import struct
import subprocess
import sys
import termios
import threading
import time
import uuid


def emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def set_pty_size(fd: int, rows: int = 36, cols: int = 120) -> None:
    try:
        winsize = struct.pack("HHHH", rows, cols, 0, 0)
        fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)
    except Exception:
        pass


def disable_pty_echo(fd: int) -> None:
    try:
        attrs = termios.tcgetattr(fd)
        attrs[3] = attrs[3] & ~termios.ECHO
        termios.tcsetattr(fd, termios.TCSANOW, attrs)
    except Exception:
        pass


def main() -> None:
    if len(sys.argv) < 5:
        emit({"type": "fatal", "error": "Usage: pty-shell-worker.py <username> <uid> <gid> <cwd> [login]"})
        sys.exit(1)

    target_user = sys.argv[1]
    target_uid = int(sys.argv[2])
    target_gid = int(sys.argv[3])
    start_cwd = sys.argv[4]
    is_login = len(sys.argv) > 5 and sys.argv[5] == "login"

    # Read initial environment from stdin line 1 (safe, never passed via argv)
    env_line = sys.stdin.readline()
    try:
        child_env = json.loads(env_line) if env_line else {}
    except Exception:
        child_env = {}

    if not isinstance(child_env, dict):
        child_env = {}

    shell_path = "/usr/bin/bash" if os.path.exists("/usr/bin/bash") else "/bin/bash"
    master_fd, slave_fd = pty.openpty()
    set_pty_size(master_fd, 36, 120)
    disable_pty_echo(master_fd)

    try:
        tty_name = os.ttyname(slave_fd)
    except Exception:
        tty_name = "/dev/pts/0"

    def preexec_setup() -> None:
        os.setsid()
        try:
            fcntl.ioctl(slave_fd, termios.TIOCSCTTY, 0)
        except Exception:
            pass
        # Real kernel privilege separation: irreversibly drop privileges for non-root users
        if target_uid != 0:
            try:
                pw = pwd.getpwuid(target_uid)
                os.initgroups(pw.pw_name, target_gid)
            except Exception:
                pass
            os.setgid(target_gid)
            os.setuid(target_uid)
        else:
            os.setgid(0)
            os.setuid(0)

    bash_args = [shell_path, "--norc", "--noprofile"]
    if is_login:
        # Preserve clean login-like semantics while keeping deterministic prompt suppression
        child_env["SHLVL"] = "1"

    safe_cwd = start_cwd if os.path.isdir(start_cwd) else "/"

    proc = subprocess.Popen(
        bash_args,
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        cwd=safe_cwd,
        env=child_env,
        preexec_fn=preexec_setup,
        close_fds=True,
    )
    os.close(slave_fd)

    # Configure clean non-echoing bash settings & standard Linux color aliases
    init_token = f"__JINIT_{uuid.uuid4().hex}__"
    init_script = "\n".join(
        [
            "export PS1='' PS2='' PROMPT_COMMAND=''",
            "stty -echo 2>/dev/null || true",
            "bind 'set enable-bracketed-paste off' 2>/dev/null || true",
            "shopt -s expand_aliases 2>/dev/null || true",
            "alias ls='ls --color=always'",
            "alias ll='ls -alF --color=always'",
            "alias la='ls -A --color=always'",
            "alias l='ls -CF --color=always'",
            "alias grep='grep --color=always'",
            f"printf '\\n{init_token}:%d:%s:%s\\n' \"$(id -u)\" \"$(id -un)\" \"$(pwd -P)\"",
            "",
        ]
    )
    os.write(master_fd, init_script.encode("utf-8"))

    # Wait briefly for init verification marker to read genuine kernel UID/user/cwd
    init_buf = ""
    ready_uid = target_uid
    ready_user = target_user
    ready_cwd = safe_cwd
    deadline = time.time() + 4.0
    while time.time() < deadline:
        r, _, _ = select.select([master_fd], [], [], 0.1)
        if r:
            try:
                chunk = os.read(master_fd, 4096).decode("utf-8", "replace")
                init_buf += chunk
                if init_token in init_buf:
                    for line in init_buf.replace("\r", "").splitlines():
                        if line.startswith(init_token + ":"):
                            parts = line.split(":", 3)
                            if len(parts) == 4:
                                try:
                                    ready_uid = int(parts[1])
                                except ValueError:
                                    pass
                                ready_user = parts[2] or target_user
                                ready_cwd = parts[3] or safe_cwd
                    break
            except OSError:
                break

    emit(
        {
            "type": "ready",
            "uid": ready_uid,
            "user": ready_user,
            "cwd": ready_cwd,
            "tty": tty_name,
            "pid": proc.pid,
        }
    )

    state_lock = threading.Lock()
    active_cmd = {
        "id": None,
        "marker": None,
        "interrupted": False,
        "bytes_sent": 0,
        "truncated": False,
    }
    max_output_bytes = 256 * 1024
    stop_event = threading.Event()

    def write_master(text: str) -> None:
        try:
            os.write(master_fd, text.encode("utf-8"))
        except OSError:
            pass

    def pty_reader() -> None:
        pending = ""
        while not stop_event.is_set():
            try:
                r, _, _ = select.select([master_fd], [], [], 0.08)
            except Exception:
                break
            if not r:
                if proc.poll() is not None:
                    break
                continue
            try:
                raw = os.read(master_fd, 4096)
                if not raw:
                    break
            except OSError:
                break

            text = raw.decode("utf-8", "replace").replace("\r\n", "\n")
            with state_lock:
                cmd_id = active_cmd["id"]
                marker = active_cmd["marker"]

            if not cmd_id or not marker:
                continue

            pending += text

            # Check if completion marker arrived
            marker_prefix = f"__JEND_{marker}__:"
            idx = pending.find(marker_prefix)
            if idx != -1:
                after = pending[idx:]
                nl_idx = after.find("\n")
                if nl_idx == -1:
                    # Wait for trailing newline of marker line
                    continue

                before_text = pending[:idx]
                # Remove the single synthetic leading newline emitted right before marker
                if before_text.endswith("\n"):
                    before_text = before_text[:-1]

                if before_text:
                    with state_lock:
                        if not active_cmd["truncated"]:
                            emit({"type": "output", "id": cmd_id, "data": before_text})

                marker_line = after[:nl_idx].strip()
                pending = after[nl_idx + 1 :]

                # Format: __JEND_<tok>__:<exitCode>:<uid>:<user>:<cwd>
                parts = marker_line.split(":", 4)
                exit_code = 0
                verified_uid = ready_uid
                verified_user = ready_user
                verified_cwd = ready_cwd
                if len(parts) == 5:
                    try:
                        exit_code = int(parts[1])
                    except ValueError:
                        exit_code = 0
                    try:
                        verified_uid = int(parts[2])
                    except ValueError:
                        pass
                    verified_user = parts[3] or verified_user
                    verified_cwd = parts[4] or verified_cwd

                with state_lock:
                    if active_cmd["interrupted"] and exit_code == 0:
                        exit_code = 130
                    active_cmd["id"] = None
                    active_cmd["marker"] = None
                    active_cmd["interrupted"] = False
                    active_cmd["bytes_sent"] = 0
                    active_cmd["truncated"] = False

                emit(
                    {
                        "type": "done",
                        "id": cmd_id,
                        "exitCode": exit_code,
                        "uid": verified_uid,
                        "user": verified_user,
                        "cwd": verified_cwd,
                        "tty": tty_name,
                    }
                )
                continue

            # Keep a small tail buffer in case marker is split across reads
            guard_len = len(marker_prefix) + 160
            if len(pending) > guard_len:
                flush_text = pending[:-guard_len]
                pending = pending[-guard_len:]
            elif "\n" in pending and "__JEND_" not in pending:
                # Safe to flush immediately line-by-line for real-time streaming
                flush_text = pending
                pending = ""
            else:
                flush_text = ""

            if flush_text:
                with state_lock:
                    if not active_cmd["truncated"]:
                        b_len = len(flush_text.encode("utf-8"))
                        if active_cmd["bytes_sent"] + b_len > max_output_bytes:
                            active_cmd["truncated"] = True
                            emit(
                                {
                                    "type": "output",
                                    "id": cmd_id,
                                    "data": "\n[Output truncated at 256 KB limit]\n",
                                }
                            )
                        else:
                            active_cmd["bytes_sent"] += b_len
                            emit({"type": "output", "id": cmd_id, "data": flush_text})

        # Shell process exited
        with state_lock:
            cmd_id = active_cmd["id"]
            active_cmd["id"] = None
            active_cmd["marker"] = None
        if cmd_id:
            emit(
                {
                    "type": "done",
                    "id": cmd_id,
                    "exitCode": proc.returncode if proc.returncode is not None else 0,
                    "uid": ready_uid,
                    "user": ready_user,
                    "cwd": ready_cwd,
                    "tty": tty_name,
                    "shellExited": True,
                }
            )
        emit({"type": "exited", "code": proc.returncode if proc.returncode is not None else 0})

    reader_thread = threading.Thread(target=pty_reader, daemon=True)
    reader_thread.start()

    try:
        for raw_line in sys.stdin:
            raw_line = raw_line.strip()
            if not raw_line:
                continue
            try:
                msg = json.loads(raw_line)
            except Exception:
                continue

            msg_type = msg.get("type")

            if msg_type == "exec":
                cmd_id = str(msg.get("id", ""))
                command = str(msg.get("command", ""))
                marker = uuid.uuid4().hex[:16]
                with state_lock:
                    active_cmd["id"] = cmd_id
                    active_cmd["marker"] = marker
                    active_cmd["interrupted"] = False
                    active_cmd["bytes_sent"] = 0
                    active_cmd["truncated"] = False

                # Execute user's exact command in persistent bash PTY, then emit kernel-verified state
                probe = (
                    f"__JRC=$?; "
                    f"printf '\\n__JEND_{marker}__:%d:%d:%s:%s\\n' "
                    f"\"$__JRC\" \"$(id -u)\" \"$(id -un)\" \"$(pwd -P)\"; "
                    f"(exit $__JRC)\n"
                )
                write_master(f"{command}\n{probe}")

            elif msg_type == "sigint":
                with state_lock:
                    cmd_id = active_cmd["id"]
                    active_cmd["interrupted"] = True

                def find_descendants(root_pid: int) -> list:
                    children_map = {}
                    try:
                        for entry in os.listdir("/proc"):
                            if not entry.isdigit():
                                continue
                            try:
                                with open(f"/proc/{entry}/stat", "r", encoding="utf-8", errors="ignore") as f:
                                    st = f.read()
                                rp = st.rfind(")")
                                if rp == -1:
                                    continue
                                ppid = int(st[rp + 2 :].split()[1])
                                children_map.setdefault(ppid, []).append(int(entry))
                            except Exception:
                                continue
                    except Exception:
                        return []
                    desc = []
                    stack = list(children_map.get(root_pid, []))
                    while stack:
                        p = stack.pop()
                        desc.append(p)
                        stack.extend(children_map.get(p, []))
                    return desc

                descendants = find_descendants(proc.pid)
                for cpid in descendants:
                    try:
                        os.kill(cpid, signal.SIGINT)
                    except Exception:
                        pass

                if descendants:
                    def escalate_if_needed(target_pids: list, expected_id: str) -> None:
                        time.sleep(0.15)
                        with state_lock:
                            still_active = active_cmd["id"] == expected_id
                        if not still_active:
                            return
                        for cpid in target_pids:
                            try:
                                os.kill(cpid, signal.SIGTERM)
                            except Exception:
                                pass
                        time.sleep(0.15)
                        with state_lock:
                            still_active = active_cmd["id"] == expected_id
                        if still_active:
                            for cpid in target_pids:
                                try:
                                    os.kill(cpid, signal.SIGKILL)
                                except Exception:
                                    pass

                    if cmd_id:
                        threading.Thread(
                            target=escalate_if_needed,
                            args=(descendants, cmd_id),
                            daemon=True,
                        ).start()
                else:
                    # Also send Ctrl+C to PTY foreground group if no child was found
                    try:
                        fg_pgrp = termios.tcgetpgrp(master_fd)
                        if fg_pgrp > 0 and fg_pgrp != proc.pid:
                            os.killpg(fg_pgrp, signal.SIGINT)
                    except Exception:
                        pass
                    write_master("\x03")

                if cmd_id:
                    emit({"type": "output", "id": cmd_id, "data": "^C\n"})

            elif msg_type == "resize":
                rows = int(msg.get("rows", 36))
                cols = int(msg.get("cols", 120))
                set_pty_size(master_fd, max(10, min(120, rows)), max(40, min(240, cols)))

            elif msg_type == "close":
                break
    finally:
        stop_event.set()
        try:
            proc.terminate()
            proc.wait(timeout=0.5)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass
        try:
            os.close(master_fd)
        except Exception:
            pass


if __name__ == "__main__":
    main()
