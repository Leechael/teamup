import { it, beforeEach, beforeAll } from 'vitest'
import * as fs from 'node:fs'
import { createTestClient, http, publicActions, createWalletClient, walletActions, getContractAddress, getContract, parseAbi, type Address, type WalletClient, type PublicClient, type Transport, type TransactionExecutionError, parseEther } from 'viem'
import { createAnvil } from "@viem/anvil";
import { privateKeyToAccount } from 'viem/accounts'
import { foundry } from 'viem/chains'

const anvilTestPrivkeys: Readonly<`0x${string}`[]> = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
  "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
  "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356",
  "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97",
  "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6",
]

const testAccounts = anvilTestPrivkeys.map(privateKeyToAccount)

const abis = [
  'function owner() view returns (address)',
  'function prizePool() view returns (uint256)',
  'function nextTeamId() view returns (uint256)',
  'function leaderOf(address addr) view returns (uint256)',
  'function teams(uint256) view returns ((uint256, address, uint256) team)',
  'function isMemberOf(uint256 teamId) view returns (bool)',
  'function contribute() payable',
  'function createTeam(address leader)',
  'function joinTeam(uint256 teamId, address team)',
  'function score(uint256 teamId, address member, uint256 points)',
  'function draw(uint256 teamId, address[] addresses)',
  'function balanceOf(address addr, uint256 teamId) view returns (uint256)',
  'function hasDrawn() view returns (bool)',
] as const

declare module 'vitest' {
  export interface TestContext {
    client: PublicClient<Transport, typeof foundry> & WalletClient<Transport, typeof foundry>
    address: Address
    deployer: ReturnType<typeof privateKeyToAccount>
  }
}

beforeAll(async () => {
  const anvil = createAnvil()
  await anvil.start()

  return async () => {
    await anvil.stop()
  }
})

beforeEach(async (ctx) => {
  const client = createTestClient({
    chain: foundry,
    mode: 'anvil',
    transport: http(),
  })
    .extend(publicActions)
    .extend(walletActions)

  await client.setAutomine(true)

  //
  // Deploy and get the contract address
  //
  const artifact = JSON.parse(fs.readFileSync('./out/teamup.sol/Teamup.json', 'utf8'))
  const hash = await client.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    account: testAccounts[0],
    args: [],
  })
  const transaction = await client.getTransaction({ hash })
  const contractAddress = getContractAddress({
    from: testAccounts[0].address,
    nonce: BigInt(transaction.nonce),
  })

  ctx.client = client
  ctx.deployer = testAccounts[0]
  ctx.address = contractAddress
})


it('Set up owner and attestor on inititalization', async ({ expect, client, address }) => {
  const account = testAccounts[0]
  const contract = getContract({
    address,
    abi: parseAbi(abis),
    publicClient: client,
    walletClient: createWalletClient({
      chain: foundry,
      transport: http(),
      account,
    }),
  })

  const owner = await contract.read.owner()
  expect(owner).toEqual(account.address)
})

it("Prizepool is zero on initialization", async ({ expect, client, address }) => {
  const account = testAccounts[0]
  const contract = getContract({
    address,
    abi: parseAbi(abis),
    publicClient: client,
    walletClient: createWalletClient({
      chain: foundry,
      transport: http(),
      account,
    }),
  })

  const prizepool = await contract.read.prizePool()
  expect(prizepool).toEqual(0n)
})

it('Anyone can contribute to the prize pool', async ({ expect, client, address }) => {
  const account = testAccounts[1]
  const contract = getContract({
    address,
    abi: parseAbi(abis),
    publicClient: client,
    walletClient: createWalletClient({
      chain: foundry,
      transport: http(),
      account,
    }),
  })

  const value = parseEther('1')
  await contract.write.contribute({ value })
  const prizepool = await contract.read.prizePool()
  expect(prizepool).toEqual(value)

  const owner = await contract.read.owner()
  expect(owner).not.toEqual(account.address)
})

