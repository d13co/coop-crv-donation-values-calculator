#!/bin/bash

echo "Getting coop/algo prices"

cd trackprices

bash run.sh

echo "Getting LP token circulation & pool sizes"

cd ../lps

bash run.sh

cd ../getdonationvalues

node get-donations.js

echo "donors.csv and donations.csv in getdonationvalues/"
