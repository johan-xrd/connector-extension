import { dAppEvent } from 'chrome/dapp/_types'
import { safeCloneInto } from 'utils/safe-clone-into'

export const handleOutboundMessage = async (message: any) => {
  if (message.type === 'sendMessageToDapp')
    window.dispatchEvent(
      new CustomEvent(dAppEvent.receive, {
        detail: safeCloneInto(message.data, window),
      }),
    )
}
