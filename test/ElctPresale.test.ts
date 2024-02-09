import { deployments, ethers } from 'hardhat'
import { assert, expect } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import {
  ElctPresale,
  ElctPresale__factory,
  IERC20Metadata,
  IERC20Metadata__factory,
} from '../typechain-types'
import { getImplementationAddress } from '@openzeppelin/upgrades-core'
import { USDT } from '../constants/addresses'
import { setBalance } from '@nomicfoundation/hardhat-network-helpers'
import ERC20Minter from './utils/ERC20Minter'

const INITIAL_DATA = {
  totalSupply: ethers.utils.parseUnits('1000000000', 18),
  ownerAddress: '0xBF87F4C03d765Ba17fbec79e7b4fd167fD8895Df',
}

const TEST_DATA = [
  {
    payTokenAddress: USDT,
  },
]

describe(`ElctPresale`, () => {
  let initSnapshot: string
  let deployer: SignerWithAddress
  let user: SignerWithAddress
  let owner: SignerWithAddress
  let elct: IERC20Metadata
  let elctPresale: ElctPresale

  before(async () => {
    const accounts = await ethers.getSigners()
    deployer = accounts[0]
    user = accounts[1]

    await deployments.fixture()
    const ElctPresaleDeployment = await deployments.get('ElctPresale')

    elctPresale = ElctPresale__factory.connect(ElctPresaleDeployment.address, deployer)
    const ownerAddress = await elctPresale.owner()
    owner = await ethers.getImpersonatedSigner(ownerAddress)
    await setBalance(owner.address, ethers.utils.parseEther('10'))

    elct = IERC20Metadata__factory.connect(await elctPresale.elct(), ethers.provider)

    await ERC20Minter.mint(elct.address, elctPresale.address, 1000000)

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  describe(`Common tests`, () => {
    it('Regular unit: Upgarde only deployer', async () => {
      const elctPresaleFactory = await ethers.getContractFactory('ElctPresale')
      const newElctPresale = await elctPresaleFactory.deploy()
      const newImplementationAddress = newElctPresale.address
      await elctPresale.connect(owner).upgradeTo(newImplementationAddress)
      const implementationAddress = await getImplementationAddress(
        ethers.provider,
        elctPresale.address,
      )
      assert(
        newImplementationAddress == implementationAddress,
        `newImplementationAddress != implementationAddress. ${newImplementationAddress} != ${implementationAddress}`,
      )
    })

    it('Error unit: Upgarde not owner', async () => {
      const newImplementationAddress = ethers.constants.AddressZero
      await expect(
        elctPresale.connect(user).upgradeTo(newImplementationAddress),
      ).to.be.revertedWith('Ownable: caller is not the owner')
    })

    it('Error unit: ownerShip not owner', async () => {
      await expect(elctPresale.connect(user).transferOwnership(user.address)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      )
    })

    it('Error unit: elctAmount == 0', async () => {
      await expect(elctPresale.connect(user).buy(0, USDT, 0)).to.be.revertedWith(
        '_elctAmount is zero!',
      )
    })
  })

  for (const testData of TEST_DATA) {
    const { payTokenAddress } = testData
    describe(`ElctPresale. Test data: ${JSON.stringify(testData)}`, () => {
      it('Regular: buy', async () => {
        await ERC20Minter.mint(payTokenAddress, user.address, 10000)
        const payToken = IERC20Metadata__factory.connect(payTokenAddress, user)
        const ecltAmount = ethers.utils.parseUnits('100', 18)
        await payToken.approve(
          elctPresale.address,
          ethers.constants.MaxUint256,
        )
        const balanceBefore = await elct.balanceOf(user.address)
        await elctPresale
          .connect(user)
          .buy(ecltAmount, payTokenAddress, ethers.constants.MaxUint256)
        const balanceAfter = await elct.balanceOf(user.address)
        assert(
          balanceAfter.sub(balanceBefore).eq(ecltAmount),
          `elct balance failed! balanceAfter - balanceBefore != ecltAmount. ${balanceAfter} - ${balanceBefore} != ${ecltAmount}`,
        )
        assert((await payToken.balanceOf(elctPresale.address)).gt(0), "payTokens not recieved!")
      })
    })
  }
})
