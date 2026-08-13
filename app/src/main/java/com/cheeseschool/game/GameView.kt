package com.cheeseschool.game

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.tan

class GameView(context: Context, private val host: Host) : View(context), GameEngine.Events {
    interface Host {
        fun requestMath(problem: MathProblem)
        fun speakCheese()
    }

    private data class Sprite(
        val position: Vec2,
        val bitmap: Bitmap,
        val scale: Float,
        val floorLift: Float = 0f
    )

    val engine = GameEngine(this)

    private val density = resources.displayMetrics.density
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
    }
    private val depth = FloatArray(1)
    private var depthBuffer = depth
    private var lastFrameAt = SystemClock.elapsedRealtimeNanos()
    private var appPaused = false

    private val catBitmap = bitmap(R.drawable.cat_background_removed)
    private val notebookBitmap = bitmap(R.drawable.notebook)
    private val impossibleBitmap = bitmap(R.drawable.notebook_impossible)
    private val vendingBitmap = bitmap(R.drawable.vending_machine)
    private val exitLockedBitmap = bitmap(R.drawable.exit_locked)
    private val exitOpenBitmap = bitmap(R.drawable.exit_open)
    private val itemBitmaps = ItemType.entries.associateWith { bitmap(it.drawableId) }

    private var joystickPointer = -1
    private var lookPointer = -1
    private var runPointer = -1
    private var lookLastX = 0f
    private var joystickCenterX = 0f
    private var joystickCenterY = 0f
    private var joystickRadius = 0f

    private val startButton = RectF()
    private val restartButton = RectF()
    private val buyButton = RectF()
    private val inventoryRects = Array(3) { RectF() }
    private var runX = 0f
    private var runY = 0f
    private var runRadius = 0f

    init {
        isFocusable = true
        keepScreenOn = true
        contentDescription = "Cheese School game"
    }

    private fun bitmap(id: Int): Bitmap = BitmapFactory.decodeResource(resources, id)

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val now = SystemClock.elapsedRealtimeNanos()
        val dt = (now - lastFrameAt) / 1_000_000_000f
        lastFrameAt = now
        if (!appPaused) engine.update(dt)

        drawWorld(canvas)
        drawHud(canvas)
        when (engine.phase) {
            GamePhase.INTRO -> drawIntro(canvas)
            GamePhase.CAUGHT -> drawEnd(canvas, "CHEESE CAUGHT YOU", false)
            GamePhase.WON -> drawEnd(canvas, "YOU ESCAPED!", true)
            else -> Unit
        }
        if (!appPaused) postInvalidateOnAnimation()
    }

    private fun drawWorld(canvas: Canvas) {
        val width = canvas.width
        val height = canvas.height
        val horizon = height * 0.50f
        paint.shader = null
        paint.color = Color.rgb(245, 233, 208)
        canvas.drawRect(0f, 0f, width.toFloat(), horizon, paint)
        paint.color = Color.rgb(190, 170, 125)
        canvas.drawRect(0f, horizon, width.toFloat(), height.toFloat(), paint)

        if (depthBuffer.size != width) depthBuffer = FloatArray(width) { Float.POSITIVE_INFINITY }
        val columnWidth = max(2, (2f * density).toInt())
        var screenX = 0
        while (screenX < width) {
            val cameraX = 2f * (screenX + columnWidth * 0.5f) / width - 1f
            val rayAngle = engine.yaw + atan(cameraX * tan(GameEngine.FOV / 2f))
            val hit = castRay(rayAngle)
            val corrected = max(0.02f, hit.first * cos(rayAngle - engine.yaw))
            val wallHeight = min(height * 1.8f, height * 0.90f / corrected)
            val top = horizon - wallHeight * 0.5f
            val bottom = horizon + wallHeight * 0.5f
            val fog = (1f - corrected / 10f).coerceIn(0.22f, 1f)
            val base = if (hit.second) Color.rgb(174, 182, 194) else Color.rgb(197, 203, 212)
            paint.color = shade(base, fog)
            canvas.drawRect(screenX.toFloat(), top, min(width, screenX + columnWidth).toFloat(), bottom, paint)
            for (x in screenX until min(width, screenX + columnWidth)) depthBuffer[x] = corrected
            screenX += columnWidth
        }
        drawSprites(canvas, horizon)
        drawDanger(canvas)
    }

    /** Returns distance and whether the ray hit a north/south side. */
    private fun castRay(angle: Float): Pair<Float, Boolean> {
        val rayX = cos(angle)
        val rayY = sin(angle)
        var mapX = floor(engine.player.x).toInt()
        var mapY = floor(engine.player.y).toInt()
        val deltaX = if (abs(rayX) < 0.0001f) 1e6f else abs(1f / rayX)
        val deltaY = if (abs(rayY) < 0.0001f) 1e6f else abs(1f / rayY)
        val stepX: Int
        val stepY: Int
        var sideX: Float
        var sideY: Float
        if (rayX < 0f) {
            stepX = -1
            sideX = (engine.player.x - mapX) * deltaX
        } else {
            stepX = 1
            sideX = (mapX + 1f - engine.player.x) * deltaX
        }
        if (rayY < 0f) {
            stepY = -1
            sideY = (engine.player.y - mapY) * deltaY
        } else {
            stepY = 1
            sideY = (mapY + 1f - engine.player.y) * deltaY
        }
        var northSouth = false
        var distance = 12f
        repeat(64) {
            if (sideX < sideY) {
                mapX += stepX
                distance = sideX
                sideX += deltaX
                northSouth = false
            } else {
                mapY += stepY
                distance = sideY
                sideY += deltaY
                northSouth = true
            }
            if (mapY !in 0 until SchoolMap.ROWS || mapX !in 0 until SchoolMap.COLS ||
                engine.grid.getOrNull(mapY)?.getOrNull(mapX) == 1
            ) return Pair(distance, northSouth)
        }
        return Pair(distance, northSouth)
    }

    private fun drawSprites(canvas: Canvas, horizon: Float) {
        val sprites = mutableListOf<Sprite>()
        sprites += Sprite(engine.cheese, catBitmap, 0.85f)
        sprites += Sprite(engine.vending, vendingBitmap, 1.25f)
        engine.notebooks.filter { !it.collected }.forEach {
            sprites += Sprite(it.position, if (it.impossible) impossibleBitmap else notebookBitmap, 0.48f, 0.08f)
        }
        engine.pickups.filter { !it.collected }.forEach {
            sprites += Sprite(it.position, itemBitmaps.getValue(it.type), 0.48f, 0.08f)
        }
        engine.exits.forEach {
            sprites += Sprite(it, if (engine.escapeMode) exitOpenBitmap else exitLockedBitmap, 1.15f)
        }
        sprites.sortByDescending { it.position.distanceTo(engine.player) }
        sprites.forEach { drawSprite(canvas, horizon, it) }
    }

    private fun drawSprite(canvas: Canvas, horizon: Float, sprite: Sprite) {
        val dx = sprite.position.x - engine.player.x
        val dy = sprite.position.y - engine.player.y
        val distance = hypot(dx, dy)
        var angle = atan2(dy, dx) - engine.yaw
        val pi = PI.toFloat()
        while (angle > pi) angle -= 2f * pi
        while (angle < -pi) angle += 2f * pi
        if (abs(angle) > GameEngine.FOV * 0.68f || distance < 0.03f) return

        val corrected = distance * cos(angle)
        val centerX = width * 0.5f + tan(angle) * (width * 0.5f) / tan(GameEngine.FOV * 0.5f)
        if (centerX < -width * 0.5f || centerX > width * 1.5f) return
        val depthIndex = centerX.toInt().coerceIn(0, max(0, depthBuffer.lastIndex))
        if (corrected >= depthBuffer[depthIndex] + 0.08f) return

        val spriteHeight = min(height * 1.35f, height * 0.78f / max(0.08f, corrected) * sprite.scale)
        val aspect = sprite.bitmap.width.toFloat() / max(1, sprite.bitmap.height)
        val spriteWidth = spriteHeight * aspect
        val bottom = horizon + spriteHeight * (0.52f - sprite.floorLift)
        val destination = RectF(
            centerX - spriteWidth * 0.5f,
            bottom - spriteHeight,
            centerX + spriteWidth * 0.5f,
            bottom
        )
        paint.alpha = ((1f - distance / 15f).coerceIn(0.40f, 1f) * 255).toInt()
        canvas.drawBitmap(sprite.bitmap, null, destination, paint)
        paint.alpha = 255
    }

    private fun drawDanger(canvas: Canvas) {
        if (engine.danger <= 0f) return
        val radius = hypot(width.toFloat(), height.toFloat()) * 0.55f
        paint.shader = RadialGradient(
            width * 0.5f, height * 0.5f, radius,
            intArrayOf(Color.TRANSPARENT, Color.argb((100 * engine.danger).toInt(), 190, 0, 0)),
            floatArrayOf(0.35f, 1f), Shader.TileMode.CLAMP
        )
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), paint)
        paint.shader = null
    }

    private fun drawHud(canvas: Canvas) {
        val pad = 14f * density
        val boxWidth = min(width * 0.33f, 260f * density)
        val boxHeight = 106f * density
        paint.color = Color.argb(115, 0, 0, 0)
        canvas.drawRoundRect(pad, pad, pad + boxWidth, pad + boxHeight, 9f * density, 9f * density, paint)

        textPaint.textSize = min(18f * density, height * 0.036f)
        textPaint.color = Color.WHITE
        drawShadowText(canvas, "Notebooks: ${engine.score} / ${engine.totalNotebooks}", pad * 1.65f, pad * 2.2f)
        drawShadowText(canvas, "Coins: ${engine.coins}", pad * 1.65f, pad * 3.5f)
        textPaint.textSize *= 0.78f
        textPaint.color = Color.rgb(255, 234, 167)
        val objective = if (engine.escapeMode) "ESCAPE! Reach a green exit!" else "Collect every notebook."
        drawShadowText(canvas, objective, pad * 1.65f, pad * 4.65f)

        val staminaLeft = pad * 1.65f
        val staminaTop = pad * 5.15f
        val staminaWidth = boxWidth - pad * 1.25f
        paint.color = Color.argb(180, 0, 0, 0)
        canvas.drawRoundRect(staminaLeft, staminaTop, staminaLeft + staminaWidth, staminaTop + 10f * density, 5f * density, 5f * density, paint)
        paint.color = when {
            engine.exhausted -> Color.rgb(231, 76, 60)
            engine.sprinting -> Color.rgb(241, 196, 15)
            else -> Color.rgb(46, 204, 113)
        }
        canvas.drawRoundRect(staminaLeft, staminaTop, staminaLeft + staminaWidth * engine.stamina, staminaTop + 10f * density, 5f * density, 5f * density, paint)

        if (engine.phase == GamePhase.PLAYING) {
            drawControls(canvas)
            if (engine.canBuy()) drawBuyPrompt(canvas)
        }
        if (engine.message.isNotEmpty()) {
            textPaint.textSize = min(18f * density, height * 0.039f)
            textPaint.color = Color.rgb(255, 234, 167)
            textPaint.textAlign = Paint.Align.CENTER
            drawShadowText(canvas, engine.message, width * 0.5f, 42f * density)
            textPaint.textAlign = Paint.Align.LEFT
        }
    }

    private fun drawControls(canvas: Canvas) {
        joystickRadius = min(58f * density, height * 0.14f)
        joystickCenterX = 24f * density + joystickRadius
        joystickCenterY = height - 22f * density - joystickRadius
        paint.style = Paint.Style.FILL
        paint.color = Color.argb(72, 255, 255, 255)
        canvas.drawCircle(joystickCenterX, joystickCenterY, joystickRadius, paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 3f * density
        paint.color = Color.argb(150, 255, 255, 255)
        canvas.drawCircle(joystickCenterX, joystickCenterY, joystickRadius, paint)
        paint.style = Paint.Style.FILL
        val knobX = joystickCenterX + engine.joystickX * joystickRadius * 0.56f
        val knobY = joystickCenterY - engine.joystickY * joystickRadius * 0.56f
        paint.color = Color.argb(180, 255, 255, 255)
        canvas.drawCircle(knobX, knobY, joystickRadius * 0.36f, paint)

        runRadius = min(43f * density, height * 0.105f)
        runX = width - 24f * density - runRadius
        runY = height - 72f * density - runRadius
        paint.color = if (engine.sprintHeld) Color.rgb(255, 196, 90) else Color.rgb(255, 159, 104)
        canvas.drawCircle(runX, runY, runRadius, paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 3f * density
        paint.color = Color.BLACK
        canvas.drawCircle(runX, runY, runRadius, paint)
        paint.style = Paint.Style.FILL
        textPaint.textAlign = Paint.Align.CENTER
        textPaint.color = Color.rgb(35, 35, 35)
        textPaint.textSize = min(17f * density, height * 0.04f)
        canvas.drawText("RUN", runX, runY - (textPaint.ascent() + textPaint.descent()) / 2f, textPaint)

        val slotSize = min(54f * density, height * 0.13f)
        val gap = 9f * density
        val inventoryWidth = slotSize * 3 + gap * 2
        var left = width * 0.5f - inventoryWidth * 0.5f
        val top = height - slotSize - 16f * density
        repeat(3) { index ->
            val rect = inventoryRects[index]
            rect.set(left, top, left + slotSize, top + slotSize)
            paint.color = Color.argb(145, 0, 0, 0)
            canvas.drawRoundRect(rect, 9f * density, 9f * density, paint)
            val item = engine.inventory[index]
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = 2.5f * density
            paint.color = if (item == null) Color.argb(130, 255, 255, 255) else Color.rgb(251, 212, 109)
            canvas.drawRoundRect(rect, 9f * density, 9f * density, paint)
            paint.style = Paint.Style.FILL
            if (item != null) {
                val inset = 3f * density
                val imageRect = RectF(rect.left + inset, rect.top + inset, rect.right - inset, rect.bottom - inset)
                canvas.drawBitmap(itemBitmaps.getValue(item), null, imageRect, paint)
            } else {
                textPaint.color = Color.WHITE
                textPaint.textSize = 14f * density
                canvas.drawText("${index + 1}", rect.centerX(), rect.centerY() - (textPaint.ascent() + textPaint.descent()) / 2f, textPaint)
            }
            left += slotSize + gap
        }
        textPaint.textAlign = Paint.Align.LEFT
    }

    private fun drawBuyPrompt(canvas: Canvas) {
        val promptWidth = min(280f * density, width * 0.42f)
        val promptHeight = min(48f * density, height * 0.105f)
        buyButton.set(width * 0.5f - promptWidth * 0.5f, height * 0.65f, width * 0.5f + promptWidth * 0.5f, height * 0.65f + promptHeight)
        paint.color = Color.rgb(251, 212, 109)
        canvas.drawRoundRect(buyButton, 8f * density, 8f * density, paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 3f * density
        paint.color = Color.BLACK
        canvas.drawRoundRect(buyButton, 8f * density, 8f * density, paint)
        paint.style = Paint.Style.FILL
        textPaint.textAlign = Paint.Align.CENTER
        textPaint.textSize = min(16f * density, height * 0.038f)
        textPaint.color = Color.rgb(35, 35, 35)
        canvas.drawText("Buy ${engine.vendingStock.label} · 1 coin", buyButton.centerX(), buyButton.centerY() - (textPaint.ascent() + textPaint.descent()) / 2f, textPaint)
        textPaint.textAlign = Paint.Align.LEFT
    }

    private fun drawIntro(canvas: Canvas) {
        paint.color = Color.argb(244, 20, 20, 20)
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), paint)
        textPaint.textAlign = Paint.Align.CENTER
        textPaint.color = Color.WHITE
        textPaint.textSize = min(42f * density, height * 0.105f)
        drawShadowText(canvas, "CHEESE SCHOOL", width * 0.5f, height * 0.20f)
        textPaint.textSize = min(17f * density, height * 0.041f)
        textPaint.typeface = android.graphics.Typeface.DEFAULT
        val lines = listOf(
            "Find every notebook and solve its math problem.",
            "Each notebook makes Cheese faster. The third one is impossible.",
            "Move with the left stick · drag the right side to look · hold RUN.",
            "Tap an item slot to use it. Escape through a green exit."
        )
        lines.forEachIndexed { index, line ->
            canvas.drawText(line, width * 0.5f, height * (0.34f + index * 0.075f), textPaint)
        }
        val buttonWidth = min(230f * density, width * 0.40f)
        val buttonHeight = min(58f * density, height * 0.14f)
        startButton.set(width * 0.5f - buttonWidth * 0.5f, height * 0.70f, width * 0.5f + buttonWidth * 0.5f, height * 0.70f + buttonHeight)
        drawActionButton(canvas, startButton, "TAP TO START")
        textPaint.typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
        textPaint.textAlign = Paint.Align.LEFT
    }

    private fun drawEnd(canvas: Canvas, title: String, won: Boolean) {
        paint.color = if (won) Color.argb(235, 0, 145, 48) else Color.argb(240, 20, 20, 20)
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), paint)
        textPaint.textAlign = Paint.Align.CENTER
        textPaint.textSize = min(42f * density, height * 0.11f)
        textPaint.color = if (won) Color.WHITE else Color.rgb(255, 55, 55)
        drawShadowText(canvas, title, width * 0.5f, height * 0.40f)
        val buttonWidth = min(220f * density, width * 0.38f)
        val buttonHeight = min(58f * density, height * 0.14f)
        restartButton.set(width * 0.5f - buttonWidth * 0.5f, height * 0.54f, width * 0.5f + buttonWidth * 0.5f, height * 0.54f + buttonHeight)
        drawActionButton(canvas, restartButton, "PLAY AGAIN")
        textPaint.textAlign = Paint.Align.LEFT
    }

    private fun drawActionButton(canvas: Canvas, rect: RectF, label: String) {
        paint.color = Color.rgb(251, 212, 109)
        canvas.drawRoundRect(rect, 9f * density, 9f * density, paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 3f * density
        paint.color = Color.BLACK
        canvas.drawRoundRect(rect, 9f * density, 9f * density, paint)
        paint.style = Paint.Style.FILL
        textPaint.color = Color.rgb(35, 35, 35)
        textPaint.textSize = min(19f * density, height * 0.047f)
        canvas.drawText(label, rect.centerX(), rect.centerY() - (textPaint.ascent() + textPaint.descent()) / 2f, textPaint)
    }

    private fun drawShadowText(canvas: Canvas, text: String, x: Float, y: Float) {
        val original = textPaint.color
        textPaint.color = Color.BLACK
        canvas.drawText(text, x + 2f * density, y + 2f * density, textPaint)
        textPaint.color = original
        canvas.drawText(text, x, y, textPaint)
    }

    private fun shade(color: Int, factor: Float): Int {
        return Color.rgb(
            (Color.red(color) * factor).toInt(),
            (Color.green(color) * factor).toInt(),
            (Color.blue(color) * factor).toInt()
        )
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        val index = event.actionIndex
        val pointerId = event.getPointerId(index)
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> handleDown(pointerId, event.getX(index), event.getY(index))
            MotionEvent.ACTION_MOVE -> {
                for (i in 0 until event.pointerCount) handleMove(event.getPointerId(i), event.getX(i), event.getY(i))
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP -> handleUp(pointerId)
            MotionEvent.ACTION_CANCEL -> clearTouches()
        }
        return true
    }

    private fun handleDown(pointerId: Int, x: Float, y: Float) {
        when (engine.phase) {
            GamePhase.INTRO -> if (startButton.contains(x, y)) {
                performClick(); engine.startGame()
            }
            GamePhase.CAUGHT, GamePhase.WON -> if (restartButton.contains(x, y)) {
                performClick(); engine.startGame()
            }
            GamePhase.PLAYING -> {
                inventoryRects.indexOfFirst { it.contains(x, y) }.takeIf { it >= 0 }?.let {
                    performClick(); engine.useItem(it); return
                }
                if (engine.canBuy() && buyButton.contains(x, y)) {
                    performClick(); engine.buyFromVending(); return
                }
                if (hypot(x - runX, y - runY) <= runRadius * 1.25f && runPointer == -1) {
                    runPointer = pointerId
                    engine.sprintHeld = true
                    return
                }
                if (x < width * 0.43f && y > height * 0.48f && joystickPointer == -1) {
                    joystickPointer = pointerId
                    updateJoystick(x, y)
                    return
                }
                if (lookPointer == -1) {
                    lookPointer = pointerId
                    lookLastX = x
                }
            }
            else -> Unit
        }
        invalidate()
    }

    private fun handleMove(pointerId: Int, x: Float, y: Float) {
        when (pointerId) {
            joystickPointer -> updateJoystick(x, y)
            lookPointer -> {
                val dx = x - lookLastX
                lookLastX = x
                engine.turn(dx * 0.0042f)
            }
        }
    }

    private fun updateJoystick(x: Float, y: Float) {
        var dx = (x - joystickCenterX) / joystickRadius
        var dy = (joystickCenterY - y) / joystickRadius
        val length = hypot(dx, dy)
        if (length > 1f) {
            dx /= length
            dy /= length
        }
        engine.joystickX = dx
        engine.joystickY = dy
    }

    private fun handleUp(pointerId: Int) {
        when (pointerId) {
            joystickPointer -> {
                joystickPointer = -1
                engine.joystickX = 0f
                engine.joystickY = 0f
            }
            lookPointer -> lookPointer = -1
            runPointer -> {
                runPointer = -1
                engine.sprintHeld = false
            }
        }
    }

    private fun clearTouches() {
        joystickPointer = -1
        lookPointer = -1
        runPointer = -1
        engine.joystickX = 0f
        engine.joystickY = 0f
        engine.sprintHeld = false
    }

    override fun performClick(): Boolean {
        super.performClick()
        return true
    }

    fun onHostPause() {
        appPaused = true
        clearTouches()
        engine.pauseForLifecycle()
    }

    fun onHostResume() {
        appPaused = false
        lastFrameAt = SystemClock.elapsedRealtimeNanos()
        postInvalidateOnAnimation()
    }

    override fun showMath(problem: MathProblem) = host.requestMath(problem)
    override fun showMessage(message: String) = Unit
    override fun cheeseNearby() = host.speakCheese()
    override fun phaseChanged(phase: GamePhase) = invalidate()
}
