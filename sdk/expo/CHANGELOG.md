# release 0.10.0 (2020-08-17)

## Update interface

### init - Initialize from user access token

Returns SDK instance when user is logged in and throws `COR-9 / UnprocessableEntityError`
if user is logged out.

```ts
const affinityWallet = await AffinityWallet.init(options)
```

`options` - optional, if not defined default settings will be used

# release 0.5.0 (2020-07-09)

## metro.config.js update

`resolver.resolverMainFields` and `extraNodeModules.mobileRandomBytes` need to be added.

```diff
module.exports = {
  resolver: {
+   resolverMainFields: ['react-native', 'browser', 'module', 'main'],
    extraNodeModules: {
+     mobileRandomBytes: require.resolve('@affinidi/wallet-expo-sdk/mobileRandomBytes'),
      crypto: require.resolve('@affinidi/wallet-expo-sdk/isNode'),
      stream: require.resolve('stream-browserify')
    }
  }
}
```

# release 0.4.6 (2020-06-25)

## `app.json` to be extended with a postPublish hook for Sentry:

```js
"expo": {
  // ... existing configuration
  "hooks": {
    "postPublish": [
      {
        "file": "sentry-expo/upload-sourcemaps",
        "config": {
          "organization": "Affinity",
          "project": "wallet-sdk",
          "authToken": "SENTRY_TOKEN"
        }
      }
    ]
  }
}
```

# release 0.4.2 (2020-06-24)

## Update list of required polyfills to be set for mapping in `metro.config.js`:

```js
module.exports = {
  resolver: {
    extraNodeModules: {
      // Polyfills for node libraries
      mobileRandomBytes: require.resolve('@affinidi/wallet-expo-sdk/mobileRandomBytes'),
      crypto: require.resolve('@affinidi/wallet-expo-sdk/isNode'),
      stream: require.resolve('stream-browserify'),
    },
  },
}
```

# release 0.1.12 (2020-04-30)

## Export only AffinityWallet

Instead of CommonNetworkMember / Wallet / Issuer / Verifier

```ts
import { AffinityWallet } from '@affinityprojecthub/wallet-browser-sdk'
```

# release 0.1.11 (2020-04-29)

## Update README

# release 0.1.10 (2020-04-28)

## Add interface

### init - Initialize from user access token

Returns SDK instance when user is logged in and throws `COR-9 / UnprocessableEntityError`
if user is logged out.

```ts
const affinityWallet = await AffinityWallet.init(options)
```

`options` - optional, if not defined default settings will be used