it('Only attestor can create a team', async ({ expect, client, address }) => {
  const account = testAccounts[1]
  const contract = getContract({
    address,
    abi: parseAbi(abis),
    publicClient: client,
    walletClient: createWalletClient({
      chain: foundry,
      transport: http(),
      account,
    }),
  })

  const teamId = await contract.read.nextTeamId()
  try {
    await contract.write.createTeam([account.address])
  } catch (e) {
    expect((e as TransactionExecutionError).name).toBe('TransactionExecutionError')
  }
  const after = await contract.read.nextTeamId()
  expect(teamId).toEqual(after)
})

it('Attestor can create a team', async ({ expect, client, address }) => {
  const account = testAccounts[0]
  const contract = getContract({
    address,
    abi: parseAbi(abis),
    publicClient: client,
    walletClient: createWalletClient({
      chain: foundry,
      transport: http(),
      account,
    }),
  })

  const teamId = await contract.read.nextTeamId()
  await contract.write.createTeam([account.address])
  const after = await contract.read.nextTeamId()
  expect(teamId + 1n).toEqual(after)

  const teamIdOf = await contract.read.leaderOf([account.address])
  expect(teamId).toEqual(teamIdOf)

  const team = await contract.read.teams([teamId])
  expect(team[0]).toEqual(teamId)
  expect(team[1]).toEqual(account.address)
  expect(team[2]).toEqual(parseEther('1'))
})

it('One address only create one team', async ({ expect, client, address }) => {
  const account = testAccounts[0]
  const contract = getContract({
    address,
    abi: parseAbi(abis),
    publicClient: client,
    walletClient: createWalletClient({
      chain: foundry,
      transport: http(),
      account,
    }),
  })

  await contract.write.createTeam([account.address])
  const nextId = await contract.read.nextTeamId()
  try {
    await contract.write.createTeam([account.address])
  } catch (e) {
    expect((e as TransactionExecutionError).name).toBe('TransactionExecutionError')
  }
  const nextId2 = await contract.read.nextTeamId()
  expect(nextId).toEqual(nextId2)
})

it('Anyone can join a team', async ({ expect, client, address }) => {
  const account = testAccounts[0]
  const contract = getContract({
    address,
    abi: parseAbi(abis),
    publicClient: client,
    walletClient: createWalletClient({
      chain: foundry,
      transport: http(),
      account,
    }),
  })

  const teamId = await contract.read.nextTeamId()
  await contract.write.createTeam([account.address])
  const info1 = await contract.read.teams([teamId])

  await contract.write.joinTeam([teamId, testAccounts[1].address])
  const info2 = await contract.read.teams([teamId])

  expect(info1[0]).toEqual(info2[0])
  expect(info1[1]).toEqual(info2[1])
  expect(info1[2]).toEqual(info2[2] - parseEther('1'))
})

it('Team leader can not join own team', async ({ expect, client, address }) => {
  const account = testAccounts[0]
  const contract = getContract({
    address,
    abi: parseAbi(abis),
    publicClient: client,
    walletClient: createWalletClient({
      chain: foundry,
      transport: http(),
      account,
    }),
  })

  const teamId = await contract.read.nextTeamId()
  await contract.write.createTeam([account.address])

  const nextTeamId = await contract.read.nextTeamId()
  try {
    await contract.write.joinTeam([teamId, account.address])
  } catch (e) {
    expect((e as TransactionExecutionError).name).toBe('TransactionExecutionError')
  }
  const nextTeamIdAfter = await contract.read.nextTeamId()
  expect(nextTeamId).toEqual(nextTeamIdAfter)
})

it('User can not join same team twice', async ({ expect, client, address }) => {
  const account = testAccounts[0]
  const contract = getContract({
    address,
    abi: parseAbi(abis),
    publicClient: client,
    walletClient: createWalletClient({
      chain: foundry,
      transport: http(),
      account,
    }),
  })

  const teamId = await contract.read.nextTeamId()
  await contract.write.createTeam([account.address])

  const user = testAccounts[1]
  await contract.write.joinTeam([teamId, user.address])
  try {
    await contract.write.joinTeam([teamId, user.address])
  } catch (e) {
    expect((e as TransactionExecutionError).name).toBe('TransactionExecutionError')
  }
})

