import importlib
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser
from urllib.error import URLError


BACKEND_HOST = "127.0.0.1"
BACKEND_PORT = 8090
FRONTEND_HOST = "127.0.0.1"
FRONTEND_PORT = 5173

BACKEND_HEALTH_URL = f"http://{BACKEND_HOST}:{BACKEND_PORT}/api/health"
FRONTEND_URL = f"http://{FRONTEND_HOST}:{FRONTEND_PORT}"

BACKEND_IMPORTS = [
    ("fastapi", "fastapi"),
    ("uvicorn", "uvicorn"),
    ("pydantic", "pydantic"),
    ("cv2", "opencv-python"),
    ("skimage", "scikit-image"),
    ("imagecodecs", "imagecodecs"),
    ("numpy", "numpy"),
    ("pandas", "pandas"),
]


class StartupError(RuntimeError):
    pass


def print_box(title, lines):
    print(f"\n{title}")
    print("-" * len(title))
    for line in lines:
        print(line)
    print()


def ensure_path_exists(path, description):
    if not os.path.exists(path):
        raise StartupError(f"{description} not found: {path}")


def check_backend_dependencies():
    missing = []
    for module_name, package_name in BACKEND_IMPORTS:
        try:
            importlib.import_module(module_name)
        except (ImportError, OSError) as exc:
            missing.append(f"- {package_name} ({module_name}): {exc}")

    if missing:
        raise StartupError(
            "Backend basic dependencies are missing or broken.\n"
            + "\n".join(missing)
            + "\n\nInstall them with:\n"
            + "  cd backend\n"
            + "  pip install -r requirements.txt\n\n"
            + "AI dependencies are optional and are not checked by this launcher."
        )


def find_npm():
    candidates = ["npm.cmd", "npm"] if os.name == "nt" else ["npm"]
    for candidate in candidates:
        path = shutil.which(candidate)
        if path:
            return path
    return None


def check_frontend_dependencies(frontend_dir):
    npm_cmd = find_npm()
    if not npm_cmd:
        raise StartupError(
            "npm was not found. Please install Node.js and make sure npm is available in PATH."
        )

    node_modules = os.path.join(frontend_dir, "node_modules")
    if not os.path.isdir(node_modules):
        raise StartupError(
            "Frontend dependencies are not installed.\n\n"
            "Install them with:\n"
            "  cd frontend\n"
            "  npm install"
        )

    return npm_cmd


def ensure_port_free(host, port, service_name):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((host, port))
        except OSError:
            raise StartupError(
                f"{service_name} port {host}:{port} is already in use.\n"
                "Stop the existing process or change the configured port before starting MultiAnno."
            )


def start_process(command, cwd, name):
    print(f"-> Starting {name}...")
    kwargs = {"cwd": cwd}
    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        kwargs["preexec_fn"] = os.setsid
    return subprocess.Popen(command, **kwargs)


def wait_for_http(url, process, name, timeout=30):
    print(f"-> Waiting for {name} ({url})...")
    start_time = time.time()

    while time.time() - start_time < timeout:
        if process.poll() is not None:
            raise StartupError(f"{name} exited early with code {process.returncode}.")

        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if 200 <= response.getcode() < 500:
                    print(f"-> {name} is ready.")
                    return
        except URLError:
            pass
        except TimeoutError:
            pass

        time.sleep(1)

    raise StartupError(f"{name} did not become ready within {timeout} seconds: {url}")


def terminate_process_tree(process, name):
    if not process or process.poll() is not None:
        return

    print(f"-> Stopping {name}...")
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        return

    try:
        os.killpg(os.getpgid(process.pid), signal.SIGTERM)
        process.wait(timeout=5)
    except Exception:
        try:
            os.killpg(os.getpgid(process.pid), signal.SIGKILL)
        except Exception:
            process.kill()


def run_preflight_checks(root_dir, backend_dir, frontend_dir):
    ensure_path_exists(os.path.join(backend_dir, "main.py"), "Backend entry")
    ensure_path_exists(os.path.join(frontend_dir, "package.json"), "Frontend package")

    check_backend_dependencies()
    npm_cmd = check_frontend_dependencies(frontend_dir)

    ensure_port_free(BACKEND_HOST, BACKEND_PORT, "Backend")
    ensure_port_free(FRONTEND_HOST, FRONTEND_PORT, "Frontend")

    return npm_cmd


def run_app():
    print("Starting MultiAnno...")

    root_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(root_dir, "backend")
    frontend_dir = os.path.join(root_dir, "frontend")

    backend_process = None
    frontend_process = None
    exit_code = 0

    try:
        npm_cmd = run_preflight_checks(root_dir, backend_dir, frontend_dir)

        backend_process = start_process(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "main:app",
                "--host",
                BACKEND_HOST,
                "--port",
                str(BACKEND_PORT),
            ],
            backend_dir,
            "Backend (FastAPI)",
        )
        wait_for_http(BACKEND_HEALTH_URL, backend_process, "Backend")

        frontend_process = start_process(
            [
                npm_cmd,
                "run",
                "dev",
                "--",
                "--host",
                FRONTEND_HOST,
                "--port",
                str(FRONTEND_PORT),
                "--strictPort",
            ],
            frontend_dir,
            "Frontend (Vite)",
        )
        wait_for_http(FRONTEND_URL, frontend_process, "Frontend")

        print(f"Opening browser: {FRONTEND_URL}")
        webbrowser.open(FRONTEND_URL)

        print("\nMultiAnno is running. Press Ctrl+C in this terminal to stop.\n")

        while True:
            if backend_process.poll() is not None:
                raise StartupError(
                    f"Backend stopped unexpectedly with code {backend_process.returncode}."
                )
            if frontend_process.poll() is not None:
                raise StartupError(
                    f"Frontend stopped unexpectedly with code {frontend_process.returncode}."
                )
            time.sleep(1)

    except KeyboardInterrupt:
        print("\nStopping MultiAnno services...")
    except StartupError as exc:
        exit_code = 1
        print_box("Startup failed", str(exc).splitlines())
    finally:
        terminate_process_tree(frontend_process, "Frontend")
        terminate_process_tree(backend_process, "Backend")
        print("Goodbye!")
        sys.exit(exit_code)


if __name__ == "__main__":
    run_app()
