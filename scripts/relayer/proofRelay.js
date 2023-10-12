/**
 * Module to relay proofs and statuses related to orders.
 * @module relayProofsAndStatuses
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { ethers } = require("hardhat");

let constants;

function readJSONFile(filePath) {
    return JSON.parse(fs.readFileSync(path.join(__dirname, filePath), 'utf-8'));
}

/**
 * Sends an authenticated GET request to a given URL.
 * @async
 * @function
 * @param {string} url - The URL to send the GET request to.
 * @returns {Object} Axios response object.
 */
async function getAuthenticated(url) {
    return await axios.get(url, {
        auth: {
            username: process.env.USERNAME,
            password: process.env.PASSWORD
        }
    });
}

/**
 * Retrieves the last processed timestamp of an order on Proof Market for a given status.
 * @async
 * @function
 * @param {string} status - The status to retrieve the timestamp for.
 * @returns {number} The last processed timestamp.
 */
async function getLastProcessedTimestamp(status) {
    const filePath = path.join(__dirname, `${status}_lastTimestamp.json`);

    try {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, '0');
            return 0;
        }
        
        const data = fs.readFileSync(filePath, 'utf-8');
        return Number(data);
    } catch (error) {
        console.error(`Failed to get last processed timestamp for status ${status}:`, error);
        return 0;
    }
}

/**
 * Saves the last processed timestamp of an order on Proof Market for a given status.
 * @async
 * @function
 * @param {string} status - The status to save the timestamp for.
 * @param {number} timestamp - The timestamp to save.
 */
async function saveLastProcessedTimestamp(status, timestamp) {
    try {
        fs.writeFileSync(path.join(__dirname, `${status}_lastTimestamp.json`), String(timestamp));
    } catch (error) {
        console.error(`Failed to save last processed timestamp for status ${status}:`, error);
    }
}

/**
 * Closes an order on the contract.
 * @async
 * @function
 * @param {Object} contract - The contract instance.
 * @param {Object} relayer - The relayer signer.
 * @param {Object} order - The order details.
 */
async function closeOrder(contract, relayer, order) {
    try{
        // TODO: relay statuses independently
        await setProducer(contract, relayer, order);
    } catch (error) {
        if (error.message.includes("Order is not open")) {
            console.log(`Order ${order.eth_id} is not open. Skipping...`);
        } else {
            console.error(`Error processing order ${order.eth_id}:`, error);
        }
    }
    try {
        let filePath;
        if (order.statement_key === '79169223') {
            filePath = path.join(__dirname, `../../test/data/mina_account/proof_account.bin`);
        } else if (order.statement_key === '32292') {
            filePath = path.join(__dirname, `../../test/data/mina_account/proof_state.bin`);
        } else {
            console.error(`Unknown statement key ${order.statement_key}`);
            return;
        }
        filePath = path.join(__dirname, `../../test/data/mina_account/proof_account.bin`);
        // const proof = [fs.readFileSync(filePath, 'utf-8')];

        const id = parseInt(order.eth_id);
        const proof_key = order.proof_key;

        if (isNaN(id)) {
            throw new Error(`Invalid order ID: ${order.eth_id}`);
        }

        let response = await getAuthenticated(`${constants.serviceUrl}/proof/${proof_key}`);
        console.log('Fetched proof');
        const proof = [response.data.proof];
        const price = ethers.utils.parseUnits(order.cost.toString(), 18);
        console.log('Closing order', id, 'with proof', proof_key, 'and price', price.toString(), '...');
        console.log(proof);

        return contract.connect(relayer).closeOrder(id, proof, price, {gasLimit: 30500000})
        .catch((error) => {
            console.error(`Failed to close order ${id} due to an error:`, error);
            return;
        });
    } catch (error) {
        console.error(`Error processing order ${order.eth_id}:`, error);
    }
}

/**
 * Sets the producer for an order.
 * @async
 * @function
 * @param {Object} contract - The contract instance.
 * @param {Object} relayer - The relayer signer.
 * @param {Object} order - The order details.
 */
