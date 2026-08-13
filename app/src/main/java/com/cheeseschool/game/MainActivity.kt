package com.cheeseschool.game

import android.app.Activity
import android.app.AlertDialog
import android.graphics.Color
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import java.util.Locale

class MainActivity : Activity(), GameView.Host, TextToSpeech.OnInitListener {
    private lateinit var gameView: GameView
    private var textToSpeech: TextToSpeech? = null
    private var ttsReady = false
    private var mathDialog: AlertDialog? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enterImmersiveMode()
        gameView = GameView(this, this)
        setContentView(gameView)
        textToSpeech = TextToSpeech(this, this)
    }

    private fun enterImmersiveMode() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            window.insetsController?.let { controller ->
                controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                controller.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                    View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                )
        }
    }

    override fun requestMath(problem: MathProblem) {
        if (isFinishing || mathDialog?.isShowing == true) return
        val padding = (24 * resources.displayMetrics.density).toInt()
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(padding, padding, padding, padding)
            setBackgroundColor(Color.rgb(45, 90, 39))
        }
        val question = TextView(this).apply {
            text = problem.text
            textSize = if (problem.impossible) 27f else 34f
            setTextColor(if (problem.impossible) Color.rgb(255, 90, 90) else Color.WHITE)
            gravity = Gravity.CENTER
            typeface = android.graphics.Typeface.MONOSPACE
            setPadding(0, 0, 0, padding / 2)
        }
        val answer = EditText(this).apply {
            hint = if (problem.impossible) "???" else getString(R.string.answer_hint)
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_SIGNED
            setTextColor(Color.WHITE)
            setHintTextColor(Color.LTGRAY)
            gravity = Gravity.CENTER
            textSize = 24f
            setSingleLine(true)
        }
        layout.addView(question, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        layout.addView(answer, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        val dialog = AlertDialog.Builder(this)
            .setTitle(R.string.solve_problem)
            .setView(layout)
            .setCancelable(false)
            .setPositiveButton(R.string.submit_answer, null)
            .create()
        mathDialog = dialog
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                if (!problem.impossible && answer.text.toString().trim().toIntOrNull() == null) {
                    answer.error = "Type an answer"
                    return@setOnClickListener
                }
                dialog.dismiss()
                gameView.engine.submitAnswer(answer.text.toString())
                enterImmersiveMode()
            }
            answer.requestFocus()
            answer.postDelayed({
                val input = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
                input.showSoftInput(answer, InputMethodManager.SHOW_IMPLICIT)
            }, 150)
        }
        dialog.setOnDismissListener { mathDialog = null }
        dialog.show()
    }

    override fun speakCheese() {
        if (ttsReady) {
            textToSpeech?.speak("cheese", TextToSpeech.QUEUE_FLUSH, null, "cheese-nearby")
        }
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            val result = textToSpeech?.setLanguage(Locale.US)
            ttsReady = result != null &&
                result != TextToSpeech.LANG_MISSING_DATA &&
                result != TextToSpeech.LANG_NOT_SUPPORTED
            textToSpeech?.setPitch(0.75f)
            textToSpeech?.setSpeechRate(0.9f)
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus && mathDialog?.isShowing != true) enterImmersiveMode()
    }

    override fun onPause() {
        gameView.onHostPause()
        textToSpeech?.stop()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        gameView.onHostResume()
        enterImmersiveMode()
    }

    override fun onDestroy() {
        mathDialog?.dismiss()
        textToSpeech?.stop()
        textToSpeech?.shutdown()
        super.onDestroy()
    }
}
