import { deployments, ethers } from 'hardhat'
import { assert, expect } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { ELCT, ELCT__factory } from '../typechain-types'
import { getImplementationAddress } from '@openzeppelin/upgrades-core'

const INITIAL_DATA = {
  totalSupply: ethers.utils.parseUnits('1000000000', 18),
  ownerAddress: '0xBF87F4C03d765Ba17fbec79e7b4fd167fD8895Df'
}

describe(`ELCT`, () => {
  let initSnapshot: string
  let deployer: SignerWithAddress
  let user: SignerWithAddress
  let owner: SignerWithAddress
  let elct: ELCT

  before(async () => {
    const accounts = await ethers.getSigners()
    deployer = accounts[0]
    user = accounts[1]

    await deployments.fixture(['ELCT'])
    const ElctDeployment = await deployments.get('ELCT')

    elct = ELCT__factory.connect(ElctDeployment.address, deployer)
    const ownerAddress = await elct.owner()
    owner = await ethers.getImpersonatedSigner(ownerAddress)

    await deployer.sendTransaction({
      to: owner.address,
      value: ethers.utils.parseEther('10'),
    })

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  it('Initial data: owner', async () => {
    const owner = await elct.owner()
    assert(
      owner == INITIAL_DATA.ownerAddress,
      `owner != INITIAL_DATA.ownerAddress. ${owner} != ${INITIAL_DATA.ownerAddress}`,
    )
  })

  it('Initial data: totalSupply', async () => {
    const totalSupply = await elct.totalSupply()
    assert(
      totalSupply.eq(INITIAL_DATA.totalSupply),
      `totalSupply != INITIAL_DATA.totalSupply. ${totalSupply} != ${INITIAL_DATA.totalSupply}`,
    )
  })

  it('Initial data: owner balance', async () => {
    const ownerBalance = await elct.balanceOf(owner.address)
    assert(
      ownerBalance.eq(INITIAL_DATA.totalSupply),
      `ownerBalance != INITIAL_DATA.totalSupply. ${ownerBalance} != ${INITIAL_DATA.totalSupply}`,
    )
  })

  it('Regular unit: Upgarde only deployer', async () => {
    const elctFactory = await ethers.getContractFactory('ELCT')
    const newELCT = await elctFactory.deploy()
    const newImplementationAddress = newELCT.address
    await elct.connect(owner).upgradeTo(newImplementationAddress)
    const implementationAddress = await getImplementationAddress(ethers.provider, elct.address)
    assert(
      newImplementationAddress == implementationAddress,
      `newImplementationAddress != implementationAddress. ${newImplementationAddress} != ${implementationAddress}`,
    )
  })

  it('Error unit: Upgarde not owner', async () => {
    const newImplementationAddress = ethers.constants.AddressZero
    await expect(elct.connect(user).upgradeTo(newImplementationAddress)).to.be.revertedWith(
      'Ownable: caller is not the owner',
    )
  })

  
  it('Error unit: ownerShip not owner', async () => {
    await expect(elct.connect(user).transferOwnership(user.address)).to.be.revertedWith(
      'Ownable: caller is not the owner',
    )
  })
})
