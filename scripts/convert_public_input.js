const fs = require('fs');
const path = require('path');
const process = require('process');
const base58 = require('base-x')('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz');
const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');
const LosslessJSON = require('lossless-json');

function isUint256(value) {
    return typeof value === "string" && value.startsWith("0x") && value.length === 66;
}

function isHash(value) {
    return typeof value === "string" && !value.startsWith("0x") && value.length > 40;
}

function isIntegerString(value) {
    // value is a string that represents an integer, e.g. "123" or "-123"
    return typeof value === "string" && !value.startsWith("0x") && !isNaN(Number(value));
}

function convertToUint256(node) {
    let uint256Values = [];

    if (node instanceof Object && !(node instanceof Array)) {
        for (const key in node) {
            uint256Values = uint256Values.concat(convertToUint256(node[key]));
        }
    } else if (node instanceof Array) {
        node.forEach(item => {
            uint256Values = uint256Values.concat(convertToUint256(item));
        });
    } else {
        if (isUint256(node)) {
            uint256Values.push(BigInt(node));
            // uint256Values.push('0x' + BigInt(node).toString(16).padStart(64, '0'));
        } else if (isHash(node)) {
            const num = base58.decode(node);
            uint256Values.push(Number(num) % (2**256));
        } else if (isIntegerString(node)) {
            const num = Number(node);
            if (num < 0) {
                uint256Values.push(1, Math.abs(num));
            } else {
                uint256Values.push(0, num);
            }
        } else if (typeof node === "boolean") {
            uint256Values.push(node ? 1 : 0);
        }
    }
    return uint256Values;
}

function convertFromUint256(node, uint256Values) {
    if (node instanceof Object && !(node instanceof Array)) {
        const newNode = {};
        for (const key in node) {
            newNode[key] = convertFromUint256(node[key], uint256Values);
        }
        return newNode;
    } else if (node instanceof Array) {
        return node.map(item => convertFromUint256(item, uint256Values));
    } else {
        if (isUint256(node)) {
            let uint256Value = BigInt(uint256Values.shift());
            let converted = '0x' + uint256Value.toString(16).padStart(64, '0');
            return converted;
        } else if (isHash(node)) {
            const num = BigInt(uint256Values.shift());
            const buffer = Buffer.alloc(32); // 32 bytes for a uint256
            for (let i = 0; i < 32; i++) {
                buffer[31 - i] = Number((num >> BigInt(i * 8)) & BigInt(0xFF));
            }
            return base58.encode(buffer);
        } else if (isIntegerString(node)) {
            const signBit = uint256Values.shift();
            const num = uint256Values.shift();
            return signBit === 1 ? String(-num) : String(num);
        } else if (typeof node === "boolean") {
            return Boolean(uint256Values.shift());
        } else {
            return node;
        }
    }
}

async function convertToArray(inputPath, outputPath) {
    const input = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
    const uint256Values = convertToUint256(input);
    console.log('uint256Values', uint256Values)
    fs.writeFileSync(outputPath, LosslessJSON.stringify(uint256Values, null, 4));
}

async function convertToJson(inputPath, outputPath, examplePath) {
    const uint256Values = LosslessJSON.parse(fs.readFileSync(inputPath, 'utf-8'));
    const exampleJson = JSON.parse(fs.readFileSync(examplePath, 'utf-8'));
    const convertedJson = convertFromUint256(exampleJson, uint256Values);
    fs.writeFileSync(outputPath, JSON.stringify(convertedJson, null, 4));
}

if (require.main === module) {
    const argv = yargs(hideBin(process.argv))
    .option('input', {
        type: 'string',
        description: 'Input file path',
        default: 'input.json',
    })
    .option('output', {
        type: 'string',
        description: 'Output file path',
        default: 'output.json',
    })
    .command(
        'from_json',
        'Convert public input from JSON to uint256[]',
        {
            input: {
                type: 'string',
                demandOption: true,
                description: 'Input file path for JSON public input',
            },
            output: {
                type: 'string',
                demandOption: true,
                description: 'Output file path for uint256 array',
            },
        },
        (argv) => {
            convertToArray(argv.input, argv.output)
                .then(() => process.exit(0))
                .catch((error) => {
                    console.error(error);
                    process.exit(1);
                });
        }
    )
    .command(
        'from_uint',
        'Convert public input from uint256[] to JSON format',
        {
            input: {
                type: 'string',
                demandOption: true,
                description: 'Input file path for uint256 array',
            },
            output: {
                type: 'string',
                demandOption: true,
                description: 'Output file path for JSON public input',
            },
            example: {
                type: 'string',
                demandOption: true,
                description: 'Example public input file path',
            },
        },
        (argv) => {
            convertToJson(argv.input, argv.output, argv.example)
                .then(() => process.exit(0))
                .catch((error) => {
                    console.error(error);
                    process.exit(1);
                });
        }
    )
    .demandCommand(1, 'You need to specify a command')
    .help()
    .argv;
}


module.exports = {
    convertToUint256,
    convertFromUint256,
    convertToArray,
    convertToJson,
};