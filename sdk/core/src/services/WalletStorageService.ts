import { toRpcSig, ecsign } from 'ethereumjs-util'
import CognitoService from './CognitoService'
import API from './ApiService'
import SdkError from '../shared/SdkError'
import { profile } from '@affinidi/common'
import { JwtService, KeysService } from '@affinidi/common'

import { FreeFormObject } from '../shared/interfaces'

const keccak256 = require('keccak256')
const createHash = require('create-hash')
const secp256k1 = require('secp256k1')
const bip32 = require('bip32')

const jolocomIdentityKey = "m/73'/0'/0'/0" // eslint-disable-line

/* istanbul ignore next */
const hashPersonalMessage = (message: Buffer): Buffer => {
  const prefix = Buffer.from(`\u0019Ethereum Signed Message:\n${message.length.toString()}`, 'utf-8')
  return keccak256(Buffer.concat([prefix, message]))
}

/* istanbul ignore next */
const privateToPublic = (privateKey: Buffer): Buffer => {
  privateKey = Buffer.from(privateKey)
  return secp256k1.publicKeyCreate(privateKey, false).slice(1)
}

/* istanbul ignore next */
const publicToAddress = (publicKey: Buffer): Buffer => {
  publicKey = Buffer.from(publicKey)
  return keccak256(publicKey).slice(-20)
}

const sha256 = (data: any) => {
  return createHash('sha256').update(data).digest()
}

import {
  STAGING_KEY_STORAGE_URL,
  STAGING_VAULT_URL,
  STAGING_COGNITO_CLIENT_ID,
  STAGING_COGNITO_USER_POOL_ID,
} from '../_defaultConfig'

import { SignedCredential } from '../dto/shared.dto'

@profile()
export default class WalletStorageService {
  _keyStorageUrl: string
  _vaultUrl: string
  _clientId: string
  _userPoolId: string
  _keysService: KeysService
  _api: API

  constructor(encryptedSeed: string, password: string, options: any = {}) {
    this._keysService = new KeysService(encryptedSeed, password)

    this._keyStorageUrl = options.keyStorageUrl || STAGING_KEY_STORAGE_URL
    this._vaultUrl = options.vaultUrl || STAGING_VAULT_URL
    this._clientId = options.clientId || STAGING_COGNITO_CLIENT_ID
    this._userPoolId = options.userPoolId || STAGING_COGNITO_USER_POOL_ID

    const { registryUrl, issuerUrl, verifierUrl } = options

    this._api = new API(registryUrl, issuerUrl, verifierUrl)
  }

  async pullEncryptedSeed(username: string, password: string, token: string = undefined): Promise<string> {
    let accessToken = token

    /* istanbul ignore else: code simplicity */
    if (!token) {
      const cognitoService = new CognitoService({ clientId: this._clientId, userPoolId: this._userPoolId })
      const response = await cognitoService.signIn(username, password)

      accessToken = response.accessToken
    }

    const keyStorageUrl = this._keyStorageUrl
    const encryptedSeed = await WalletStorageService.pullEncryptedSeed(accessToken, keyStorageUrl)

    return encryptedSeed
  }

  static async pullEncryptedSeed(accessToken: string, keyStorageUrl?: string): Promise<string> {
    keyStorageUrl = keyStorageUrl || STAGING_KEY_STORAGE_URL

    const url = `${keyStorageUrl}/api/v1/keys/readMyKey`

    const headers = {
      authorization: accessToken,
    }

    const api = new API()

    const { body } = await api.execute(null, {
      url,
      headers,
      method: 'GET',
    })

    const { encryptedSeed } = body

    return encryptedSeed
  }

  static hashFromString(data: string): string {
    const buffer = sha256(Buffer.from(data))

    return buffer.toString('hex')
  }

  static async pullEncryptionKey(accessToken: string): Promise<string> {
    // TODO: must use key provider, its just a mock at this point
    const { payload } = JwtService.fromJWT(accessToken)
    const userId = payload.sub

    const encryptionKey = WalletStorageService.hashFromString(userId)

    return encryptionKey
  }

