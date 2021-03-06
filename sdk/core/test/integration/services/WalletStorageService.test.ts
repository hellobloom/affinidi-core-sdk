'use strict'

import { expect } from 'chai'
import WalletStorageService from '../../../src/services/WalletStorageService'
import CognitoService from '../../../src/services/CognitoService'
import * as jwt from 'jsonwebtoken'
import { CommonNetworkMember } from '../../../src/CommonNetworkMember'

import { DEV_KEY_STORAGE_URL } from '../../../src/_defaultConfig'

const { TEST_SECRETS } = process.env
const { PASSWORD, COGNITO_PASSWORD, COGNITO_USERNAME, SEED_JOLO, ENCRYPTED_SEED_JOLO } = JSON.parse(TEST_SECRETS)

const seed = SEED_JOLO
const password = PASSWORD
const encryptedSeed = ENCRYPTED_SEED_JOLO
const options = {}

const cognitoUsernameStaging = COGNITO_USERNAME
const nonExistingUser = 'non_existing@email.com'
const cognitoPassword = COGNITO_PASSWORD
const cognitoUsername = cognitoUsernameStaging

describe('WalletStorageService', () => {
  // })

  it.skip('#storeEncryptedSeed', async () => {
    const cognitoService = new CognitoService()

    const accessToken = await cognitoService.signIn(cognitoUsername, cognitoPassword)

    const walletStorageService = new WalletStorageService(encryptedSeed, password, options)

    const encryptionKey = await WalletStorageService.pullEncryptionKey(accessToken)

    const result = await walletStorageService.storeEncryptedSeed(accessToken, seed, encryptionKey)
    expect(result).to.exist
  })

  it('#storeEncryptedSeed throws 409 exception WHEN key for userId already exists', async () => {
    const cognitoService = new CognitoService()
    const accessToken = await cognitoService.signIn(cognitoUsername, cognitoPassword)

    const walletStorageService = new WalletStorageService(encryptedSeed, password, options)

    let responseError

    try {
      await walletStorageService.storeEncryptedSeed(accessToken, seed, password)
      await walletStorageService.storeEncryptedSeed(accessToken, seed, password)
    } catch (error) {
      responseError = error
    }

    expect(responseError).to.exist
  })

  it('#pullEncryptedSeed', async () => {
    const walletStorageService = new WalletStorageService(encryptedSeed, password, options)
    const pulledEncryptedSeed = await walletStorageService.pullEncryptedSeed(cognitoUsername, cognitoPassword)

    expect(pulledEncryptedSeed).to.exist
  })

  // uncomment when wallet-backend is working on DEV
  it.skip('#pullEncryptedSeed throws `WAL-9 / 401` when reading key from wrong vault', async () => {
    const walletStorageService = new WalletStorageService(encryptedSeed, password, {
      keyStorageUrl: DEV_KEY_STORAGE_URL,
    })

    let responseError

    try {
      await walletStorageService.pullEncryptedSeed(cognitoUsername, cognitoPassword)
    } catch (error) {
      responseError = error
    }

    const {
      code,
      originalError: { httpStatusCode },
    } = responseError

    expect(code).to.equal('WAL-9')
    expect(httpStatusCode).to.eql(401)
  })

  it('#pullEncryptedSeed throws exception WHEN key for userId does not exist', async () => {
    const walletStorageService = new WalletStorageService(encryptedSeed, password, options)

    let responseError

    try {
      await walletStorageService.pullEncryptedSeed(nonExistingUser, cognitoPassword)
    } catch (error) {
      responseError = error
    }

    expect(responseError).to.exist
  })

  it.skip('#storeEncryptedSeed throws exception WHEN userId does not exists', async () => {
    const cognitoService = new CognitoService()
    const accessToken = await cognitoService.signIn(nonExistingUser, cognitoPassword)

    const walletStorageService = new WalletStorageService(encryptedSeed, password, options)

    let responseError

    try {
      await walletStorageService.storeEncryptedSeed(accessToken, seed, password)
    } catch (error) {
      responseError = error
    }

    expect(responseError).to.exist
  })

  it('#adminDeleteUnconfirmedUser', async () => {
    const username = 'different_test_user_to_delete'

    const cognitoService = new CognitoService()
    await cognitoService.signUp(username, password)

    await WalletStorageService.adminDeleteUnconfirmedUser(username)

    let responseError

    try {
      await cognitoService.signIn(username, password)
    } catch (error) {
      responseError = error
    }

    const { code, httpStatusCode } = responseError

    expect(code).to.equal('COR-4')
    expect(httpStatusCode).to.equal(404)
  })

  it('#adminConfirmUser throws `WAL-3 / 409` when user already confirmed', async () => {
    let responseError

    try {
      await WalletStorageService.adminConfirmUser(cognitoUsername, options)
    } catch (error) {
      responseError = error
    }

    const {
      code,
      originalError: { httpStatusCode },
    } = responseError

    expect(code).to.equal('WAL-3')
    expect(httpStatusCode).to.eql(409)
  })

  it('#adminDeleteUnconfirmedUser throws `WAL-3 / 409` when user already confirmed', async () => {
    let responseError

    try {
      await WalletStorageService.adminDeleteUnconfirmedUser(cognitoUsername, options)
    } catch (error) {
      responseError = error
    }

    const {
      code,
      originalError: { httpStatusCode },
    } = responseError

    expect(code).to.equal('WAL-3')
    expect(httpStatusCode).to.eql(409)
  })

  it('#getCredentialOffer', async () => {
    const cognitoService = new CognitoService()
    const { idToken } = await cognitoService.signIn(cognitoUsername, cognitoPassword)

    const offerToken = await WalletStorageService.getCredentialOffer(idToken)

    const decoded = jwt.decode(offerToken, { complete: true })

    expect(offerToken).to.exist

    if (typeof decoded === 'string') {
      throw Error
    }

    expect(decoded.payload.interactionToken.offeredCredentials[0].type).to.equal('EmailCredentialPersonV1')
  })

  it('#getSignedCredential', async () => {
    // prettier-ignore
    const options = {
    //   issuerUrl:     'http://localhost:3001',
    //   keyStorageUrl: 'http://localhost:3000',
    //   didMethod:     'elem'
    }

    const cognitoService = new CognitoService()
    const { accessToken, idToken } = await cognitoService.signIn(cognitoUsername, cognitoPassword)

    const offerToken = await WalletStorageService.getCredentialOffer(idToken)

    const returnedEncryptedSeed = await WalletStorageService.pullEncryptedSeed(accessToken)

    const encryptionKey = await WalletStorageService.pullEncryptionKey(accessToken)

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const networkMember = new CommonNetworkMember(encryptionKey, returnedEncryptedSeed, options)

    const offerResponse = await networkMember.createCredentialOfferResponseToken(offerToken)

    const signedCredentials = await WalletStorageService.getSignedCredentials(idToken, offerResponse, options)

    expect(signedCredentials).to.exist
  })
})
