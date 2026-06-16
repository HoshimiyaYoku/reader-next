#!/bin/bash
set -e

echo "🧪 World Map API 测试"
echo "===================="

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试配置
BASE_URL="http://localhost:8888"
TOKEN=""  # 需要先登录获取

echo ""
echo "📋 测试清单:"
echo "1. 构建地图 (POST /reader3/worldMap/build)"
echo "2. 获取地图 (GET /reader3/worldMap)"
echo "3. 生成坐标 (POST /reader3/worldMap/generateCoordinates)"
echo "4. 获取审查清单 (GET /reader3/worldMap/reviewItems)"
echo ""

# 测试函数
test_api() {
    local name=$1
    local method=$2
    local endpoint=$3
    local data=$4
    
    echo -n "测试 $name ... "
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$BASE_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$BASE_URL$endpoint")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -eq 200 ] || [ "$http_code" -eq 404 ]; then
        echo -e "${GREEN}✓${NC} (HTTP $http_code)"
        return 0
    else
        echo -e "${RED}✗${NC} (HTTP $http_code)"
        echo "  Response: $body"
        return 1
    fi
}

echo "${YELLOW}提示: 需要先启动后端服务 (cargo run)${NC}"
echo ""
read -p "按回车继续测试..."

# 测试 1: 构建地图
echo ""
echo "=== 测试 1: 构建地图 ==="
test_api "构建地图" "POST" "/reader3/worldMap/build" \
    '{"book_url":"https://example.com/book1","novel_title":"测试小说"}'

# 测试 2: 获取地图
echo ""
echo "=== 测试 2: 获取地图 ==="
test_api "获取地图" "GET" "/reader3/worldMap?book_url=https://example.com/book1" ""

# 测试 3: 生成坐标
echo ""
echo "=== 测试 3: 生成坐标 ==="
test_api "生成坐标" "POST" "/reader3/worldMap/generateCoordinates" \
    '{"book_url":"https://example.com/book1"}'

# 测试 4: 获取审查清单
echo ""
echo "=== 测试 4: 获取审查清单 ==="
test_api "获取审查清单" "GET" "/reader3/worldMap/reviewItems?book_url=https://example.com/book1" ""

echo ""
echo "===================="
echo -e "${GREEN}✅ API 测试完成${NC}"
echo ""
echo "💡 下一步:"
echo "1. 启动前端: cd frontend && npm run dev"
echo "2. 访问书籍详情页"
echo "3. 切换到'地图' tab"
echo "4. 点击'构建地图'按钮"
