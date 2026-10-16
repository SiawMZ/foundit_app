package expo.modules.sharereceiver

import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Receives text shared to the app through Android's share sheet (ACTION_SEND, text/plain).
 * - Cold start: JS asks for the launch intent's text with getInitialShare().
 * - App already running: the new intent is forwarded as an "onShare" event.
 */
class ShareReceiverModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ShareReceiver")

    Events("onShare")

    Function("getInitialShare") {
      val activity = appContext.currentActivity ?: return@Function null
      val text = sharedText(activity.intent) ?: return@Function null
      // Consume it so a JS reload doesn't save the same link again.
      activity.intent = Intent(activity.intent).setAction(Intent.ACTION_MAIN)
      text
    }

    OnNewIntent { intent ->
      val text = sharedText(intent) ?: return@OnNewIntent
      sendEvent("onShare", mapOf("text" to text))
    }
  }

  private fun sharedText(intent: Intent?): String? {
    if (intent?.action != Intent.ACTION_SEND) return null
    val text = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim()
    if (text.isNullOrEmpty()) return null
    // Some apps put the post title in the subject and only the URL in the text.
    val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)?.trim()
    return if (!subject.isNullOrEmpty() && !text.contains(subject)) "$subject\n$text" else text
  }
}
