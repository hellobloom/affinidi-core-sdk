import nock from 'nock'
import sinon from 'sinon'

import * as ethereumjsUtils from 'ethereumjs-util'
import { KeysService } from '@affinidi/common'
import { STAGING_VAULT_URL, DEFAULT_DID_METHOD } from '../../src/_defaultConfig'

const bip32 = require('bip32')
const secp256k1 = require('secp256k1')
const bip32fromSeedResponse = require('../factory/bip32fromSeedResponse')

const didMethod = DEFAULT_DID_METHOD
const seed = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const seedHex = seed.toString('hex')
const seedHexWithMethod = `${seedHex}++${didMethod}`
const decryptSeedResponse = {
  seed: Buffer.from(seed),
  didMethod,
  seedHexWithMethod,
}

export const authorizeVault = async () => {
  const token = 'token'

  sinon.stub(KeysService.prototype, 'decryptSeed').returns(decryptSeedResponse)
  sinon.stub(bip32, 'fromSeed').returns(bip32fromSeedResponse)
  sinon.stub(secp256k1, 'publicKeyCreate').returns('publicKey')

  const requestTokenPath = '/auth/request-token'

  nock(STAGING_VAULT_URL)
    .filteringPath(() => requestTokenPath)
    .post(requestTokenPath)
    .reply(200, { token })

  sinon.stub(ethereumjsUtils, 'ecsign').returns({ v: 'v', r: 'r', s: 's' })
  sinon.stub(ethereumjsUtils, 'toRpcSig').returns('signature')

  const validateTokenPath = '/auth/validate-token'

  nock(STAGING_VAULT_URL)
    .filteringPath(() => validateTokenPath)
    .post(validateTokenPath)
    .reply(200, {})

  return token
}
