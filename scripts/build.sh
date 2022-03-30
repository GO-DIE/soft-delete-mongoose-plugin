#!/bin/bash
# cd ./build/
cd "$(dirname "$0")"

echo `pwd`

chmod +x rs-init.sh

docker-compose up -d

sleep 3

# If run in windows(git bash): use // replace /
docker exec mongo1 //scripts//rs-init.sh

sleep 3