it('User can own a team and join another team at the same time', async ({ expect, client, address }) => {
  const account = testAccounts[0]
  const contract = getContract({
    address,
    abi: parseAbi(abis),
    publicClient: client,
    walletClient: createWalletClient({
      chain: foundry,
      transport: http(),
      account,
    }),
  })

  const teamIdA = await contract.read.nextTeamId()
  await contract.write.createTeam([account.address])

  const teamIdB = await contract.read.nextTeamId()
  await contract.write.createTeam([testAccounts[1].address])

  expect(teamIdA).not.eq(teamIdB)

  await contract.write.joinTeam([teamIdA, testAccounts[1].address])

  const isMember = await contract.read.isMemberOf([teamIdA], { account: testAccounts[1] })
  expect(isMember).toBe(true)
})

it('User can score points for a team', async ({ expect, client, address }) => {
  const account = testAccounts[0]
  const contract = getContract({
    address,
    abi: parseAbi(abis),
    publicClient: client,
    walletClient: createWalletClient({
      chain: foundry,
      transport: http(),
      account,
    }),
  })

  const teamId = await contract.read.nextTeamId()
  await contract.write.createTeam([account.address])

  await contract.write.joinTeam([teamId, testAccounts[1].address])
  const isMember = await contract.read.isMemberOf([teamId], { account: testAccounts[1] })
  expect(isMember).toBe(true)

  const before = await contract.read.teams([teamId])
  await contract.write.score([teamId, testAccounts[1].address, parseEther('1')])
  const after = await contract.read.teams([teamId])

  expect(before[2]).toEqual(after[2] - parseEther('1'))

  const balanceOf = await contract.read.balanceOf([testAccounts[1].address, teamId])
  expect(balanceOf).toEqual(parseEther('2'))
})

it('Only attestor can submit score', async ({ expect, client, address }) => {
  const account = testAccounts[0]
  const contract = getContract({
    address,
    abi: parseAbi(abis),
    publicClient: client,
    walletClient: createWalletClient({
      chain: foundry,
      transport: http(),
      account,
    }),
  })

  const teamId = await contract.read.nextTeamId()
  await contract.write.createTeam([account.address])

  await contract.write.joinTeam([teamId, testAccounts[1].address])

  try {
    await contract.write.score([teamId, testAccounts[1].address, parseEther('1')], { account: testAccounts[1] })
  } catch (e) {
    expect((e as TransactionExecutionError).name).toBe('TransactionExecutionError')
  }
})

it('attestor can draw the game', async ({ expect, client, address }) => {
  const account = testAccounts[0]
  const contract = getContract({
    address,
    abi: parseAbi(abis),
    publicClient: client,
    walletClient: createWalletClient({
      chain: foundry,
      transport: http(),
      account,
    }),
  })

  await contract.write.contribute({ value: parseEther('2') })

  const teamId = await contract.read.nextTeamId()
  await contract.write.createTeam([testAccounts[2].address])

  await contract.write.joinTeam([teamId, testAccounts[3].address])

  const info = await contract.read.teams([teamId])
  expect(info[2]).toEqual(parseEther('2'))

  const leaderBalance = await client.getBalance({ address: testAccounts[2].address })
  const memberBalance = await client.getBalance({ address: testAccounts[3].address })

  await contract.write.draw([teamId, [testAccounts[3].address, testAccounts[2].address]])
  const hasDrawn = await contract.read.hasDrawn()
  expect(hasDrawn).toBe(true)

  const leaderBalanceAfter = await client.getBalance({ address: testAccounts[2].address })
  const memberBalanceAfter = await client.getBalance({ address: testAccounts[3].address })
  expect(leaderBalanceAfter).toEqual(leaderBalance + parseEther('1'))
  expect(memberBalanceAfter).toEqual(memberBalance + parseEther('1'))
})
