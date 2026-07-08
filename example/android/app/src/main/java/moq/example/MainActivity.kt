package moq.example

import android.content.res.Configuration
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.util.TypedValue
import androidx.core.view.WindowInsetsControllerCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun getMainComponentName(): String = "MoQExample"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  // The manifest handles uiMode changes (no activity recreation), so window
  // theming resolved at creation goes stale on a live light/dark toggle: the
  // status bar strip keeps the old windowBackground and icon appearance.
  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      theme.rebase()
    }
    val background = TypedValue()
    if (theme.resolveAttribute(android.R.attr.windowBackground, background, true)) {
      if (background.resourceId != 0) {
        window.setBackgroundDrawableResource(background.resourceId)
      } else {
        window.setBackgroundDrawable(ColorDrawable(background.data))
      }
    }

    val darkMode =
        newConfig.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
    WindowInsetsControllerCompat(window, window.decorView).isAppearanceLightStatusBars = !darkMode
  }
}
