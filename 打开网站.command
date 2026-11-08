#!/bin/bash
# 双击这个文件：启动「GitHub 精选」本地服务，并打开网站。
# 收藏存在项目里的 data/favorites.json，关掉浏览器也不会丢。

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG=/tmp/gh-awesome-favserver.log

if [ ! -d "$ROOT" ]; then
  echo "找不到项目目录：$ROOT"
  echo "网站可能被移动或删掉了。按任意键关闭。"
  read -n 1
  exit 1
fi
cd "$ROOT" || exit 1

# 本机请求绕开代理（开着 Clash 之类时，127.0.0.1 也会被代理吞掉）
export no_proxy="127.0.0.1,localhost"
export NO_PROXY="$no_proxy"

# 端口通不通（毫秒级，不依赖网络）
port_open() {
  ( exec 3<>"/dev/tcp/127.0.0.1/${1}" ) 2>/dev/null
}

# 确认那个端口上跑的是我们的服务
is_ours() {
  /usr/bin/curl -s --noproxy "*" --max-time 1 \
    "http://127.0.0.1:${1}/api/health" 2>/dev/null | grep -q 'gh-awesome'
}

find_port() {
  local p
  for p in $(seq 8765 8775); do
    if port_open "$p" && is_ours "$p"; then
      echo "$p"
      return 0
    fi
  done
  return 1
}

wait_port() {
  local i p
  for i in $(seq 1 12); do
    p=$(find_port) && { echo "$p"; return 0; }
    sleep 0.3
  done
  return 1
}

open_site() {
  [ -z "$1" ] && return 1
  echo "网站地址：http://127.0.0.1:${1}/index.html"
  open "http://127.0.0.1:${1}/index.html"
}

# 已经在跑 → 直接打开
PORT=$(find_port)
if [ -n "$PORT" ]; then
  echo "服务已在运行，正在打开网站…"
  open_site "$PORT"
  sleep 0.5
  exit 0
fi

# 清掉卡住的旧实例（命令行里带 fav_server.py 的，只有本项目用这个名字）
pkill -f "fav_server.py" 2>/dev/null
sleep 0.3

# 后台启动并彻底脱离终端：脚本退出、关掉窗口都不影响它
/usr/bin/python3 tools/fav_server.py --daemon --port 8765 >"$LOG" 2>&1
PORT=$(wait_port)

if [ -n "$PORT" ]; then
  echo "服务已启动，正在打开网站…"
  open_site "$PORT"
  sleep 0.5
  exit 0
fi

# 兜底：前台运行（窗口别关）
echo "后台启动被拦住了，改成前台运行。"
echo "网站照常能用，只是这个窗口别关（收藏不会丢）。"
echo
exec /usr/bin/python3 tools/fav_server.py --port 8765 --open
