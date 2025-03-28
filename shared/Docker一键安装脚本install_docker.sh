#!/bin/bash

# 确保是root权限
if [ "$(id -u)" -ne "0" ]; then
  echo "请使用 root 权限执行此脚本！"
  exit 1
fi

# 检查操作系统是否为 Debian 或 Ubuntu
OS=$(lsb_release -si)

# 确认是支持的操作系统
if [[ "$OS" != "Ubuntu" && "$OS" != "Debian" ]]; then
  echo "此脚本仅支持 Ubuntu 和 Debian 系统。"
  exit 1
fi

# 更新 apt 包索引
echo "更新 apt 包索引..."
apt update -y || { echo "更新 apt 包索引失败"; exit 1; }

# 安装一些必须的依赖
echo "安装必需的依赖..."
apt install -y apt-transport-https ca-certificates curl software-properties-common gnupg || { echo "安装依赖失败"; exit 1; }

# 添加 Docker 的 GPG 密钥
echo "添加 Docker GPG 密钥..."
curl -fsSL https://download.docker.com/linux/$(lsb_release -si | tr '[:upper:]' '[:lower:]')/gpg | apt-key add - || { echo "添加 GPG 密钥失败"; exit 1; }

# 添加 Docker 仓库源
if [ "$OS" == "Ubuntu" ]; then
  echo "正在添加 Docker 仓库源 (Ubuntu)..."
  add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" || { echo "添加仓库源失败"; exit 1; }
elif [ "$OS" == "Debian" ]; then
  echo "正在添加 Docker 仓库源 (Debian)..."
  add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/debian $(lsb_release -cs) stable" || { echo "添加仓库源失败"; exit 1; }
fi

# 更新 apt 包索引
echo "再次更新 apt 包索引..."
apt update -y || { echo "再次更新 apt 包索引失败"; exit 1; }

# 检查 Docker 是否已经安装
if dpkg -l | grep -q docker; then
  echo "Docker 已经安装，跳过安装过程。"
else
  # 安装 Docker
  echo "安装 Docker..."
  apt install -y docker-ce docker-ce-cli containerd.io || { echo "安装 Docker 失败"; exit 1; }
fi

# 启动 Docker 服务
echo "启动 Docker 服务..."
systemctl start docker || { echo "启动 Docker 服务失败"; exit 1; }

# 设置 Docker 开机自启
echo "设置 Docker 开机自启..."
systemctl enable docker || { echo "设置 Docker 开机自启失败"; exit 1; }

# 检查 Docker 是否安装成功
echo "检查 Docker 版本..."
docker --version || { echo "Docker 安装验证失败"; exit 1; }

# 完成安装
echo "Docker 安装完成！"
