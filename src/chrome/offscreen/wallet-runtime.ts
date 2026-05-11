import { logger as utilsLogger } from 'utils/logger'
import { OffscreenMessageHandler } from 'chrome/offscreen/message-handler'
import { MessageClient } from 'chrome/messages/message-client'
import { Message } from 'chrome/messages/_types'
import { LogsClient } from './logs-client'
import { WalletConnectionClient } from './wallet-connection/wallet-connection-client'
import { walletConnectionClientFactory } from './wallet-connection/factory'
import { OffscreenInitializationMessages } from './helpers/offscreen-initialization-messages'

export type WalletRuntime = ReturnType<typeof initWalletRuntime>

export const initWalletRuntime = () => {
  const logsClient = LogsClient()

  utilsLogger.attachTransport((logObj) => {
    logsClient.add(logObj)
  })

  const logger = utilsLogger.getSubLogger({ name: 'offScreen' })

  const connections = new Map<string, WalletConnectionClient>()

  const messageClient = MessageClient(
    OffscreenMessageHandler({
      connectionsMap: connections,
      logger,
      walletConnectionClientFactory,
      logsClient,
    }),
    'offScreen',
    { logger },
  )

  const messageListener = (
    message: Message,
    sender: chrome.runtime.MessageSender,
  ) => {
    messageClient.onMessage(message, sender.tab?.id)
  }

  chrome.runtime.onMessage.addListener(messageListener)

  const messages = OffscreenInitializationMessages(messageClient)

  messages.options()
  messages.sessionRouterData()
  messages.connections()

  return {
    connections,
    messageClient,
    destroy: () => {
      chrome.runtime.onMessage.removeListener(messageListener)
      messageClient.destroy()
    },
  }
}
