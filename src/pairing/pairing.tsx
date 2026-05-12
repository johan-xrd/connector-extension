import { ConnectionPassword } from './components/connection-password'
import { useEffect, useRef, useState } from 'react'
import { ConnectorClient } from '@radixdlt/radix-connect-webrtc'
import { logger } from 'utils/logger'
import { config, getConnectionConfig } from 'config'
import { useConnectionsClient } from './state/connections'
import { useConnectorOptions } from './state/options'
import {
  Subscription,
  combineLatest,
  filter,
  map,
  race,
  shareReplay,
  switchMap,
  tap,
  timer,
} from 'rxjs'
import { useNavigate } from 'react-router-dom'
import { ed25519 } from '@noble/curves/ed25519'
import { getLinkingSignatureMessage } from 'crypto/get-linking-message'
import { chromeLocalStore } from 'chrome/helpers/chrome-local-store'
import { LinkClientInteraction } from 'ledger/schemas'
import { Box, Button, Text } from 'components'

const PAIRING_TIMEOUT_MS = 60_000

export const Pairing = () => {
  const [connectionPassword, setConnectionPassword] = useState<
    string | undefined
  >()
  const [error, setError] = useState<string>()
  const [retryCount, setRetryCount] = useState(0)
  const connectionsClient = useConnectionsClient()
  const connectorOptions = useConnectorOptions()
  const navigate = useNavigate()
  const [publicKey, setPublicKey] = useState<string>()
  const [signature, setSignature] = useState<string>()
  const connectorOptionsRef = useRef(connectorOptions)
  const attemptRef = useRef(0)

  useEffect(() => {
    connectorOptionsRef.current = connectorOptions
  }, [connectorOptions])

  useEffect(() => {
    let isActive = true
    let settled = false
    if (!connectorOptions) return
    setError(undefined)
    const attemptId = ++attemptRef.current

    setPublicKey(connectorOptions.publicKey)

    const connectorClient = ConnectorClient({
      source: 'extension',
      target: 'wallet',
      isInitiator: config.webRTC.isInitiator,
      logger: logger.getSubLogger({ name: 'pairing' }),
      negotiationTimeout: 10_000,
    })

    try {
      connectorClient.setConnectionConfig(getConnectionConfig(connectorOptions))
    } catch (err) {
      logger.error('Failed to set connection config', err)
    }

    const subscription = new Subscription()

    const linkClientInteraction$ = connectorClient.onMessage$.pipe(
      filter(
        (message): message is LinkClientInteraction =>
          message.discriminator === 'linkClient',
      ),
    )

    const hexConnectionPassword$ = connectorClient.connectionPassword$.pipe(
      filter(Boolean),
      tap((passwordBuffer) => {
        if (!isActive || attemptRef.current !== attemptId) return
        const message = getLinkingSignatureMessage(passwordBuffer)
        setSignature(
          Buffer.from(
            ed25519.sign(message, connectorOptionsRef.current!.privateKey),
          ).toString('hex'),
        )
      }),
      map((buffer) => buffer.toString('hex')),
      shareReplay({ bufferSize: 1, refCount: true }),
    )

    subscription.add(
      hexConnectionPassword$.subscribe((password) => {
        setConnectionPassword(password)
      }),
    )

    subscription.add(
      race(
        connectorClient.connected$.pipe(
          filter(Boolean),
          switchMap(() =>
            combineLatest([hexConnectionPassword$, linkClientInteraction$]),
          ),
        ),
        timer(PAIRING_TIMEOUT_MS).pipe(map(() => 'timeout' as const)),
      ).subscribe((result) => {
        if (!isActive || attemptRef.current !== attemptId) return
        settled = true
        if (result === 'timeout') {
          setError(
            'Connection timed out. Please make sure your wallet is scanning the QR code and try again.',
          )
          connectorClient.disconnect()
          return
        }
        const [password, interaction] = result
        connectionsClient.addOrUpdate(password, interaction).match(
          ({ isKnownConnection }) => {
            if (!isActive || attemptRef.current !== attemptId) return
            chromeLocalStore.removeItem('connectionPassword').match(
              () => {},
              (removeErr) => {
                logger.error('Failed to remove connection password', removeErr)
              },
            )
            connectorClient.disconnect()
            navigate({
              pathname: '/',
              search: `?newWallet=${interaction.publicKey}&isKnownConnection=${isKnownConnection}`,
            })
          },
          (err) => {
            if (!isActive || attemptRef.current !== attemptId) return
            logger.error('Failed to add or update connection', err)
            setError('Failed to save connection. Please try again.')
          },
        )
      }),
    )

    connectorClient
      .generateConnectionPassword()
      .andThen((buffer) => connectorClient.setConnectionPassword(buffer))
      .match(
        () => {
          if (isActive && attemptRef.current === attemptId && !settled) {
            connectorClient.connect()
          }
        },
        (err) => {
          if (!isActive || attemptRef.current !== attemptId) return
          logger.error('Failed to generate connection password', err)
          setError('Failed to generate connection password. Please try again.')
        },
      )

    return () => {
      isActive = false
      subscription.unsubscribe()
      connectorClient.disconnect()
      connectorClient.destroy()
    }
  }, [connectorOptions, connectionsClient, retryCount])

  return (
    <>
      {error ? (
        <Box textAlign="center" mt="lg">
          <Text
            style={{ color: 'white', lineHeight: '23px', marginBottom: '16px' }}
          >
            {error}
          </Text>
          <Button
            onClick={() => {
              setError(undefined)
              setRetryCount((c) => c + 1)
            }}
          >
            Try Again
          </Button>
        </Box>
      ) : connectionPassword && publicKey && signature ? (
        <ConnectionPassword
          connectionPassword={connectionPassword}
          purpose="general"
          publicKey={publicKey}
          signature={signature}
        />
      ) : (
        <Box textAlign="center" mt="lg">
          <Text style={{ color: 'white', lineHeight: '23px' }}>
            Setting up connection...
          </Text>
        </Box>
      )}
    </>
  )
}
