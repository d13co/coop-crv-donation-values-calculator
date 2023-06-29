#!/bin/bash

set -e

node --max-old-space-size=36384 pool.js 1002541853 IUUZ66NGBEKKTZ2RW7CAUOGEIBOFTYNUNMMEUSS3K5CSJAMGDY747F5KIA 1103395709 > app-tm-coop-algo.csv

node pool.js 1002541853 DHOG6OY4JHACEDCK27ZPFDOQISX7TQ4VRO5MUBQLIIVGSQ3N5BRMQ3SWLA 1107034824 > app-tm-coop-usdc.csv

node pool.js 1103395819 > app-pact-coop-algo.csv

gzip -f *.csv
