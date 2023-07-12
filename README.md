# CRV USD-value donation calculator

Process:

- Get ALGO & COOP prices from vestige 15m candle API (trackprices)
- Get LP circulation & LP pool sizes from chain, group by 15min bands (high/low)
- Run get-donations to get USD values as csv files

Requirements: node, npm

Setup: run `npm install`

Run `bash run.sh` in the root of the project

Output will be under getdonationvalues/donations.csv and donors.csv