async function setProducer(contract, relayer, order) {
    try {
        const id = parseInt(order.eth_id);
        const proposal_key = order.proposal_key;
        let response = await getAuthenticated(`${constants.serviceUrl}/proposal/${proposal_key}`);
        const producerName = response.data.sender;

        response = await getAuthenticated(`${constants.serviceUrl}/producer/${producerName}`);
        let producerAddress = response.data.eth_address;
        if (producerAddress === null || !producerAddress.startsWith('0x') || producerAddress.length !== 42) {
            console.log(`Producer ${producerName} has no address. Using relayer address...`);
            producerAddress = relayer.address;
        }
        console.log('Setting producer', producerAddress, 'for order', id, '...');
        return contract.connect(relayer).setProducer(id, producerAddress);

    } catch (error) {
        console.error(`Error processing order ${order.eth_id}:`, error);
    }
}

/**
 * Relays a proof for order:
 * 1. Fetches the order from the Proof Market since the last processed timestamp.
 * 2. Closes the order on the contract, by sending the proof and the final price.
 * @async
 * @function
 * @param {Object} contract - The contract instance.
 * @param {Object} relayer - The relayer signer.
 */
async function relayProofs(contract, relayer) {
    try {
        const lastTimestamp = await getLastProcessedTimestamp('completed');

        const pattern = [
            {"key":"sender", "value":process.env.USERNAME},
            {"key":"status", "value":"completed"},
            {"key":"updatedOn", "value":lastTimestamp, "op":">"}
        ];
        const url = `${constants.serviceUrl}/request?q=${JSON.stringify(pattern)}`;
        const response = await getAuthenticated(url);
        const orders = response.data;
        if (orders.length === 0) {
            return;
        }
        console.log(`Relaying ${orders.length} proofs...`)
        console.log(orders);
        const closeOrderPromises = orders.map(order => closeOrder(contract, relayer, order));
        const results = await Promise.all(closeOrderPromises);
        results.forEach(result => console.log(result));

        const maxTimestamp = orders.length > 0 ? Math.max(...orders.map(order => order.updatedOn)) : 0;
        if (maxTimestamp > 0) {
            await saveLastProcessedTimestamp('completed', maxTimestamp);
        }
    } catch (error) {
        console.error("Failed to relay proofs:", error);
    }
}

async function relayStatuses(contract, relayer) {
    try {
        const lastTimestamp = await getLastProcessedTimestamp('processing');

        const pattern = [
            {"key":"sender", "value":process.env.USERNAME},
            {"key":"status", "value":"created", "op":"~"},
            {"key":"updatedOn", "value":lastTimestamp, "op":">"},
            // TODO: set this flag after the order is fetched and the producer is set
            // add it in relayProofs
            {"key":"relayerFetched", "value":null},
        ];

        const url = `${constants.serviceUrl}/request?q=${JSON.stringify(pattern)}`;
        const response = await getAuthenticated(url);
        // console.log(response.data);
        const orders = response.data;
        if (orders.length === 0) {
            return;
        }
        console.log(`Relaying ${orders.length} statuses...`)
        console.log(orders);

        const setProducerPromises = orders.map(async (order) => {
            // TODO: remove this by setting relayerFetched flag
            try {
                return await setProducer(contract, relayer, order);
            } catch (error) {
                if (error.message.includes("Order is not open")) {
                    console.log(`Order ${order.eth_id} is not open. Skipping...`);
                } else {
                    console.error(`Error processing order ${order.eth_id}:`, error);
                }
                return null;
            }
        
        });

        const results = await Promise.all(setProducerPromises);
        results.forEach(result => console.log(result));
        const maxTimestamp = orders.length > 0 ? Math.max(...orders.map(order => order.updatedOn)) : 0;
        if (maxTimestamp > 0) {
            await saveLastProcessedTimestamp('processing', maxTimestamp);
        }
    } catch (error) {
        console.error("Failed to relay statuses:", error);
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    constants = readJSONFile('constants.json');

    const [owner, relayer] = await ethers.getSigners();
    const addresses = JSON.parse(fs.readFileSync('deployed_addresses.json', 'utf-8'));
    const contractAddress = addresses.proofMarket;
    const provider = hre.ethers.provider;
    const contractArtifact = await hre.artifacts.readArtifact('IProofMarketEndpoint');
    if (!contractArtifact || !contractArtifact.abi) {
        console.error('Failed to load contract artifact or ABI is missing');
        process.exit(1);
    }
    const contractABI = contractArtifact.abi;
    const proofMarket = new hre.ethers.Contract(contractAddress, contractABI, provider);

    while (true) {
        await relayProofs(proofMarket, relayer);
        // await relayStatuses(proofMarket, relayer);
        await delay(10000);
    }
}

main();
