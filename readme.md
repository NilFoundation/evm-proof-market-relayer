## Current implementation
1. `eventListener.js` - listens to and process specified events from the contract
    - Currently we are listening to only `OrderCreated` events
    - Not to process the same event twice we are storing last processed block number locally
    - This ensures, that we will not miss any events, but there is a chance, that some events will be processed several times
        - For that we will need to insure, for example, idempotency of order creation on Proof Market side
2. `orderRelay.js` - use eventListener to get events and prepare them for Proof Market; send them to Proof Market
3. `proofRelay.js` - periodically get submitted proofs from Proof Market, which are
    - Have status `completed` on Proof Market
    - Not yet processed by relayer 
        - For that we will add another relation (currently on `market` db) that will store relayer related information
    - After that process proofs and send them to the contract
    - Send request to Proof Market to mark corresponding order as processed
4. `priceRelay.js` - periodically get prices from Proof Market and send them to the contract


## Further improvements
1. Order cancellation
    - Currently we are not listening to (and don't even have) `OrderCancelled` events
    - We need to listen to them and send corresponding requests to Proof Market
2. Information aggregation
    - Relayer can also listen to `OrderCompleted`, `VerificationFailed` events and store this info in the dbms cluster and make it easily accessible 


## Current simplifications
- Statement prices are just sorted request/proposal prices for the statement (can easily switch it to anything else)
- Relay of statuses is not working independently from proof relay
    - This simplification is added to avoid concurrent complexity and ease debugging
- Public_input transfer from evm PM `uint256[]` format to PM format is not working
    - For now transfer mina account as is, but for mina state substitue public_input with a valid default one


## Testing
General testing steps (for details see below):

1. Start a local node:
```
npx hardhat node
```
2. Deploy the contracts to the local network:
```
npx hardhat run scripts/deploy.js --network localhost
```
3. Start the relayer:
```
npx hardhat run scripts/relayer/run.js
```
This script will produce a bunch of cryptic outputs, but it for each createOrder execution it will print after about 30-60 seconds:
`Order closed: BigNumber { _hex: <your order number>, _isBigNumber: true }`, which means that the order was successfully closed.

4. Submit an order:
```
npx hardhat run --network localhost scripts/createOrder.js
```

### Important note
Since there will be several people testing this thing, using the same instance of Proof Market, it is important to 
- clear the database from time to time 
    ```
    for doc in request 
    filter doc.sender == 'relayer'
    remove doc in request
    ```
- or just create a new relayer for your testing (do not forget to register it as a proof producer and provide the ethereum address). Specify relayer's credentials in `scripts/relayer/credentials.json`

## How to brake it
1. Submit an order with predefined updatedOn field set to $\approx \infty$
    - Make sure that users cannot submit orders with custom fields
2. Now we are sloppy with addresses
    - At least add a validation
3. Make sure that invalid proof does not brake the workflow
4. Make sure that some random exception allows seamless re-launch
5. Now orders with the same input are not processed properly


# Testing steps:
1. After Proof Market deployment update `deployed_addresses.json`
2. Set in `.env` file credentials:
```
INFURA_API_KEY="your infura api key"
OWNER_PRIVATE_KEY="owner private key"
RELAYER_PRIVATE_KEY="relayer private key"
USERNAME="relayer username on proof marker"
PASSWORD="relayer password on proof marker"
```

If testing on local network, then it will be sufficient to use the following:
```
USERNAME="your username"
PASSWORD="your password"
```

3. Run scripts:
```
npx hardhat run scripts/relayer/orderRelay.js --network localhost
```
```
npx hardhat run scripts/relayer/proofRelay.js --network localhost
```

<!-- Or just run `npx hardhat run scripts/relayer/run.js --network sepolia` to run both scripts. -->
<!-- Note: in that case logs will be mixed and really hard to read. -->