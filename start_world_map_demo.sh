#!/bin/bash

# World Map 功能演示启动脚本

echo "🗺️  World Map 功能演示"
echo "======================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 检查是否在正确的目录
if [ ! -f "Cargo.toml" ]; then
    echo -e "${RED}错误: 请在 reader 项目根目录运行此脚本${NC}"
    exit 1
fi

echo -e "${BLUE}步骤 1/3: 编译后端${NC}"
echo "----------------"
cargo build --release
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ 后端编译失败${NC}"
    exit 1
fi
echo -e "${GREEN}✅ 后端编译成功${NC}"
echo ""

echo -e "${BLUE}步骤 2/3: 启动后端服务${NC}"
echo "----------------"
echo "后端将在后台运行..."
cargo run --release > backend.log 2>&1 &
BACKEND_PID=$!
echo "后端 PID: $BACKEND_PID"
echo "日志文件: backend.log"
sleep 3

# 检查后端是否启动成功
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo -e "${RED}❌ 后端启动失败，查看 backend.log${NC}"
    exit 1
fi
echo -e "${GREEN}✅ 后端启动成功 (http://localhost:8888)${NC}"
echo ""

echo -e "${BLUE}步骤 3/3: 启动前端服务${NC}"
echo "----------------"
cd frontend
if [ ! -d "node_modules" ]; then
    echo "安装前端依赖..."
    npm install
fi

echo ""
echo -e "${GREEN}===================="
echo "🎉 准备完成！"
echo "====================${NC}"
echo ""
echo "前端开发服务器将在浏览器中打开..."
echo ""
echo -e "${YELLOW}测试步骤:${NC}"
echo "1. 登录系统"
echo "2. 打开任意书籍"
echo "3. 切换到 '地图' tab"
echo "4. 点击 '构建地图'"
echo "5. 点击 '生成坐标'"
echo "6. 查看 SVG 画布和实体列表"
echo ""
echo -e "${YELLOW}停止服务:${NC}"
echo "  按 Ctrl+C 停止前端"
echo "  运行: kill $BACKEND_PID  停止后端"
echo ""

npm run dev