  async storeEncryptedSeed(accessToken: string, seedHex: string, encryptionKey: string): Promise<void> {
    const url = `${this._keyStorageUrl}/api/v1/keys/storeMyKey`

    const encryptionKeyBuffer = Buffer.from(encryptionKey, 'hex')
    const encryptedSeed = await KeysService.encryptSeed(seedHex, encryptionKeyBuffer)

    const headers = {
      authorization: accessToken,
    }

    await this._api.execute(null, {
      url,
      headers,
      params: { encryptedSeed },
      method: 'POST',
    })
  }

  /* istanbul ignore next: private function */
  private getVaultKeys() {
    const { seed } = this._keysService.decryptSeed()

    const privateKey = bip32.fromSeed(seed).derivePath(jolocomIdentityKey).privateKey
    const privateKeyHex = privateKey.toString('hex')

    const publicKey = privateToPublic(privateKey)
    const addressHex = publicToAddress(publicKey).toString('hex')

    return { addressHex, privateKeyHex }
  }

  /* istanbul ignore next: ethereumjs-util */
  signByVaultKeys(message: string, privateKey: string) {
    const sig = ecsign(hashPersonalMessage(Buffer.from(message)), Buffer.from(privateKey, 'hex'))

    return toRpcSig(sig.v, sig.r, sig.s)
  }

  async authorizeVcVault() {
    const { addressHex, privateKeyHex } = this.getVaultKeys()

    const didEth = `did:ethr:0x${addressHex}`
    const tokenChallengeUrl = `${this._vaultUrl}/auth/request-token?did=${didEth}`

    const {
      body: { token },
    } = await this._api.execute(null, {
      url: tokenChallengeUrl,
      params: {},
      method: 'POST',
    })

    const signature = this.signByVaultKeys(token, privateKeyHex)
    const tokenChallengeValidationUrl = `${this._vaultUrl}/auth/validate-token`
    await this._api.execute(null, {
      url: tokenChallengeValidationUrl,
      params: { accessToken: token, signature, did: didEth },
      method: 'POST',
    })

    return token
  }

  async saveCredentials(data: any) {
    const responses = []
    const token = await this.authorizeVcVault()

    const headers = {
      Authorization: `Bearer ${token}`,
    }

    const url = `${this._vaultUrl}/data`

    /* istanbul ignore else: code simplicity */
    if (data.length && data.length > 0) {
      for (const cyphertext of data) {
        const params = { cyphertext }
        const { body } = await this._api.execute(null, {
          url,
          headers,
          params,
          method: 'POST',
        })

        responses.push(body)
      }
    }

    return responses
  }

  /* istanbul ignore next: private method */
  private isTypeMatchRequirements(credentialType: string[], requirementType: string[]): boolean {
    return requirementType.every((value: string) => credentialType.includes(value))
  }

  /* istanbul ignore next: there is test with NULL, but that did not count */
  filterCredentials(credentialShareRequestToken: string = null, credentials: any) {
    if (credentialShareRequestToken) {
      const request = JwtService.fromJWT(credentialShareRequestToken)

      const {
        payload: {
          interactionToken: { credentialRequirements },
        },
      } = request

      // prettier-ignore
      const requirementTypes =
        credentialRequirements.map((credentialRequirement: any) => credentialRequirement.type)

      return credentials.filter((credential: any) => {
        for (const requirementType of requirementTypes) {
          const isTypeMatchRequirements = this.isTypeMatchRequirements(credential.type, requirementType)

          if (isTypeMatchRequirements) {
            return credential
          }
        }
      })
    }

    return credentials
  }

  async deleteAllCredentials(): Promise<void> {
    const token = await this.authorizeVcVault()
    const headers = {
      Authorization: `Bearer ${token}`,
    }
    const url = `${this._vaultUrl}/data/0/99`

    try {
      const response = await this._api.execute(null, {
        url,
        headers,
        method: 'DELETE',
      })

      return response
    } catch (error) {
      throw new SdkError('COR-0', {}, error)
    }
  }

