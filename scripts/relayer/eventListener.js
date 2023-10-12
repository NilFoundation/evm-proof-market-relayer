/**
 * Provides functionality to set up event listeners for contract events.
 * @module eventListener
 */

const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

const blockNumberFilePath = path.join(__dirname, 'lastProcessedBlock.json');

/**
 * Retrieves the last processed block number from a file.
 * @async
 * @function
 * @returns {number} The last processed block number.
 */
async function getLastProcessedBlock() {
    try {
        if (!fs.existsSync(blockNumberFilePath)) {
            fs.writeFileSync(blockNumberFilePath, '0');
            return 0;
        }
        const data = fs.readFileSync(blockNumberFilePath, 'utf-8');
        return Number(data);
    } catch (error) {
        console.error('Failed to get last processed block:', error);
        return 0;
    }
}

/**
 * Saves the given block number as the last processed block.
 * @async
 * @function
 * @param {number} blockNumber - The block number to save.
 */
async function saveLastProcessedBlock(blockNumber) {
    try {
        fs.writeFileSync(blockNumberFilePath, String(blockNumber));
    } catch (error) {
        console.error('Failed to save last processed block:', error);
    }
}

/**
 * Sets up event listeners for the specified contract events.
 * @async
 * @function
 * @param {Array.<{eventName: string, processEventFunc: function}>} eventProcessingDescriptors - Descriptors for event processing.
 * @param {string} contractAddress - Address of the contract.
 * @param {Array} contractABI - ABI of the contract.
 */
async function setupEventListener(eventProcessingDescriptors, contractAddress, contractABI) {
    let isProcessing = false;

    const provider = hre.ethers.provider;
    const contract = new hre.ethers.Contract(contractAddress, contractABI, provider);

    let lastProcessedBlock = await getLastProcessedBlock();

    const network = await provider.getNetwork();
    console.log(`Connected to ${network.name} network`);

    provider.on('block', async (blockNumber) => {
        if (blockNumber <= lastProcessedBlock || isProcessing) return;

        isProcessing = true;

        try {
            for (let descriptor of eventProcessingDescriptors) {
                console.log(`Fetching ${descriptor.eventName} events from block ${lastProcessedBlock + 1} to ${blockNumber}...`);
                const events = await contract.queryFilter(descriptor.eventName, lastProcessedBlock + 1, blockNumber);
                console.log(`Processing ${events.length} ${descriptor.eventName} events...`);

                for (let event of events) {
                    await descriptor.processEventFunc(event);
                }
            }

            lastProcessedBlock = blockNumber;
            await saveLastProcessedBlock(lastProcessedBlock);
        } catch (error) {
            console.error('Error processing block:', error);
        } finally {
            isProcessing = false;
        }
    });

    provider.on('error', async (error) => {
        console.log('Connection error:', error.message, '. Trying to reconnect...');
        await handleConnectionError(eventProcessingDescriptors, contractAddress, contractABI);
    });

    console.log('Total listeners:', provider.listenerCount('block'));
}

/**
 * Handles connection errors by attempting to reconnect.
 * @async
 * @function
 * @param {Array.<{eventName: string, processEventFunc: function}>} eventProcessingDescriptors - Descriptors for event processing.
 * @param {string} contractAddress - Address of the contract.
 * @param {Array} contractABI - ABI of the contract.
 */
async function handleConnectionError(eventProcessDescriptors, contractAddress, contractABI) {
    const provider = hre.ethers.provider;
    const waitTime = 10 * 1000; // 10 seconds
    console.log(`Waiting for ${waitTime / 1000} seconds before retrying...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    console.log('Removing all listeners...');
    provider.removeAllListeners();
    
    console.log('Attempting to reconnect...');
    await setupEventListener(eventProcessDescriptors, contractAddress, contractABI);
}


module.exports = setupEventListener;
