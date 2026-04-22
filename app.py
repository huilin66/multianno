import os
import subprocess
import sys
import time
import urllib.request
import webbrowser
from urllib.error import URLError


def wait_for_server_and_open_browser(url, timeout=15):
    """
    不断尝试连接指定的 URL，直到成功响应（HTTP 200）后，自动打开浏览器。
    """
    print(f"⏳ 等待前端服务启动 ({url})...")
    start_time = time.time()

    while time.time() - start_time < timeout:
        try:
            # 尝试请求页面
            response = urllib.request.urlopen(url)
            if response.getcode() == 200:
                print("✅ 前端服务已就绪！正在打开浏览器...")
                webbrowser.open(url)
                return True
        except URLError:
            # 还没启动好，忽略错误，等一秒后再试
            pass
        time.sleep(1)

    print(f"⚠️ 等待超时，服务可能仍在启动，请稍后手动访问: {url}")
    return False


def run_app():
    print("🚀 Starting MultiAnno...")

    # 获取各个模块的绝对路径
    root_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(root_dir, "backend")
    frontend_dir = os.path.join(root_dir, "frontend")

    backend_process = None
    frontend_process = None

    try:
        # 1. 启动后端
        print("-> Starting Backend (FastAPI)...")
        # 使用 sys.executable 确保使用当前运行 app.py 的同一个 Python 环境
        backend_process = subprocess.Popen([sys.executable, "main.py"], cwd=backend_dir)

        # 2. 启动前端
        print("-> Starting Frontend (Vite)...")
        # 跨平台处理：Windows 下的 npm 实际是 npm.cmd
        npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
        frontend_process = subprocess.Popen([npm_cmd, "run", "dev"], cwd=frontend_dir)

        # 3. 智能等待并自动打开浏览器
        # 默认 Vite 跑在 5173 端口，如果你的改了请对应修改
        frontend_url = "http://localhost:5173"
        wait_for_server_and_open_browser(frontend_url)

        print("\n✨ MultiAnno is running! Press Ctrl+C in this terminal to stop.\n")

        # 保持主进程运行，防止退出
        backend_process.wait()
        frontend_process.wait()

    except KeyboardInterrupt:
        print("\n🛑 Stopping MultiAnno services...")
    finally:
        # 4. 优雅退出：当你按下 Ctrl+C 时，确保前后端进程都被杀掉，不留僵尸进程
        if backend_process:
            backend_process.terminate()
        if frontend_process:
            frontend_process.terminate()
        print("Goodbye!")
        sys.exit(0)


if __name__ == "__main__":
    run_app()
