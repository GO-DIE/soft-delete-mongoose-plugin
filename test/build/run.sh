#!/bin/bash
cd ./test/build/

echo `pwd`

chmod +x rs-init.sh

docker-compose up -d

sleep 5
# If run in windows(git bash): use // replace /
docker exec mongo1 //scripts//rs-init.sh

cd ../../
