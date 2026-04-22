#!/bin/bash
set -e

cd /opt/reaclass

echo ">>> 最新コードを取得中..."
git pull

echo ">>> Dockerイメージをビルド・再起動中..."
docker compose up -d --build

echo ">>> 完了！"
docker compose ps
