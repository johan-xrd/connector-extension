import { createMessage } from 'chrome/messages/create-message'
import { MessageClient } from 'chrome/messages/message-client'
import { ConnectorExtensionOptions, getExtensionOptions } from 'options'
import { SessionId, WalletPublicKey, getSessionRouterData } from '../session-router'
import { Connections } from 'pairing/state/connections'
import { MessageSource } from 'chrome/messages/_types'
import { getConnections } from 'chrome/helpers/get-connections'

/**
 * This section of code handles the retrieval of important data from the background page
 * in order to provide necessary information to the offscreen page.
 *
 * The offscreen page does not have direct access to chrome.storage, so it relies on sending messages
 * to the background page to obtain the following data:
 *  - Connector Extension Options
 *  - Session Router Data
 *  - Wallet Connections
 *
 * Each function within this code block is responsible for retrieving one specific key from the chrome storage.
 */
export const OffscreenInitializationMessages = (
  messageClient: MessageClient,
  source: MessageSource = 'offScreen',
) => {
  return {
    options: () => {
      if (source === 'background') {
        getExtensionOptions().map((options) => {
          messageClient.handleMessage(
            createMessage.setConnectorExtensionOptions(source, options),
          )
        })
        return
      }
      messageClient
        .sendMessageAndWaitForConfirmation<{
          options: ConnectorExtensionOptions
        }>(createMessage.getExtensionOptions(source))
        .andThen(({ options }) =>
          messageClient.handleMessage(
            createMessage.setConnectorExtensionOptions(source, options),
          ),
        )
    },
    sessionRouterData: () => {
      if (source === 'background') {
        getSessionRouterData().map((sessionRouter) => {
          messageClient.handleMessage(
            createMessage.setSessionRouterData(sessionRouter, source),
          )
        })
        return
      }
      messageClient
        .sendMessageAndWaitForConfirmation<Record<SessionId, WalletPublicKey>>(
          createMessage.getSessionRouterData(),
        )
        .andThen((sessionRouter) =>
          messageClient.handleMessage(
            createMessage.setSessionRouterData(sessionRouter, source),
          ),
        )
    },
    connections: () => {
      if (source === 'background') {
        getConnections().map((connections) => {
          messageClient.handleMessage(
            createMessage.setConnections(source, connections),
          )
        })
        return
      }
      messageClient
        .sendMessageAndWaitForConfirmation<Connections>(
          createMessage.getConnections(source),
        )
        .andThen((connections) =>
          messageClient.handleMessage(
            createMessage.setConnections(source, connections),
          ),
        )
    },
  }
}
