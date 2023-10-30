#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Paths to the repositories relative to the script's location
RELAYER_REPO_PATH="$DIR/../../evm-proof-market-relayer"
TOOLCHAIN_REPO_PATH="$DIR/../../proof-market-toolchain"
CONTRACT_REPO_PATH="$DIR/../../evm-proof-market"
MINA_STATE_PROOF_REPO_PATH="$DIR/../../mina-state-proof"

# Variables
privateKey=${PRIVATE_KEY:-"0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"}
password=${PASSWORD:-"123"}

# Navigate to the contract repository
cd $CONTRACT_REPO_PATH
ls -la

# Compile contracts
npx hardhat compile

# Start the local hardhat node in the background
npx hardhat node &

# Give the node some time to initialize
sleep 3

# Compile and deploy contracts
npx hardhat deployContract --network localhost

# Add statement
# statementId=32326
statementId=79169223
unifiedAdditionVerifier="0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9"
accountPathVerifier="0x9d4454B023096f34B160D6B654540c56A1F81688"
# npx hardhat addStatement --statement-id $statementId --verifiers $unifiedAdditionVerifier --network localhost
npx hardhat addStatement --statement-id $statementId --verifiers $accountPathVerifier --network localhost

# Create a keystore file from test private key
node scripts/interact.js createKeystoreFromPrivateKey --pk $privateKey --password $password

# Mint and approve tokens
node scripts/interact.js mintAndApprove --password $password

# Create a new order
price=100
# inputFilePath="scripts/test_inputs/unified_addition.json"
inputFilePath="scripts/test_inputs/account_mina.json"
node scripts/interact.js createOrder --statementId $statementId --price $price --inputFile $inputFilePath --password $password --force

# Copy the deployed addresses file to the relayer repository
cp ./deployed_addresses.json $RELAYER_REPO_PATH/deployed_addresses.json

# Navigate to the mina-state-proof repository
cd $MINA_STATE_PROOF_REPO_PATH
npx hardhat compile
npx hardhat deploy --network localhost --reset

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

# Restore last processes block counter
echo "0" > $RELAYER_REPO_PATH/scripts/relayer/lastProcessedBlock.json

# Navigate to the relayer repository
cd $RELAYER_REPO_PATH

# Start the relayer daemon script
npx hardhat run scripts/relayer/orderRelay.js --network localhost &
npx hardhat run scripts/relayer/proofRelay.js --network localhost &

# Keep the script running
tail -f /dev/null
