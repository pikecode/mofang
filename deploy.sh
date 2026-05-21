#!/bin/bash

# 魔方网表权限查看器部署脚本

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}=== 魔方网表权限查看器部署 ===${NC}"

# 检查Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}错误: Docker未安装${NC}"
    exit 1
fi

IMAGE_NAME="mofang-permission-viewer"
TAG="latest"

# 构建镜像
echo -e "${YELLOW}构建Docker镜像...${NC}"
docker build -t ${IMAGE_NAME}:${TAG} .

if [ $? -ne 0 ]; then
    echo -e "${RED}构建失败${NC}"
    exit 1
fi

# 停止旧容器
if docker ps -a | grep -q ${IMAGE_NAME}; then
    echo -e "${YELLOW}停止旧容器...${NC}"
    docker stop ${IMAGE_NAME} 2>/dev/null || true
    docker rm ${IMAGE_NAME} 2>/dev/null || true
fi

# 运行新容器
echo -e "${YELLOW}启动容器...${NC}"
docker run -d \
    --name ${IMAGE_NAME} \
    --restart unless-stopped \
    -p 8080:80 \
    ${IMAGE_NAME}:${TAG}

if [ $? -eq 0 ]; then
    echo -e "${GREEN}部署成功!${NC}"
    echo -e "${GREEN}访问: http://localhost:8080?spaceId=yourSpaceId${NC}"
else
    echo -e "${RED}启动失败${NC}"
    exit 1
fi
