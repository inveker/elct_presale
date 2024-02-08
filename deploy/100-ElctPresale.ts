import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { BNB_PLACEHOLDER, CHAINLINK_BNB_USD, CHAINLINK_USDT_USD, ELCT, FIXED_ELCT_USD, USDT, WBNB } from '../constants/addresses'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy } = deployments

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const ownerAddress = '0xBF87F4C03d765Ba17fbec79e7b4fd167fD8895Df'

  await deploy('ElctPresale', {
    contract: 'ElctPresale',
    from: deployer.address,
    proxy: {
      proxyContract: 'UUPS',
      execute: {
        init: { 
          methodName: 'initialize',
          args: [
            ownerAddress, // _owner
            ELCT, // _elct
            FIXED_ELCT_USD, // _elctPricer
            [
              BNB_PLACEHOLDER, 
              WBNB,
              USDT, 
            ], // _payTokens
            [
              CHAINLINK_BNB_USD,
              CHAINLINK_BNB_USD,
              CHAINLINK_USDT_USD,
            ], // _payTokensPricers
          ],
        },
      },
    },
  })
}

deploy.tags = ['ElctPresale']
export default deploy