  async deleteCredentialByIndex(index: string): Promise<void> {
    const token = await this.authorizeVcVault()
    const headers = {
      Authorization: `Bearer ${token}`,
    }

    // NOTE: deletes the data objects associated with the included access token
    //       and the included IDs starting with :start and ending with :end inclusive
    //       https://github.com/hellobloom/bloom-vault#delete-datastartend
    const start = index
    const end = index
    const url = `${this._vaultUrl}/data/${start}/${end}`

    try {
      const response = await this._api.execute(null, {
        url,
        headers,
        method: 'DELETE',
      })

      return response
    } catch (error) {
      throw new SdkError('COR-0', {}, error)
    }
  }

  private _filterDeletedCredentials(blobs: any): [] {
    return blobs.filter((blob: any) => blob.cyphertext !== null)
  }

  async fetchEncryptedCredentials(): Promise<any> {
    const token = await this.authorizeVcVault()

    const headers = {
      Authorization: `Bearer ${token}`,
    }

    const url = `${this._vaultUrl}/data/0/99`

    try {
      const { body: blobs } = await this._api.execute(null, {
        url,
        headers,
        method: 'GET',
      })

      return this._filterDeletedCredentials(blobs)
    } catch (error) {
      if (error.httpStatusCode === 404) {
        throw new SdkError('COR-14', {}, error)
      } else {
        throw error
      }
    }
  }

  static async adminConfirmUser(username: string, options: any = {}): Promise<void> {
    const keyStorageUrl = options.keyStorageUrl || STAGING_KEY_STORAGE_URL

    const url = `${keyStorageUrl}/api/v1/userManagement/adminConfirmUser`

    const api = new API()

    await api.execute(null, {
      url,
      params: { username },
      method: 'POST',
    })
  }

  static async adminDeleteUnconfirmedUser(username: string, options: any = {}): Promise<void> {
    const keyStorageUrl = options.keyStorageUrl || STAGING_KEY_STORAGE_URL

    const url = `${keyStorageUrl}/api/v1/userManagement/adminDeleteUnconfirmedUser`

    const api = new API()

    await api.execute(null, {
      url,
      params: { username },
      method: 'POST',
    })
  }

  static async getCredentialOffer(idToken: string, keyStorageUrl?: string): Promise<string> {
    keyStorageUrl = keyStorageUrl || STAGING_KEY_STORAGE_URL

    const url = `${keyStorageUrl}/api/v1/issuer/getCredentialOffer`
    const headers = {
      authorization: idToken,
    }

    const api = new API()
    const { body } = await api.execute(null, {
      url,
      headers,
      method: 'GET',
    })

    const { offerToken } = body
    return offerToken
  }

  static async getSignedCredentials(
    idToken: string,
    credentialOfferResponseToken: string,
    options: any = {},
  ): Promise<SignedCredential[]> {
    const keyStorageUrl = options.keyStorageUrl || STAGING_KEY_STORAGE_URL

    const url = `${keyStorageUrl}/api/v1/issuer/getSignedCredential`
    const headers = {
      authorization: idToken,
    }

    const params: FreeFormObject = { credentialOfferResponseToken }
    const method = 'POST'

    /* istanbul ignore next: manual test */
    if (Object.entries(options).length !== 0) {
      delete options.cognitoUser // not required
      delete options.cognitoUserTokens // not required
      delete options.skipBackupEncryptedSeed // not required
      delete options.skipBackupCredentials // not required
      delete options.issueSignupCredential // not required
      delete options.metricsUrl // not required
      delete options.apiKey // not required

      params.options = options
    }

    const api = new API()
    const { body } = await api.execute(null, { url, headers, params, method })

    const { signedCredentials } = body

    return signedCredentials
  }
}
