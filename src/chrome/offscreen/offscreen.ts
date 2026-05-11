import { initWalletRuntime } from './wallet-runtime'
import { WalletConnectionClient } from './wallet-connection/wallet-connection-client'
import { MessageClient } from 'chrome/messages/message-client'
import { createChromeHandler } from 'trpc-chrome/adapter'
import { offscreenRouter } from './router/router'
import { backgroundClient } from './router/clients/background'

declare global {
  interface Window {
    radix: {
      messageClient: MessageClient
      connections: Map<string, WalletConnectionClient>
      backgroundClient: typeof backgroundClient
    }
  }
}

const runtime = initWalletRuntime()

window.radix = {
  messageClient: runtime.messageClient,
  connections: runtime.connections,
  backgroundClient: backgroundClient,
}

createChromeHandler({
  router: offscreenRouter,
})
