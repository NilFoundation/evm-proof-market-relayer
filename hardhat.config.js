
require("@nomicfoundation/hardhat-toolbox");
require("@nomiclabs/hardhat-ethers");
require('dotenv').config()


/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.18",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  mocha: {
    timeout: 100000000
  },
  networks: {
    hardhat: {
      blockGasLimit: 100_000_000,
      timeout: 100000000
    },
    sepolia: {
      url: "https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}",
      accounts: [
        process.env.OWNER_PRIVATE_KEY,
        process.env.RELAYER_PRIVATE_KEY,
      ],
    }
  },
  gasReporter: {
    currency: "USD",
    gasPrice: 5,
    enabled: false
  },
};
