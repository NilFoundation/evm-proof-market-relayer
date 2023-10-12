#!/bin/bash

# Define paths to the repositories
CONTRACT_REPO_PATH="/Users/vitaly/Code/evm-proof-market"
RELAYER_REPO_PATH="/Users/vitaly/Code/evm-proof-market-relayer"
TOOLCHAIN_REPO_PATH="/Users/vitaly/Code/proof-market-toolchain"

# Generate a random string for uniqueness
RANDOM_STRING=$(openssl rand -hex 12)

cd $TOOLCHAIN_REPO_PATH
USERNAME="relayer$RANDOM_STRING"
PASSWORD="123"
echo "USERNAME=\"$USERNAME\""
python3 scripts/signup.py user -u $USERNAME -p $PASSWORD -e none

# Replace username and password in .env file in relayer repo
sed -i "" "s/^USERNAME=.*$/USERNAME=\"$USERNAME\"/" $RELAYER_REPO_PATH/.env
sed -i "" "s/^PASSWORD=.*$/PASSWORD=\"$PASSWORD\"/" $RELAYER_REPO_PATH/.env

# Write 0 to lastProcessedBlock.json
echo "0" > $RELAYER_REPO_PATH/scripts/relayer/lastProcessedBlock.json

# Navigate to the relayer repository
cd $RELAYER_REPO_PATH

# Start the relayer daemon script
npx hardhat run scripts/relayer/orderRelay.js --network localhost &
npx hardhat run scripts/relayer/proofRelay.js --network localhost &

# Keep the script running
tail -f /dev/null
