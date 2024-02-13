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
import { BNB_PLACEHOLDER, CHAINLINK_LINK_USD, ELCT, LINK, USDT, WBNB } from '../constants/addresses'
import { setBalance } from '@nomicfoundation/hardhat-network-helpers'
import ERC20Minter from './utils/ERC20Minter'
import { balanceOf } from './utils/token'

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
    await expect(elctPresale.connect(user).upgradeTo(newImplementationAddress)).to.be.revertedWith(
      'Ownable: caller is not the owner',
    )
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

  it('Regular: buy for BNB', async () => {
    const payTokenAddress = BNB_PLACEHOLDER
    await ERC20Minter.mint(payTokenAddress, user.address, 10000)

    const elctAmount = ethers.utils.parseUnits('100', 18)
    const payTokenAmount = await elctPresale.elctAmountToToken(elctAmount, payTokenAddress)
    const balanceBefore = await balanceOf(elct.address, user.address)
    const change = 1000
    const payTokenAmountWithChange = payTokenAmount.add(change)
    await elctPresale.connect(user).buy(elctAmount, payTokenAddress, ethers.constants.MaxUint256, {
      value: payTokenAmountWithChange,
    })
    const balanceAfter = await balanceOf(elct.address, user.address)
    assert(
      balanceAfter.sub(balanceBefore).eq(elctAmount),
      `elct balance failed! balanceAfter - balanceBefore != elctAmount. ${balanceAfter} - ${balanceBefore} != ${elctAmount}`,
    )
    assert(
      (await balanceOf(payTokenAddress, elctPresale.address)).gte(payTokenAmount),
      'payTokens not recieved!',
    )
    assert(
      (await balanceOf(payTokenAddress, elctPresale.address)).lt(payTokenAmountWithChange),
      'change not returned!',
    )
  })

  it('Regular: slippage BNB', async () => {
    const payTokenAddress = BNB_PLACEHOLDER
    await ERC20Minter.mint(payTokenAddress, user.address, 10000)
    const elctAmount = ethers.utils.parseUnits('100', 18)
    const payTokenAmount = await elctPresale.elctAmountToToken(elctAmount, payTokenAddress)
    await expect(
      elctPresale.connect(user).buy(elctAmount, payTokenAddress, payTokenAmount.sub(1), {
        value: payTokenAmount,
      }),
    ).to.be.revertedWith('_maxPayTokenAmount!')
  })

  it('Error: buy for unknown token', async () => {
    const payTokenAddress = LINK
    await ERC20Minter.mint(payTokenAddress, user.address, 10000)

    const elctAmount = ethers.utils.parseUnits('100', 18)
    await expect(
      elctPresale.connect(user).buy(elctAmount, payTokenAddress, ethers.constants.MaxUint256),
    ).to.be.revertedWith('not supported token!')
  })

  for (const payTokenAddress of [ELCT, BNB_PLACEHOLDER, USDT, WBNB]) {
    it(`Regular: owner withdraw ${payTokenAddress}`, async () => {
      const amount = await ERC20Minter.mint(payTokenAddress, elctPresale.address, 10000)
      const balanceBefore = await balanceOf(payTokenAddress, owner.address)
      await elctPresale.connect(owner).withdraw(payTokenAddress, amount)
      const balanceAfter = await balanceOf(payTokenAddress, owner.address)
      assert(
        balanceAfter.sub(balanceBefore).gt(amount.mul(95).div(100)) &&
          balanceAfter.sub(balanceBefore).lt(amount.mul(105).div(100)),
        'withdrawnBalance!',
      )
    })
  }

  it('Error: user withdraw', async () => {
    const withdrawnBalance = await elct.balanceOf(elctPresale.address)
    await expect(elctPresale.connect(user).withdraw(ELCT, withdrawnBalance)).to.be.revertedWith(
      'Ownable: caller is not the owner',
    )
  })

  it('Regular: owner add pay token', async () => {
    await elctPresale.connect(owner).addPayToken(LINK, CHAINLINK_LINK_USD)
    assert((await elctPresale.payTokensPricers(LINK)) == CHAINLINK_LINK_USD, 'pricer set failed!')
  })

  it('Error: user add pay token', async () => {
    await expect(
      elctPresale.connect(user).addPayToken(LINK, CHAINLINK_LINK_USD),
    ).to.be.revertedWith('Ownable: caller is not the owner')
  })

  for (const payTokenAddress of [USDT, WBNB]) {
    describe(`ElctPresale. Pay token ${payTokenAddress}`, () => {
      it('Regular: buy', async () => {
        await ERC20Minter.mint(payTokenAddress, user.address, 10000)

        const elctAmount = ethers.utils.parseUnits('100', 18)
        const payTokenAmount = elctPresale.elctAmountToToken(elctAmount, payTokenAddress)
        const payToken = IERC20Metadata__factory.connect(payTokenAddress, user)
        await payToken.approve(elctPresale.address, payTokenAmount)
        const balanceBefore = await balanceOf(elct.address, user.address)
        await elctPresale
          .connect(user)
          .buy(elctAmount, payTokenAddress, ethers.constants.MaxUint256)
        const balanceAfter = await balanceOf(elct.address, user.address)
        assert(
          balanceAfter.sub(balanceBefore).eq(elctAmount),
          `elct balance failed! balanceAfter - balanceBefore != elctAmount. ${balanceAfter} - ${balanceBefore} != ${elctAmount}`,
        )
        assert(
          (await balanceOf(payTokenAddress, elctPresale.address)).gt(0),
          'payTokens not recieved!',
        )
      })

      it(`Regular: slippage ${payTokenAddress}`, async () => {
        await ERC20Minter.mint(payTokenAddress, user.address, 10000)
        const elctAmount = ethers.utils.parseUnits('100', 18)
        const payTokenAmount = await elctPresale.elctAmountToToken(elctAmount, payTokenAddress)
        await expect(
          elctPresale.connect(user).buy(elctAmount, payTokenAddress, payTokenAmount.sub(1)),
        ).to.be.revertedWith('_maxPayTokenAmount!')
      })
    })
  }
})
