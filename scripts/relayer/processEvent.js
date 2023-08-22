require('dotenv').config();

const axios = require('axios');
const hre = require('hardhat');
const path = require('path');
const fs = require('fs');
const { convertFromUint256 } = require('../convert_public_input.js');

const constants = JSON.parse(fs.readFileSync(path.join(__dirname, 'constants.json'), 'utf-8'));

const examplePath = path.join(__dirname, '../data/example-mina-state.json');
const minaStateExampleJson = JSON.parse(fs.readFileSync(examplePath, 'utf-8'));

async function processOrderCreatedEvent(event) {
    const { statementId, publicInputs, price } = event.args.orderInput;
    const { id, buyer } = event.args;
    console.log('Order created:', id, statementId, price, buyer);

    const statement_key = String(statementId);
    let input;
    if (statement_key === '79169223') {
        // Mina account path
        // TODO: String or BigInt?
        input = [{array:publicInputs[0].map(item => String(item))}];
    } else if (statement_key === '32292') {
        // Mina state
        input = publicInputs[0].map(item => BigInt(item));
        input = convertFromUint256(minaStateExampleJson, input);
    } else if (statement_key === '32326') {
        // Unified addition
        input = [
            {field: String(publicInputs[0][0])},
            {field: String(publicInputs[0][1])}
        ];
    } else {
        console.error('Unknown statement key:', statement_key);
    }
    console.log('input', input)
    fs.writeFileSync('input.json', JSON.stringify(input, null, 4));
        
    const order = {
        cost: Number(hre.ethers.utils.formatUnits(price)),
        statement_key: String(statementId),
        input: input,
        eth_id: String(id),
    };
    console.log('Submitting order:', order);

    try {
        const url = `${constants.serviceUrl}/request`;
        const response = await axios.post(url, order, {
            auth: {
                username: process.env.USERNAME,
                password: process.env.PASSWORD
            }
        });
        if (response.status !== 200) {
            throw new Error(`Received status code ${response.status}`);
        }
        console.log('Order submitted successfully:', response.data);
    } catch (error) {
        console.error('Failed to submit order:', error);
    }
}

async function processOrderClosedEvent(event) {
    const orderId = event.args.id;
    console.log('Order closed:', orderId);
    // await updateOrderStatus(orderId, 'closed');
}

async function updateOrderStatus(orderId, status) {
    try {
        const url = `${constants.cursorUrl}`;
        const response = await axios.patch(url, { status }, {
            auth: {
                username: process.env.USERNAME,
                password: process.env.PASSWORD
            }
        });
        if (response.status !== 200) {
            throw new Error(`Received status code ${response.status}`);
        }
        console.log(`Order ${orderId} status updated to ${status}`);
    } catch (error) {
        console.error(`Failed to update order ${orderId} status:`, error);
    }
}

module.exports = {
    processOrderCreatedEvent,
    processOrderClosedEvent
};
